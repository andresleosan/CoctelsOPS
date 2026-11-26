import { beforeEach, describe, expect, it, vi } from "vitest";

const { collection, runTransaction, transactionCreate, transactionGet, getProductById, productFromData } = vi.hoisted(() => ({
  collection: vi.fn(),
  runTransaction: vi.fn(),
  transactionCreate: vi.fn(),
  transactionGet: vi.fn(),
  getProductById: vi.fn(),
  productFromData: vi.fn(),
}));

const orderReference = { id: "pedido-1" };
const auditReference = { id: "auditoria-1" };
const movementReference = { id: "movimiento-1" };
const notificationReference = { id: "notificacion-1" };
const productReference = { id: "fresa" };

vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: () => ({ collection, runTransaction }) }));
vi.mock("@/lib/firestore/products", () => ({ getProductById, productFromData }));
vi.mock("@/lib/firestore/configuration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/configuration")>();
  return {
    ...actual,
    getStoreConfiguration: vi.fn(async () => ({
      ...actual.DEFAULT_STORE_CONFIGURATION,
      businessHours: [],
      emergencyPause: { active: false },
    })),
  };
});

import { createOrder } from "@/lib/firestore/orders";

describe("auditoría de creación de pedidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collection.mockImplementation((name: string) => ({
      doc: () => name === "pedidos" ? orderReference : name === "auditoria" ? auditReference : name === "inventario_movimientos" ? movementReference : name === "notificaciones" ? notificationReference : productReference,
    }));
    const product = { id: "fresa", name: "Fresa", description: "", price: 10000, image: "/catalog-placeholder.svg", category: "granizado", availableFlavors: [], availableAddOns: [], stock: 10, active: true, featured: false };
    transactionGet.mockImplementation(async (reference: { id: string }) => reference === orderReference ? { exists: false } : { exists: true, data: () => product });
    runTransaction.mockImplementation(async (callback: (transaction: unknown) => Promise<unknown>) => callback({ create: transactionCreate, update: vi.fn(), get: transactionGet }));
    getProductById.mockResolvedValue(product);
    productFromData.mockReturnValue(product);
  });

  it("no escribe promotionCode undefined en la auditoría sin promoción", async () => {
    await createOrder({ uid: "customer-1" } as never, {
      customerName: "Ana Perez",
      phone: "324 555 0000",
      address: "Carrera 37 # 66-36",
      items: [{ productId: "fresa", quantity: 1, customization: { size: "Medium", flavors: [], addOns: [] } }],
    });

    const auditPayload = transactionCreate.mock.calls.find(([reference]) => reference === auditReference)?.[1] as { changes?: Record<string, unknown> };
    expect(auditPayload.changes).not.toHaveProperty("promotionCode");
  });
});
