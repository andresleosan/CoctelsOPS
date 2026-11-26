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
  updateEmergencyPause,
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
  updateEmergencyPause: vi.fn(),
  requirePermission: vi.fn(),
}));

const references = {
  pedidos: { id: "pedido-sched-1" },
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
vi.mock("@/lib/firestore/configuration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/configuration")>();
  return {
    ...actual,
    getStoreConfiguration,
    updateEmergencyPause,
  };
});
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission,
  };
});

import { PATCH as PATCH_ADMIN_CONFIG } from "@/app/api/admin/configuration/route";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { createOrder } from "@/lib/firestore/orders";
import { DEFAULT_STORE_CONFIGURATION } from "@/types/operations";

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

const baseOrderInput = {
  customerName: "Ana Pérez",
  phone: "3001112233",
  address: "Calle 10 # 20-30",
  serviceType: "delivery" as const,
  items: [
    {
      productId: "fresa",
      quantity: 1,
      customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
    },
  ],
};

describe("Server-side schedule enforcement & emergency pause PATCH API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collection.mockImplementation((name: keyof typeof references) => ({
      doc: () => references[name] ?? { id: "doc-1" },
    }));
    getProductById.mockResolvedValue(baseProduct);
    productFromData.mockReturnValue(baseProduct);
    getStoreConfiguration.mockResolvedValue(DEFAULT_STORE_CONFIGURATION);
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

  it("rechaza pedidos inmediatos fuera de horario o con barra pausada y acepta pedidos programados válidos", async () => {
    // Jueves 08:00 Bogotá (13:00Z) - local cerrado (abre 10:00)
    const closedNow = new Date("2026-11-26T13:00:00.000Z");

    await expect(
      createOrder({ uid: "cli-1" } as never, baseOrderInput, {
        idempotencyKey: "closed-immediate-1",
        now: closedNow,
      }),
    ).rejects.toThrow(/cerrado/i);

    // Pausa de emergencia activa
    getStoreConfiguration.mockResolvedValueOnce({
      ...DEFAULT_STORE_CONFIGURATION,
      emergencyPause: { active: true, reason: "Barra saturada en hora pico" },
    });
    const openNow = new Date("2026-11-26T19:00:00.000Z"); // 14:00 Bogotá
    await expect(
      createOrder({ uid: "cli-1" } as never, baseOrderInput, {
        idempotencyKey: "paused-immediate-1",
        now: openNow,
      }),
    ).rejects.toThrow(/Barra saturada/i);

    // Pedido programado fuera de horario (23:30 Bogotá -> 04:30Z del día siguiente)
    await expect(
      createOrder(
        { uid: "cli-1" } as never,
        {
          ...baseOrderInput,
          scheduledFor: "2026-11-27T04:30:00.000Z",
        },
        { idempotencyKey: "invalid-sched-1", now: closedNow },
      ),
    ).rejects.toThrow(/horario de atención/i);

    // Pedido programado válido dentro de horario (15:00 Bogotá -> 20:00Z)
    const scheduledOrder = await createOrder(
      { uid: "cli-1" } as never,
      {
        ...baseOrderInput,
        scheduledFor: "2026-11-26T20:00:00.000Z",
      },
      { idempotencyKey: "valid-sched-1", now: closedNow },
    );
    expect(scheduledOrder.fulfillmentMode).toBe("scheduled");
    expect(scheduledOrder.scheduledFor).toBe("2026-11-26T20:00:00.000Z");
  });

  it("permite a staff activo de barra registrar pedidos inmediatos POS aunque el local esté cerrado", async () => {
    const closedNow = new Date("2026-11-26T13:00:00.000Z");
    const staffActor = {
      uid: "staff-1",
      profile: {
        uid: "staff-1",
        accountType: "staff",
        active: true,
      },
    };

    const order = await createOrder(
      staffActor as never,
      { ...baseOrderInput, serviceType: "pickup", address: "Recoger en Barra" },
      { idempotencyKey: "staff-pos-1", now: closedNow },
    );

    expect(order.id).toBe("pedido-sched-1");
    expect(order.fulfillmentMode).toBe("now");
  });

  it("permite pausar/reanudar con configuracion.write o pedidos.update y rechaza sin permisos o con payload inválido", async () => {
    const pausedConfig = {
      ...DEFAULT_STORE_CONFIGURATION,
      emergencyPause: { active: true, reason: "Barra al límite" },
    };
    updateEmergencyPause.mockResolvedValue(pausedConfig);

    // 1. Staff sin configuracion.write pero con pedidos.update -> permitido
    requirePermission
      .mockRejectedValueOnce(new AuthorizationError(403, "Sin configuracion.write"))
      .mockResolvedValueOnce({ uid: "staff-bar-1", permissions: ["pedidos.update"] });

    const staffRes = await PATCH_ADMIN_CONFIG(
      new Request("http://localhost/api/admin/configuration", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: true, reason: "Barra al límite", durationMinutes: 30 }),
      }),
    );
    expect(staffRes.status).toBe(200);
    expect(updateEmergencyPause).toHaveBeenCalledWith(
      { active: true, reason: "Barra al límite", durationMinutes: 30 },
      "staff-bar-1",
    );

    // 2. Cliente sin ninguno de los dos permisos -> 403
    requirePermission
      .mockRejectedValueOnce(new AuthorizationError(403, "Sin configuracion.write"))
      .mockRejectedValueOnce(new AuthorizationError(403, "Sin pedidos.update"));

    const forbiddenRes = await PATCH_ADMIN_CONFIG(
      new Request("http://localhost/api/admin/configuration", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: true }),
      }),
    );
    expect(forbiddenRes.status).toBe(403);

    // 3. Payload con duración inválida -> 422
    requirePermission.mockResolvedValueOnce({ uid: "admin-1", permissions: [] });
    const invalidRes = await PATCH_ADMIN_CONFIG(
      new Request("http://localhost/api/admin/configuration", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: true, durationMinutes: 5 }),
      }),
    );
    expect(invalidRes.status).toBe(422);
  });
});
