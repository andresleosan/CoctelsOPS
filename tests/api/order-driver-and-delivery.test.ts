import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  collection,
  runTransaction,
  transactionCreate,
  transactionUpdate,
  transactionGet,
  getProductById,
  productFromData,
  getStoreConfiguration,
  requirePermission,
} = vi.hoisted(() => ({
  collection: vi.fn(),
  runTransaction: vi.fn(),
  transactionCreate: vi.fn(),
  transactionUpdate: vi.fn(),
  transactionGet: vi.fn(),
  getProductById: vi.fn(),
  productFromData: vi.fn(),
  getStoreConfiguration: vi.fn(),
  requirePermission: vi.fn(),
}));

const references = {
  pedidos: { id: "pedido-zone-1" },
  productos: { id: "fresa" },
  promociones: { id: "promo-1" },
  inventario_movimientos: { id: "movimiento-1" },
  auditoria: { id: "auditoria-1" },
  notificaciones: { id: "notificacion-1" },
};

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({ collection, runTransaction }),
}));
vi.mock("@/lib/firestore/products", () => ({ getProductById, productFromData }));
vi.mock("@/lib/firestore/configuration", () => ({ getStoreConfiguration }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission,
  };
});

import { PATCH as PATCH_ASSIGN_DRIVER } from "@/app/api/pedidos/[id]/repartidor/route";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { createOrder } from "@/lib/firestore/orders";

const baseProduct = {
  id: "fresa",
  name: "Granizado Fresa",
  description: "",
  price: 15000,
  image: "/catalog-placeholder.svg",
  category: "granizado",
  availableFlavors: ["Fresa"],
  availableAddOns: [],
  availableSizes: [{ name: "16 oz", price: 15000 }],
  stock: 20,
  active: true,
  featured: false,
  negocioId: "coctels-ops",
};

const storeConfigWithRates = {
  whatsappNumber: "573001112233",
  businessHours: [],
  deliveryZones: ["Laureles", "El Poblado"],
  deliveryZoneRates: [
    {
      id: "laureles",
      name: "Laureles",
      feeCop: 4000,
      estimatedMinutes: 30,
      freeDeliveryMinCop: 45000,
      active: true,
    },
    {
      id: "envigado",
      name: "Envigado",
      feeCop: 9000,
      estimatedMinutes: 50,
      active: false,
    },
  ],
  estimatedDeliveryMinutes: 45,
  messages: {
    orderReceived: "Recibido",
    orderStatus: "Estado",
    unavailable: "No disponible",
  },
};

describe("Server-side delivery zone calculation & driver assignment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collection.mockImplementation((name: keyof typeof references) => ({
      doc: () => references[name] ?? { id: "doc-1" },
    }));
    getProductById.mockResolvedValue(baseProduct);
    productFromData.mockReturnValue(baseProduct);
    getStoreConfiguration.mockResolvedValue(storeConfigWithRates);
    transactionGet.mockImplementation(async (reference: { id: string }) =>
      reference === references.pedidos
        ? { exists: false, data: () => undefined }
        : { exists: true, data: () => baseProduct },
    );
    runTransaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          create: transactionCreate,
          update: transactionUpdate,
          get: transactionGet,
        }),
    );
  });

  it("computes deliveryFee on the server and rejects inactive or unknown zones", async () => {
    const order = await createOrder(
      { uid: "cli-1" } as never,
      {
        customerName: "Ana",
        phone: "3001112233",
        address: "Circular 4 # 70-10",
        serviceType: "delivery",
        deliveryZoneId: "laureles",
        items: [
          {
            productId: "fresa",
            quantity: 2,
            customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
          },
        ],
      },
      { idempotencyKey: "zone-key-1" },
    );

    expect(order.subtotal).toBe(30000);
    expect(order.deliveryFee).toBe(4000);
    expect(order.deliveryZoneName).toBe("Laureles");
    expect(order.estimatedDeliveryMinutes).toBe(30);
    expect(order.total).toBe(34000);

    const freeOrder = await createOrder(
      { uid: "cli-1" } as never,
      {
        customerName: "Ana",
        phone: "3001112233",
        address: "Circular 4 # 70-10",
        serviceType: "delivery",
        deliveryZoneId: "laureles",
        items: [
          {
            productId: "fresa",
            quantity: 3,
            customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
          },
        ],
      },
      { idempotencyKey: "zone-key-2" },
    );
    expect(freeOrder.subtotal).toBe(45000);
    expect(freeOrder.deliveryFee).toBe(0);
    expect(freeOrder.total).toBe(45000);

    await expect(
      createOrder(
        { uid: "cli-1" } as never,
        {
          customerName: "Ana",
          phone: "3001112233",
          address: "Calle 30 # 40-10",
          serviceType: "delivery",
          deliveryZoneId: "envigado",
          items: [
            {
              productId: "fresa",
              quantity: 1,
              customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
            },
          ],
        },
        { idempotencyKey: "zone-key-3" },
      ),
    ).rejects.toThrow(/zona de entrega/i);
  });

  it("ignores deliveryZoneId when serviceType is mesa", async () => {
    const mesaOrder = await createOrder(
      { uid: "cli-1" } as never,
      {
        customerName: "Mesa 2",
        phone: "3001112233",
        address: "Mesa 2 - Consumo en local",
        serviceType: "mesa",
        tableNumber: "2",
        deliveryZoneId: "laureles",
        items: [
          {
            productId: "fresa",
            quantity: 1,
            customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
          },
        ],
      },
      { idempotencyKey: "zone-key-mesa" },
    );

    expect(mesaOrder.deliveryZoneId).toBeUndefined();
    expect(mesaOrder.deliveryZoneName).toBeUndefined();
    expect(mesaOrder.deliveryFee).toBeUndefined();
    expect(mesaOrder.total).toBe(15000);
  });

  it("assigns and unassigns a delivery driver via PATCH /api/pedidos/[id]/repartidor with tenant isolation", async () => {
    const activeDeliveryDoc = {
      clienteUid: "cli-1",
      customerName: "Ana",
      phone: "3001112233",
      address: "Circular 4 # 70-10",
      serviceType: "delivery",
      negocioId: "coctels-ops",
      items: [],
      subtotal: 30000,
      total: 34000,
      status: "preparando",
      createdAt: "2026-11-24T19:00:00.000Z",
      updatedAt: "2026-11-24T19:00:00.000Z",
      audit: { createdByUid: "cli-1", createdAt: "2026-11-24T19:00:00.000Z" },
    };

    requirePermission.mockResolvedValue({
      uid: "staff-1",
      token: { uid: "staff-1" },
      profile: {
        uid: "staff-1",
        accountType: "staff",
        negocioId: "coctels-ops",
        active: true,
        permissions: ["pedidos.update"],
      },
      permissions: ["pedidos.update"],
    });
    transactionGet.mockResolvedValue({
      exists: true,
      id: "pedido-zone-1",
      data: () => activeDeliveryDoc,
    });

    const assignResponse = await PATCH_ASSIGN_DRIVER(
      new Request("http://localhost/api/pedidos/pedido-zone-1/repartidor", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          driver: { uid: "drv-1", name: "Camilo Moto", phone: "3112223344" },
        }),
      }),
      { params: Promise.resolve({ id: "pedido-zone-1" }) },
    );

    expect(assignResponse.status).toBe(200);
    const assignBody = (await assignResponse.json()) as {
      order: { assignedDriver?: { name: string; uid?: string } };
    };
    expect(assignBody.order.assignedDriver?.name).toBe("Camilo Moto");
    expect(assignBody.order.assignedDriver?.uid).toBe("drv-1");

    const unassignResponse = await PATCH_ASSIGN_DRIVER(
      new Request("http://localhost/api/pedidos/pedido-zone-1/repartidor", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driver: null }),
      }),
      { params: Promise.resolve({ id: "pedido-zone-1" }) },
    );
    expect(unassignResponse.status).toBe(200);
    const unassignBody = (await unassignResponse.json()) as {
      order: { assignedDriver?: unknown };
    };
    expect(unassignBody.order.assignedDriver).toBeUndefined();

    // Cross-tenant rejection
    requirePermission.mockResolvedValueOnce({
      uid: "other-staff",
      token: { uid: "other-staff" },
      profile: {
        uid: "other-staff",
        accountType: "staff",
        negocioId: "otro-local",
        active: true,
        permissions: ["pedidos.update"],
      },
      permissions: ["pedidos.update"],
    });
    const crossTenantResponse = await PATCH_ASSIGN_DRIVER(
      new Request("http://localhost/api/pedidos/pedido-zone-1/repartidor", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driver: { name: "Intruso" } }),
      }),
      { params: Promise.resolve({ id: "pedido-zone-1" }) },
    );
    expect(crossTenantResponse.status).toBe(403);

    // Non-delivery order rejection
    transactionGet.mockResolvedValueOnce({
      exists: true,
      id: "pedido-mesa",
      data: () => ({ ...activeDeliveryDoc, serviceType: "mesa", tableNumber: "3" }),
    });
    const mesaResponse = await PATCH_ASSIGN_DRIVER(
      new Request("http://localhost/api/pedidos/pedido-mesa/repartidor", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driver: { name: "Camilo" } }),
      }),
      { params: Promise.resolve({ id: "pedido-mesa" }) },
    );
    expect(mesaResponse.status).toBe(422);

    // Unauthorized rejection
    requirePermission.mockRejectedValueOnce(new AuthorizationError(403, "Sin permiso"));
    const forbiddenResponse = await PATCH_ASSIGN_DRIVER(
      new Request("http://localhost/api/pedidos/pedido-zone-1/repartidor", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driver: { name: "Camilo" } }),
      }),
      { params: Promise.resolve({ id: "pedido-zone-1" }) },
    );
    expect(forbiddenResponse.status).toBe(403);
  });
});
