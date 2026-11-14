import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminDbMock } = vi.hoisted(() => ({
  getAdminDbMock: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: getAdminDbMock,
}));

import { AuthorizationError } from "@/lib/auth/verify-request";
import { updateOrderStatus } from "@/lib/firestore/orders";
import {
  buildOrderEscandalloAndConsumptions,
  calculateRecipeCost,
  convertRecipeQuantityToSupplyUnit,
  createRecipe,
  matchRecipeForOrderItem,
  RecipeConflictError,
  RecipeValidationError,
} from "@/lib/firestore/recipes";
import { toCustomerOrder } from "@/lib/orders/customer-order";
import type { VerifiedUser } from "@/types/auth";
import type { Order } from "@/types/orders";
import type { ProductRecipe } from "@/types/recipes";
import { calculateSupplyStatus, type SupplyItem } from "@/types/supplies";

type StoreDoc = Record<string, Record<string, unknown>>;

function createMemoryFirestore(initial?: Record<string, StoreDoc>) {
  const stores: Record<string, StoreDoc> = {
    pedidos: { ...(initial?.pedidos ?? {}) },
    productos: { ...(initial?.productos ?? {}) },
    insumos: { ...(initial?.insumos ?? {}) },
    recetas: { ...(initial?.recetas ?? {}) },
    inventario_movimientos: { ...(initial?.inventario_movimientos ?? {}) },
    notificaciones: { ...(initial?.notificaciones ?? {}) },
    auditoria: { ...(initial?.auditoria ?? {}) },
  };
  let autoId = 0;
  const txOps: string[] = [];

  function makeDocRef(colName: string, docId: string) {
    return {
      id: docId,
      path: `${colName}/${docId}`,
      async get() {
        const record = stores[colName]?.[docId];
        return {
          id: docId,
          exists: Boolean(record),
          data: () => (record ? { ...record } : undefined),
        };
      },
      async set(data: Record<string, unknown>) {
        if (!stores[colName]) stores[colName] = {};
        stores[colName][docId] = { ...data };
      },
      async update(data: Record<string, unknown>) {
        if (!stores[colName]?.[docId]) throw new Error(`Missing doc ${colName}/${docId}`);
        stores[colName][docId] = { ...stores[colName][docId], ...data };
      },
      async delete() {
        if (stores[colName]) delete stores[colName][docId];
      },
    };
  }

  function makeCollection(colName: string) {
    return {
      doc(id?: string) {
        const docId = id ?? `${colName}-auto-${++autoId}`;
        return makeDocRef(colName, docId);
      },
      where(field: string, op: string, value: unknown) {
        return {
          async get() {
            const entries = Object.entries(stores[colName] ?? {}).filter(([, data]) => {
              if (op === "==") return data[field] === value;
              if (op === "in" && Array.isArray(value)) return value.includes(data[field]);
              return false;
            });
            return {
              docs: entries.map(([id, data]) => ({
                id,
                exists: true,
                data: () => ({ ...data }),
              })),
            };
          },
        };
      },
    };
  }

  const db = {
    collection: (name: string) => makeCollection(name),
    async runTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      const stagedWrites: Array<() => void> = [];
      let sawWrite = false;
      const tx = {
        async get(ref: { path: string; get: () => Promise<unknown> }) {
          if (sawWrite) {
            throw new Error("Firestore transaction invariant violated: read after write");
          }
          txOps.push(`get:${ref.path}`);
          return ref.get();
        },
        update(ref: { path: string; update: (d: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) {
          sawWrite = true;
          txOps.push(`update:${ref.path}`);
          stagedWrites.push(() => {
            void ref.update(data);
          });
        },
        create(ref: { path: string; set: (d: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) {
          sawWrite = true;
          txOps.push(`create:${ref.path}`);
          stagedWrites.push(() => {
            void ref.set(data);
          });
        },
        set(ref: { path: string; set: (d: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) {
          sawWrite = true;
          txOps.push(`set:${ref.path}`);
          stagedWrites.push(() => {
            void ref.set(data);
          });
        },
      };
      const result = await callback(tx);
      for (const apply of stagedWrites) apply();
      return result;
    },
  };

  return { db, stores, txOps };
}

function makeCaller(overrides?: Partial<VerifiedUser["profile"]>): VerifiedUser {
  return {
    uid: "barman-1",
    token: {
      uid: "barman-1",
      email: "barman@coctelsops.com",
      email_verified: true,
      aud: "test",
      auth_time: 0,
      exp: 9999999999,
      firebase: { identities: {}, sign_in_provider: "password" },
      iat: 0,
      iss: "test",
      sub: "barman-1",
    },
    permissions: ["inventario.read", "inventario.write", "pedidos.read", "pedidos.update"],
    profile: {
      uid: "barman-1",
      email: "barman@coctelsops.com",
      displayName: "Barman Principal",
      photoURL: null,
      telefono: null,
      addresses: [],
      active: true,
      accountType: "staff",
      roleIds: ["barman"],
      permissions: ["inventario.read", "inventario.write", "pedidos.read", "pedidos.update"],
      negocioId: "coctels-ops",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

function makeSupply(id: string, name: string, unit: SupplyItem["unit"], costPerUnit: number, currentStock: number, minStock = 100): SupplyItem {
  return {
    id,
    negocioId: "coctels-ops",
    name,
    category: "licor",
    unit,
    currentStock,
    minStock,
    costPerUnit,
    status: calculateSupplyStatus(currentStock, minStock),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeSampleOrder(status: Order["status"] = "confirmado"): Order {
  return {
    id: "ord-1001",
    clienteUid: "cli-9",
    customerName: "Laura Gómez",
    phone: "3001112233",
    address: "Mesa 4",
    negocioId: "coctels-ops",
    items: [
      {
        productId: "prod-mojito",
        name: "Mojito Clásico",
        quantity: 2,
        unitPrice: 22000,
        subtotal: 44000,
        customization: {
          size: "16 oz",
          flavors: ["Limón"],
          addOns: ["Shot extra"],
        },
      },
    ],
    subtotal: 44000,
    total: 44000,
    status,
    createdAt: "2026-05-01T18:00:00.000Z",
    updatedAt: "2026-05-01T18:05:00.000Z",
    statusHistory: [
      { status: "pendiente", actorUid: "cli-9", at: "2026-05-01T18:00:00.000Z" },
      { status: "confirmado", actorUid: "barman-1", at: "2026-05-01T18:05:00.000Z" },
    ],
    audit: {
      createdByUid: "cli-9",
      createdAt: "2026-05-01T18:00:00.000Z",
      updatedByUid: "barman-1",
      updatedAt: "2026-05-01T18:05:00.000Z",
    },
  };
}

describe("escandallo unit conversions & recipe matching", () => {
  it("converts oz, l, botellas, kg and rejects incompatible dimensions", () => {
    expect(convertRecipeQuantityToSupplyUnit(2, "oz", "ml")).toBe(60);
    expect(convertRecipeQuantityToSupplyUnit(1.5, "oz", "botella", 750)).toBe(0.06);
    expect(convertRecipeQuantityToSupplyUnit(150, "ml", "l")).toBe(0.15);
    expect(convertRecipeQuantityToSupplyUnit(250, "g", "kg")).toBe(0.25);
    expect(convertRecipeQuantityToSupplyUnit(1, "unidad", "unidad")).toBe(1);

    expect(() => convertRecipeQuantityToSupplyUnit(2, "oz", "g")).toThrow(RecipeValidationError);
    expect(() => convertRecipeQuantityToSupplyUnit(1, "unidad", "ml")).toThrow(RecipeValidationError);
  });

  it("matches exact or normalized presentation before wildcard", () => {
    const recipes: ProductRecipe[] = [
      {
        id: "rec-wild",
        negocioId: "coctels-ops",
        productId: "prod-mojito",
        productName: "Mojito",
        presentation: "*",
        presentationKey: "*",
        ingredients: [],
        addOnIngredients: [],
        yieldUnits: 1,
        active: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "rec-16",
        negocioId: "coctels-ops",
        productId: "prod-mojito",
        productName: "Mojito",
        presentation: "16 oz",
        presentationKey: "16 oz",
        ingredients: [],
        addOnIngredients: [],
        yieldUnits: 1,
        active: true,
        createdAt: "",
        updatedAt: "",
      },
    ];

    expect(matchRecipeForOrderItem(recipes, "prod-mojito", "16OZ")?.id).toBe("rec-16");
    expect(matchRecipeForOrderItem(recipes, "prod-mojito", "24 oz")?.id).toBe("rec-wild");
  });

  it("computes recipe cost and aggregate consumptions including selected add-ons", () => {
    const suppliesById = new Map([
      ["sup-ron", makeSupply("sup-ron", "Ron Blanco", "ml", 60, 1500)],
      ["sup-vaso", makeSupply("sup-vaso", "Vaso 16 oz", "unidad", 450, 200)],
    ]);

    const recipe: ProductRecipe = {
      id: "rec-1",
      negocioId: "coctels-ops",
      productId: "prod-mojito",
      productName: "Mojito Clásico",
      presentation: "16 oz",
      presentationKey: "16 oz",
      ingredients: [
        { supplyId: "sup-ron", supplyName: "Ron Blanco", supplyUnit: "ml", quantity: 2, unit: "oz" },
        { supplyId: "sup-vaso", supplyName: "Vaso 16 oz", supplyUnit: "unidad", quantity: 1, unit: "unidad" },
      ],
      addOnIngredients: [
        {
          addOnName: "Shot extra",
          supplyId: "sup-ron",
          supplyName: "Ron Blanco",
          supplyUnit: "ml",
          quantity: 1,
          unit: "oz",
        },
      ],
      yieldUnits: 1,
      active: true,
      createdAt: "",
      updatedAt: "",
    };

    const previewNoAddOn = calculateRecipeCost({
      ingredients: recipe.ingredients,
      addOnIngredients: recipe.addOnIngredients,
      suppliesById,
      salePriceCop: 22000,
    });
    expect(previewNoAddOn.unitCostCop).toBe(4050);

    const plan = buildOrderEscandalloAndConsumptions({
      order: makeSampleOrder(),
      recipes: [recipe],
      suppliesById,
      depletedAt: "2026-05-01T18:10:00.000Z",
      triggeredOnStatus: "preparando",
    });

    expect(plan).not.toBeNull();
    expect(plan?.consumptions).toEqual([
      {
        supplyId: "sup-ron",
        supplyName: "Ron Blanco",
        supplyUnit: "ml",
        requiredQuantity: 180,
        costCop: 10800,
      },
      {
        supplyId: "sup-vaso",
        supplyName: "Vaso 16 oz",
        supplyUnit: "unidad",
        requiredQuantity: 2,
        costCop: 900,
      },
    ]);
    expect(plan?.escandallo.totalCostCop).toBe(11700);
    expect(plan?.escandallo.grossProfitCop).toBe(32300);
    expect(plan?.escandallo.coverage).toBe("complete");
  });
});

describe("updateOrderStatus supply depletion transaction & idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("depletes supplies atomically on preparando with all reads before writes, and stays idempotent through entregado", async () => {
    const order = makeSampleOrder("confirmado");
    const mem = createMemoryFirestore({
      pedidos: { [order.id]: order as unknown as Record<string, unknown> },
      insumos: {
        "sup-ron": makeSupply("sup-ron", "Ron Blanco", "ml", 60, 1000, 300) as unknown as Record<string, unknown>,
        "sup-vaso": makeSupply("sup-vaso", "Vaso 16 oz", "unidad", 450, 50, 10) as unknown as Record<string, unknown>,
      },
      recetas: {
        "rec-mojito-16": {
          negocioId: "coctels-ops",
          productId: "prod-mojito",
          productName: "Mojito Clásico",
          presentation: "16 oz",
          presentationKey: "16 oz",
          ingredients: [
            { supplyId: "sup-ron", supplyName: "Ron Blanco", supplyUnit: "ml", quantity: 2, unit: "oz" },
            { supplyId: "sup-vaso", supplyName: "Vaso 16 oz", supplyUnit: "unidad", quantity: 1, unit: "unidad" },
          ],
          addOnIngredients: [
            { addOnName: "Shot extra", supplyId: "sup-ron", supplyName: "Ron Blanco", supplyUnit: "ml", quantity: 1, unit: "oz" },
          ],
          yieldUnits: 1,
          active: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      },
    });
    getAdminDbMock.mockReturnValue(mem.db);
    const caller = makeCaller();

    const preparingOrder = await updateOrderStatus(caller, order.id, { status: "preparando" });

    expect(preparingOrder.status).toBe("preparando");
    expect(preparingOrder.suppliesDepletedOnStatus).toBe("preparando");
    expect(preparingOrder.escandallo?.totalCostCop).toBe(11700);
    expect(mem.stores.insumos["sup-ron"].currentStock).toBe(820);
    expect(mem.stores.insumos["sup-vaso"].currentStock).toBe(48);

    const movements = Object.values(mem.stores.inventario_movimientos);
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.orderId === order.id && m.type === "consumo")).toBe(true);

    // Every transaction.get must precede first update/create
    const firstWriteIdx = mem.txOps.findIndex((op) => op.startsWith("update:") || op.startsWith("create:"));
    const lastGetIdx = mem.txOps.map((op) => op.startsWith("get:")).lastIndexOf(true);
    expect(lastGetIdx).toBeLessThan(firstWriteIdx);

    // Transition to en_camino and entregado MUST NOT deplete supplies again
    await updateOrderStatus(caller, order.id, { status: "en_camino" });
    const deliveredOrder = await updateOrderStatus(caller, order.id, { status: "entregado" });

    expect(deliveredOrder.suppliesDepletedOnStatus).toBe("preparando");
    expect(mem.stores.insumos["sup-ron"].currentStock).toBe(820);
    expect(mem.stores.insumos["sup-vaso"].currentStock).toBe(48);
    expect(Object.values(mem.stores.inventario_movimientos)).toHaveLength(2);
  });

  it("clamps stock at 0, records shortfallQuantity, and emits admin alert when bar stock is short", async () => {
    const order = makeSampleOrder("en_camino");
    order.items[0].quantity = 1;
    order.items[0].subtotal = 22000;
    order.total = 22000;

    const mem = createMemoryFirestore({
      pedidos: { [order.id]: order as unknown as Record<string, unknown> },
      insumos: {
        "sup-ron": makeSupply("sup-ron", "Ron Blanco", "ml", 60, 40, 200) as unknown as Record<string, unknown>,
      },
      recetas: {
        "rec-1": {
          negocioId: "coctels-ops",
          productId: "prod-mojito",
          productName: "Mojito Clásico",
          presentation: "16 oz",
          presentationKey: "16 oz",
          ingredients: [
            { supplyId: "sup-ron", supplyName: "Ron Blanco", supplyUnit: "ml", quantity: 2, unit: "oz" },
          ],
          addOnIngredients: [],
          yieldUnits: 1,
          active: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      },
    });
    getAdminDbMock.mockReturnValue(mem.db);

    const updated = await updateOrderStatus(makeCaller(), order.id, { status: "entregado" });
    expect(updated.suppliesDepletedOnStatus).toBe("entregado");
    expect(mem.stores.insumos["sup-ron"].currentStock).toBe(0);
    expect(mem.stores.insumos["sup-ron"].status).toBe("critico");

    const movements = Object.values(mem.stores.inventario_movimientos);
    expect(movements).toHaveLength(1);
    expect(movements[0].shortfallQuantity).toBe(20);

    const adminAlerts = Object.values(mem.stores.notificaciones).filter(
      (n) => n.audience === "admin" && n.supplyId === "sup-ron"
    );
    expect(adminAlerts).toHaveLength(1);
  });
});

describe("recipe tenant isolation and customer-order privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces authoritative supply metadata, detects duplicate presentation, and rejects cross-tenant writes", async () => {
    const mem = createMemoryFirestore({
      productos: {
        "prod-mojito": {
          name: "Mojito Auténtico",
          price: 22000,
          negocioId: "coctels-ops",
          active: true,
        },
      },
      insumos: {
        "sup-ron": makeSupply("sup-ron", "Ron Blanco Autorizado", "ml", 60, 1000) as unknown as Record<string, unknown>,
        "sup-other": {
          ...makeSupply("sup-other", "Ron Otro Tenant", "ml", 60, 500),
          negocioId: "otro-bar",
        },
      },
    });
    getAdminDbMock.mockReturnValue(mem.db);
    const caller = makeCaller();

    const created = await createRecipe(caller, {
      productId: "prod-mojito",
      productName: "Nombre Spoof",
      presentation: "16 oz",
      ingredients: [
        {
          supplyId: "sup-ron",
          supplyName: "Nombre Falso",
          supplyUnit: "ml",
          quantity: 2,
          unit: "oz",
        },
      ],
    });

    expect(created.productName).toBe("Mojito Auténtico");
    expect(created.ingredients[0].supplyName).toBe("Ron Blanco Autorizado");

    await expect(
      createRecipe(caller, {
        productId: "prod-mojito",
        productName: "Mojito",
        presentation: "16OZ",
        ingredients: [
          { supplyId: "sup-ron", supplyName: "Ron", supplyUnit: "ml", quantity: 1, unit: "oz" },
        ],
      })
    ).rejects.toThrow(RecipeConflictError);

    await expect(
      createRecipe(caller, {
        productId: "prod-mojito",
        productName: "Mojito",
        presentation: "24 oz",
        ingredients: [
          { supplyId: "sup-other", supplyName: "Ron", supplyUnit: "ml", quantity: 2, unit: "oz" },
        ],
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it("strips escandallo and depletion internal metadata in toCustomerOrder", () => {
    const order: Order = {
      ...makeSampleOrder("preparando"),
      suppliesDepletedAt: "2026-05-01T18:10:00.000Z",
      suppliesDepletedOnStatus: "preparando",
      escandallo: {
        totalCostCop: 5000,
        revenueCop: 44000,
        grossProfitCop: 39000,
        grossMarginPct: 88.6,
        coveredItemsCount: 1,
        totalItemsCount: 1,
        coverage: "complete",
        depletedAt: "2026-05-01T18:10:00.000Z",
        triggeredOnStatus: "preparando",
        items: [],
      },
    };

    const customerView = toCustomerOrder(order) as Record<string, unknown>;
    expect(customerView.escandallo).toBeUndefined();
    expect(customerView.suppliesDepletedAt).toBeUndefined();
    expect(customerView.suppliesDepletedOnStatus).toBeUndefined();
    expect(customerView.audit).toBeUndefined();
    expect(customerView.clienteUid).toBeUndefined();
  });
});
