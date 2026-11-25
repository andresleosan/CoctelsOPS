import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminDbMock, verifyIdTokenMock } = vi.hoisted(() => ({
  getAdminDbMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: getAdminDbMock,
  getAdminAuth: () => ({ verifyIdToken: verifyIdTokenMock }),
}));

import { GET as GET_CAJA, POST as POST_CAJA } from "@/app/api/admin/caja/route";
import { GET as GET_MESAS, POST as POST_MESAS } from "@/app/api/admin/mesas/route";
import { GET as GET_STATS } from "@/app/api/admin/stats/route";
import {
  hasNegocioAccess,
  requireNegocioAccess,
  resolveAuthorizedNegocioId,
} from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/verify-request";
import {
  addCashExpense,
  closeCashShift,
  fetchTransferVerificationOrders,
  getCashDashboardStateForCaller,
  openCashShift,
} from "@/lib/firestore/cash-register";
import { getAdminOrder, listOrders, updateOrderStatus } from "@/lib/firestore/orders";
import {
  assertRecipeTenantAccess,
  deleteRecipe,
  getRecipeById,
  listRecipes,
  prepareOrderSupplyDepletion,
  updateRecipe,
} from "@/lib/firestore/recipes";
import {
  getSupplyById,
  getSupplyByIdForCaller,
  listSuppliesForCaller,
  listSupplyMovements,
  recordSupplyMovement,
  updateSupply,
} from "@/lib/firestore/supplies";
import {
  addPublicRoundToTableTab,
  addRoundToBarTab,
  cancelBarTab,
  closeBarTab,
  listBarTabsForCaller,
  openBarTab,
} from "@/lib/firestore/tabs";
import { openCashShiftSchema } from "@/lib/validation/cash-register";
import type { Permission, VerifiedUser } from "@/types/auth";
import type { Order } from "@/types/orders";

type StoreDoc = Record<string, Record<string, unknown>>;

function createMemoryFirestore(initial?: Record<string, StoreDoc>) {
  const stores: Record<string, StoreDoc> = {
    users: { ...(initial?.users ?? {}) },
    roles: { ...(initial?.roles ?? {}) },
    pedidos: { ...(initial?.pedidos ?? {}) },
    productos: { ...(initial?.productos ?? {}) },
    insumos: { ...(initial?.insumos ?? {}) },
    recetas: { ...(initial?.recetas ?? {}) },
    caja_turnos: { ...(initial?.caja_turnos ?? {}) },
    cuentas_mesas: { ...(initial?.cuentas_mesas ?? {}) },
    inventario_movimientos: { ...(initial?.inventario_movimientos ?? {}) },
    notificaciones: { ...(initial?.notificaciones ?? {}) },
    auditoria: { ...(initial?.auditoria ?? {}) },
  };
  let autoId = 0;

  type QueryFilter = { field: string; op: string; value: unknown };

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
      async create(data: Record<string, unknown>) {
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

  function makeQuery(
    colName: string,
    filters: QueryFilter[] = [],
    sortSpec?: { field: string; dir: "asc" | "desc" },
    limitCount?: number,
  ) {
    return {
      where(field: string, op: string, value: unknown) {
        return makeQuery(colName, [...filters, { field, op, value }], sortSpec, limitCount);
      },
      orderBy(field: string, dir: "asc" | "desc" = "asc") {
        return makeQuery(colName, filters, { field, dir }, limitCount);
      },
      limit(count: number) {
        return makeQuery(colName, filters, sortSpec, count);
      },
      async get() {
        let entries = Object.entries(stores[colName] ?? {}).filter(([, data]) =>
          filters.every(({ field, op, value }) => {
            const actual = data[field];
            if (op === "==") return actual === value;
            if (op === ">=") return typeof actual === "string" && typeof value === "string" && actual >= value;
            if (op === "in" && Array.isArray(value)) return value.includes(actual);
            return false;
          }),
        );

        if (sortSpec) {
          entries = [...entries].sort(([, a], [, b]) => {
            const left = String(a[sortSpec.field] ?? "");
            const right = String(b[sortSpec.field] ?? "");
            return sortSpec.dir === "desc" ? right.localeCompare(left) : left.localeCompare(right);
          });
        }

        if (typeof limitCount === "number") {
          entries = entries.slice(0, limitCount);
        }

        const docs = entries.map(([id, data]) => ({
          id,
          ref: makeDocRef(colName, id),
          exists: true,
          data: () => ({ ...data }),
        }));

        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
        };
      },
    };
  }

  const db = {
    collection(name: string) {
      return {
        ...makeQuery(name),
        doc(id?: string) {
          const docId = id ?? `${name}-auto-${++autoId}`;
          return makeDocRef(name, docId);
        },
        async add(data: Record<string, unknown>) {
          const docId = `${name}-auto-${++autoId}`;
          await makeDocRef(name, docId).set(data);
          return makeDocRef(name, docId);
        },
      };
    },
    async runTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      const stagedWrites: Array<() => void> = [];
      let sawWrite = false;
      const tx = {
        async get(target: { get: () => Promise<unknown> }) {
          if (sawWrite) {
            throw new Error("Firestore transaction invariant violated: read after write");
          }
          return target.get();
        },
        update(
          ref: { update: (d: Record<string, unknown>) => Promise<void> },
          data: Record<string, unknown>,
        ) {
          sawWrite = true;
          stagedWrites.push(() => {
            void ref.update(data);
          });
        },
        create(
          ref: { set: (d: Record<string, unknown>) => Promise<void> },
          data: Record<string, unknown>,
        ) {
          sawWrite = true;
          stagedWrites.push(() => {
            void ref.set(data);
          });
        },
        set(
          ref: { set: (d: Record<string, unknown>) => Promise<void> },
          data: Record<string, unknown>,
        ) {
          sawWrite = true;
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

  return { db, stores };
}

function makeUser(
  uid: string,
  options: {
    accountType?: "staff" | "admin";
    negocioId?: string;
    active?: boolean;
    adminClaim?: boolean;
  } = {},
): VerifiedUser {
  const isAdmin = options.accountType === "admin" || options.adminClaim === true;
  const permissions: Permission[] = isAdmin
    ? []
    : [
        "pedidos.read",
        "pedidos.update",
        "productos.read",
        "clientes.read",
        "inventario.read",
        "inventario.write",
      ];

  return {
    uid,
    token: {
      uid,
      email: `${uid}@coctels.test`,
      email_verified: true,
      admin: Boolean(options.adminClaim),
    },
    permissions,
    profile: {
      uid,
      email: `${uid}@coctels.test`,
      displayName: uid,
      photoURL: null,
      telefono: null,
      addresses: [],
      active: options.active ?? true,
      accountType: options.accountType ?? "staff",
      roleIds: [isAdmin ? "admin" : "staff-ops"],
      permissions,
      ...(options.negocioId ? { negocioId: options.negocioId } : {}),
      createdAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function seedMultiTenantMemory() {
  const staffA = makeUser("staff-a", { negocioId: "local-a" });
  const staffB = makeUser("staff-b", { negocioId: "local-b" });
  const unassignedStaff = makeUser("staff-unassigned");
  const globalAdmin = makeUser("admin-global", { accountType: "admin", adminClaim: true });

  const mem = createMemoryFirestore({
    roles: {
      "staff-ops": {
        id: "staff-ops",
        name: "Staff Operaciones",
        active: true,
        permissions: [
          "pedidos.read",
          "pedidos.update",
          "productos.read",
          "clientes.read",
          "inventario.read",
          "inventario.write",
        ],
      },
    },
    users: {
      [staffA.uid]: staffA.profile,
      [staffB.uid]: staffB.profile,
      [unassignedStaff.uid]: unassignedStaff.profile,
      [globalAdmin.uid]: globalAdmin.profile,
      "cli-a": { uid: "cli-a", accountType: "customer", negocioId: "local-a", active: true },
      "cli-b": { uid: "cli-b", accountType: "customer", negocioId: "local-b", active: true },
    },
    productos: {
      "prod-a": {
        name: "Granizado A",
        description: "Local A",
        price: 15000,
        image: "/catalog-placeholder.svg",
        category: "granizado",
        availableSizes: [{ name: "16 oz", price: 15000 }],
        availableFlavors: ["Fresa"],
        availableAddOns: [],
        stock: 20,
        active: true,
        featured: false,
        negocioId: "local-a",
      },
      "prod-b": {
        name: "Granizado B",
        description: "Local B",
        price: 18000,
        image: "/catalog-placeholder.svg",
        category: "granizado",
        availableSizes: [{ name: "16 oz", price: 18000 }],
        availableFlavors: ["Mango"],
        availableAddOns: [],
        stock: 15,
        active: true,
        featured: false,
        negocioId: "local-b",
      },
      "prod-legacy": {
        name: "Granizado Clásico",
        description: "Sin negocioId explícito (coctels-ops)",
        price: 12000,
        image: "/catalog-placeholder.svg",
        category: "granizado",
        availableSizes: [{ name: "16 oz", price: 12000 }],
        availableFlavors: ["Limón"],
        availableAddOns: [],
        stock: 12,
        active: true,
        featured: false,
      },
    },
    insumos: {
      "sup-a": {
        negocioId: "local-a",
        name: "Ron A",
        category: "licor",
        unit: "ml",
        currentStock: 1000,
        minStock: 200,
        costPerUnit: 50,
        status: "ok",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
      "sup-b": {
        negocioId: "local-b",
        name: "Ron B",
        category: "licor",
        unit: "ml",
        currentStock: 800,
        minStock: 200,
        costPerUnit: 55,
        status: "ok",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    },
    inventario_movimientos: {
      "mov-a": {
        supplyId: "sup-a",
        supplyName: "Ron A",
        negocioId: "local-a",
        type: "entrada",
        quantity: 500,
        previousStock: 500,
        resultingStock: 1000,
        reason: "Compra A",
        actorUid: "staff-a",
        createdAt: "2026-11-10T10:00:00.000Z",
      },
      "mov-b": {
        supplyId: "sup-b",
        supplyName: "Ron B",
        negocioId: "local-b",
        type: "entrada",
        quantity: 400,
        previousStock: 400,
        resultingStock: 800,
        reason: "Compra B",
        actorUid: "staff-b",
        createdAt: "2026-11-10T11:00:00.000Z",
      },
    },
    recetas: {
      "rec-a": {
        negocioId: "local-a",
        productId: "prod-a",
        productName: "Granizado A",
        presentation: "16 oz",
        presentationKey: "16 oz",
        ingredients: [
          { supplyId: "sup-a", supplyName: "Ron A", supplyUnit: "ml", quantity: 2, unit: "oz" },
        ],
        addOnIngredients: [],
        yieldUnits: 1,
        active: true,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
      "rec-b": {
        negocioId: "local-b",
        productId: "prod-b",
        productName: "Granizado B",
        presentation: "16 oz",
        presentationKey: "16 oz",
        ingredients: [
          { supplyId: "sup-b", supplyName: "Ron B", supplyUnit: "ml", quantity: 2, unit: "oz" },
        ],
        addOnIngredients: [],
        yieldUnits: 1,
        active: true,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    },
    caja_turnos: {
      "shift-a": {
        negocioId: "local-a",
        status: "abierta",
        openedAt: "2026-11-24T12:00:00.000Z",
        openedByUid: "staff-a",
        openedByName: "Cajero A",
        openingBase: 100000,
        expenses: [],
        updatedAt: "2026-11-24T12:00:00.000Z",
      },
      "shift-b": {
        negocioId: "local-b",
        status: "abierta",
        openedAt: "2026-11-24T12:00:00.000Z",
        openedByUid: "staff-b",
        openedByName: "Cajero B",
        openingBase: 200000,
        expenses: [],
        updatedAt: "2026-11-24T12:00:00.000Z",
      },
    },
    cuentas_mesas: {
      "tab-a": {
        negocioId: "local-a",
        tableNumber: "Mesa 1",
        guestCount: 2,
        status: "abierta",
        rounds: [
          {
            roundNumber: 1,
            orderId: "ord-a",
            items: [],
            subtotal: 15000,
            createdAt: "2026-11-24T13:00:00.000Z",
            createdByUid: "staff-a",
          },
        ],
        subtotal: 15000,
        total: 15000,
        openedAt: "2026-11-24T13:00:00.000Z",
        openedByUid: "staff-a",
        openedByName: "Mesero A",
        updatedAt: "2026-11-24T13:00:00.000Z",
      },
      "tab-b": {
        negocioId: "local-b",
        tableNumber: "Mesa 2",
        guestCount: 4,
        status: "abierta",
        rounds: [],
        subtotal: 0,
        total: 0,
        openedAt: "2026-11-24T13:00:00.000Z",
        openedByUid: "staff-b",
        openedByName: "Mesero B",
        updatedAt: "2026-11-24T13:00:00.000Z",
      },
    },
    pedidos: {
      "ord-a": {
        clienteUid: "cli-a",
        customerName: "Cliente A",
        phone: "3001111111",
        address: "Mesa 1",
        negocioId: "local-a",
        items: [],
        subtotal: 15000,
        total: 15000,
        status: "pendiente",
        paymentMethod: "nequi",
        paymentVerificationStatus: "pendiente_verificacion",
        createdAt: "2026-11-24T13:05:00.000Z",
        updatedAt: "2026-11-24T13:05:00.000Z",
        audit: { createdByUid: "cli-a", createdAt: "2026-11-24T13:05:00.000Z" },
      },
      "ord-b": {
        clienteUid: "cli-b",
        customerName: "Cliente B",
        phone: "3002222222",
        address: "Mesa 2",
        negocioId: "local-b",
        items: [],
        subtotal: 40000,
        total: 40000,
        status: "pendiente",
        paymentMethod: "daviplata",
        paymentVerificationStatus: "pendiente_verificacion",
        createdAt: "2026-11-24T13:10:00.000Z",
        updatedAt: "2026-11-24T13:10:00.000Z",
        audit: { createdByUid: "cli-b", createdAt: "2026-11-24T13:10:00.000Z" },
      },
      "ord-legacy": {
        clienteUid: "cli-legacy",
        customerName: "Cliente Legacy",
        phone: "3003333333",
        address: "Calle 10",
        items: [],
        subtotal: 12000,
        total: 12000,
        status: "entregado",
        createdAt: "2026-11-24T12:30:00.000Z",
        updatedAt: "2026-11-24T12:30:00.000Z",
        audit: { createdByUid: "cli-legacy", createdAt: "2026-11-24T12:30:00.000Z" },
      },
    },
  });

  getAdminDbMock.mockReturnValue(mem.db);
  verifyIdTokenMock.mockImplementation(async (token: string) => {
    if (token === "token-staff-a") return staffA.token;
    if (token === "token-staff-b") return staffB.token;
    if (token === "token-unassigned") return unassignedStaff.token;
    if (token === "token-admin") return globalAdmin.token;
    throw new Error("Invalid token");
  });

  return { mem, staffA, staffB, unassignedStaff, globalAdmin };
}

describe("Paridad Multi-Tenant v1.7 (TASK-33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Helper fail-closed de acceso multi-tenant", () => {
    it("permite a admin global y al staff del propio local, y bloquea staff sin negocioId, cross-tenant o inactivo", () => {
      const staffA = makeUser("staff-a", { negocioId: "local-a" });
      const unassigned = makeUser("staff-none");
      const inactive = makeUser("staff-off", { negocioId: "local-a", active: false });
      const admin = makeUser("admin-1", { accountType: "admin", adminClaim: true });

      expect(hasNegocioAccess(admin, "local-b")).toBe(true);
      expect(resolveAuthorizedNegocioId(admin)).toBe("coctels-ops");
      expect(resolveAuthorizedNegocioId(admin, "local-b")).toBe("local-b");

      expect(hasNegocioAccess(staffA, "local-a")).toBe(true);
      expect(hasNegocioAccess(staffA, "local-b")).toBe(false);
      expect(hasNegocioAccess(staffA, "coctels-ops")).toBe(false);
      expect(hasNegocioAccess(staffA, "   ")).toBe(false);
      expect(resolveAuthorizedNegocioId(staffA)).toBe("local-a");
      expect(() => requireNegocioAccess(staffA, "local-b")).toThrow(AuthorizationError);
      expect(() => resolveAuthorizedNegocioId(staffA, "local-b")).toThrow(AuthorizationError);

      // Fail-closed para staff sin negocioId asignado
      expect(hasNegocioAccess(unassigned, "coctels-ops")).toBe(false);
      expect(() => resolveAuthorizedNegocioId(unassigned)).toThrow(AuthorizationError);

      // Fail-closed para cuenta inactiva
      expect(hasNegocioAccess(inactive, "local-a")).toBe(false);
      expect(() => resolveAuthorizedNegocioId(inactive)).toThrow(AuthorizationError);
    });
  });

  describe("2. Aislamiento de insumos e inventario_movimientos", () => {
    it("filtra insumos y movimientos por negocioId y bloquea lecturas/mutaciones cross-tenant", async () => {
      const { mem, staffA } = seedMultiTenantMemory();

      const suppliesA = await listSuppliesForCaller(staffA);
      expect(suppliesA.map((s) => s.id)).toEqual(["sup-a"]);
      await expect(listSuppliesForCaller(staffA, "local-b")).rejects.toThrow(AuthorizationError);

      await expect(getSupplyById("sup-b", "local-a")).rejects.toThrow(AuthorizationError);
      await expect(getSupplyByIdForCaller(staffA, "sup-b")).rejects.toThrow(AuthorizationError);

      await expect(
        updateSupply("sup-b", { minStock: 99 }, staffA.uid, { caller: staffA }),
      ).rejects.toThrow(AuthorizationError);

      // Mantiene negocioId inmutable aunque intenten parchearlo
      const updatedA = await updateSupply(
        "sup-a",
        { minStock: 250, negocioId: "local-b" },
        staffA.uid,
        { caller: staffA },
      );
      expect(updatedA.negocioId).toBe("local-a");
      expect(mem.stores.insumos["sup-a"].negocioId).toBe("local-a");

      await expect(
        recordSupplyMovement(
          {
            supplyId: "sup-b",
            type: "entrada",
            quantity: 5,
            reason: "Intento ajeno",
            actorUid: staffA.uid,
          },
          { caller: staffA },
        ),
      ).rejects.toThrow(AuthorizationError);

      const movementsA = await listSupplyMovements({ caller: staffA });
      expect(movementsA.map((m) => m.id)).toEqual(["mov-a"]);
      await expect(listSupplyMovements({ caller: staffA, negocioId: "local-b" })).rejects.toThrow(
        AuthorizationError,
      );
    });
  });

  describe("3. Aislamiento de recetas y escandallo", () => {
    it("bloquea staff sin negocioId, bloquea cross-tenant y omite insumos ajenos al descontar comanda", async () => {
      const { mem, staffA, unassignedStaff } = seedMultiTenantMemory();

      expect(() => assertRecipeTenantAccess(unassignedStaff, "coctels-ops")).toThrow(
        AuthorizationError,
      );
      expect(() => assertRecipeTenantAccess(staffA, "local-b")).toThrow(AuthorizationError);

      const recipesA = await listRecipes(staffA);
      expect(recipesA.map((r) => r.id)).toEqual(["rec-a"]);
      await expect(listRecipes(staffA, { negocioId: "local-b" })).rejects.toThrow(AuthorizationError);
      await expect(getRecipeById(staffA, "rec-b")).rejects.toThrow(AuthorizationError);
      await expect(
        updateRecipe(staffA, "rec-b", { notes: "Hack" }),
      ).rejects.toThrow(AuthorizationError);
      await expect(deleteRecipe(staffA, "rec-b")).rejects.toThrow(AuthorizationError);

      // Si una receta de local-a apunta accidentalmente a un insumo de local-b, nunca descuenta sup-b
      mem.stores.recetas["rec-a"].ingredients = [
        { supplyId: "sup-b", supplyName: "Ron B", supplyUnit: "ml", quantity: 2, unit: "oz" },
      ];
      const orderA: Order = {
        id: "ord-deplete",
        clienteUid: "cli-a",
        customerName: "Cliente A",
        phone: "3001111111",
        address: "Mesa 1",
        negocioId: "local-a",
        items: [
          {
            productId: "prod-a",
            name: "Granizado A",
            quantity: 1,
            unitPrice: 15000,
            subtotal: 15000,
            customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
          },
        ],
        subtotal: 15000,
        total: 15000,
        status: "confirmado",
        createdAt: "2026-11-24T14:00:00.000Z",
        updatedAt: "2026-11-24T14:00:00.000Z",
        audit: { createdByUid: "cli-a", createdAt: "2026-11-24T14:00:00.000Z" },
      };

      const prepared = await mem.db.runTransaction(async (tx) =>
        prepareOrderSupplyDepletion({
          db: mem.db as never,
          transaction: tx as never,
          order: orderA,
          actorUid: staffA.uid,
          targetStatus: "preparando",
          negocioId: "local-a",
          now: "2026-11-24T14:05:00.000Z",
        }),
      );
      expect(prepared).not.toBeNull();
      expect(mem.stores.insumos["sup-b"].currentStock).toBe(800);
    });
  });

  describe("4. Aislamiento de caja_turnos y /api/admin/caja", () => {
    it("permite abrir caja al staff en su propio local sin enviar negocioId y bloquea cross-tenant", async () => {
      const { mem, staffA } = seedMultiTenantMemory();

      const parsedOpen = openCashShiftSchema.parse({ action: "open", openingBase: 90000 });
      expect(parsedOpen.negocioId).toBeUndefined();

      // Cerrar primero shift-a para poder probar apertura sin negocioId explícito
      mem.stores.caja_turnos["shift-a"].status = "cerrada";
      const opened = await openCashShift(staffA, parsedOpen);
      expect(opened.negocioId).toBe("local-a");

      await expect(
        openCashShift(staffA, { negocioId: "local-b", openingBase: 50000 }),
      ).rejects.toThrow(AuthorizationError);

      await expect(
        addCashExpense(staffA, {
          shiftId: "shift-b",
          category: "hielo",
          concept: "Hielo ajeno",
          amount: 10000,
        }),
      ).rejects.toThrow(AuthorizationError);

      await expect(
        closeCashShift(staffA, {
          shiftId: "shift-b",
          countBreakdown: { declaredCash: 200000 },
        }),
      ).rejects.toThrow(AuthorizationError);

      const transfersA = await fetchTransferVerificationOrders("local-a");
      expect(transfersA.map((item) => item.orderId)).toEqual(["ord-a"]);

      const stateA = await getCashDashboardStateForCaller(staffA);
      expect(stateA.activeShift?.negocioId).toBe("local-a");
      await expect(getCashDashboardStateForCaller(staffA, "local-b")).rejects.toThrow(
        AuthorizationError,
      );

      const apiForbidden = await GET_CAJA(
        new Request("http://localhost/api/admin/caja?negocioId=local-b", {
          headers: { authorization: "Bearer token-staff-a" },
        }),
      );
      expect(apiForbidden.status).toBe(403);

      const apiExpenseForbidden = await POST_CAJA(
        new Request("http://localhost/api/admin/caja", {
          method: "POST",
          headers: {
            authorization: "Bearer token-staff-a",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "expense",
            shiftId: "shift-b",
            category: "hielo",
            concept: "Hielo ajeno",
            amount: 10000,
          }),
        }),
      );
      expect(apiExpenseForbidden.status).toBe(403);
    });
  });

  describe("5. Aislamiento de cuentas_mesas y /api/admin/mesas", () => {
    it("bloquea cuentas y productos legacy ajenos y registra negocioId en movimientos y notificaciones", async () => {
      const { mem, staffA, staffB } = seedMultiTenantMemory();

      const tabsA = await listBarTabsForCaller(staffA);
      expect(tabsA.map((t) => t.id)).toEqual(["tab-a"]);
      await expect(listBarTabsForCaller(staffA, "local-b")).rejects.toThrow(AuthorizationError);

      await expect(
        openBarTab(staffA, { negocioId: "local-b", tableNumber: "Mesa 9" }),
      ).rejects.toThrow(AuthorizationError);

      await expect(
        addRoundToBarTab(staffA, {
          tabId: "tab-b",
          items: [
            {
              productId: "prod-b",
              quantity: 1,
              customization: { size: "16 oz", flavors: ["Mango"], addOns: [] },
            },
          ],
        }),
      ).rejects.toThrow(AuthorizationError);

      // Un producto legacy (sin negocioId -> coctels-ops) NO puede usarse en local-b ni en staff ni por QR
      await expect(
        addRoundToBarTab(staffB, {
          tabId: "tab-b",
          items: [
            {
              productId: "prod-legacy",
              quantity: 1,
              customization: { size: "16 oz", flavors: ["Limón"], addOns: [] },
            },
          ],
        }),
      ).rejects.toMatchObject({ status: 403 });

      await expect(
        addPublicRoundToTableTab({
          negocioId: "local-b",
          tableNumber: "Mesa 2",
          items: [
            {
              productId: "prod-legacy",
              quantity: 1,
              customization: { size: "16 oz", flavors: ["Limón"], addOns: [] },
            },
          ],
        }),
      ).rejects.toMatchObject({ status: 403 });

      const roundResult = await addRoundToBarTab(staffA, {
        tabId: "tab-a",
        items: [
          {
            productId: "prod-a",
            quantity: 1,
            customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
          },
        ],
      });
      expect(roundResult.orderId).toBeTruthy();

      const movements = Object.values(mem.stores.inventario_movimientos);
      expect(movements.some((m) => m.orderId === roundResult.orderId && m.negocioId === "local-a")).toBe(
        true,
      );
      const adminNotifs = Object.values(mem.stores.notificaciones);
      expect(adminNotifs.some((n) => n.orderId === roundResult.orderId && n.negocioId === "local-a")).toBe(
        true,
      );

      await expect(
        closeBarTab(staffA, {
          tabId: "tab-b",
          splitMode: "single",
          payments: [{ method: "efectivo", amount: 15000 }],
        }),
      ).rejects.toThrow(AuthorizationError);

      await expect(cancelBarTab(staffA, { tabId: "tab-b" })).rejects.toThrow(AuthorizationError);

      const mesasForbidden = await GET_MESAS(
        new Request("http://localhost/api/admin/mesas?negocioId=local-b", {
          headers: { authorization: "Bearer token-staff-a" },
        }),
      );
      expect(mesasForbidden.status).toBe(403);

      const mesasPostForbidden = await POST_MESAS(
        new Request("http://localhost/api/admin/mesas", {
          method: "POST",
          headers: {
            authorization: "Bearer token-staff-a",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "open",
            negocioId: "local-b",
            tableNumber: "Mesa 8",
          }),
        }),
      );
      expect(mesasPostForbidden.status).toBe(403);
    });
  });

  describe("6. Aislamiento en /api/admin/stats y orders.ts", () => {
    it("acota métricas de /api/admin/stats y pedidos por negocioId para staff", async () => {
      const { staffA } = seedMultiTenantMemory();

      const statsOrdersA = await GET_STATS(
        new Request("http://localhost/api/admin/stats?scope=orders", {
          headers: { authorization: "Bearer token-staff-a" },
        }),
      );
      expect(statsOrdersA.status).toBe(200);
      await expect(statsOrdersA.json()).resolves.toMatchObject({
        stats: { orders: 1, revenue: 15000, pending: 1 },
      });

      const statsProductsA = await GET_STATS(
        new Request("http://localhost/api/admin/stats?scope=products", {
          headers: { authorization: "Bearer token-staff-a" },
        }),
      );
      expect(statsProductsA.status).toBe(200);
      await expect(statsProductsA.json()).resolves.toMatchObject({
        stats: { activeProducts: 1 },
      });

      const statsCrossTenant = await GET_STATS(
        new Request("http://localhost/api/admin/stats?scope=orders&negocioId=local-b", {
          headers: { authorization: "Bearer token-staff-a" },
        }),
      );
      expect(statsCrossTenant.status).toBe(403);

      const statsGlobalAdmin = await GET_STATS(
        new Request("http://localhost/api/admin/stats?scope=orders", {
          headers: { authorization: "Bearer token-admin" },
        }),
      );
      expect(statsGlobalAdmin.status).toBe(200);
      await expect(statsGlobalAdmin.json()).resolves.toMatchObject({
        stats: { orders: 3, revenue: 67000 },
      });

      const ordersA = await listOrders(staffA);
      expect(ordersA.map((o) => o.id)).toEqual(["ord-a"]);
      await expect(getAdminOrder(staffA, "ord-b")).rejects.toThrow(AuthorizationError);
      await expect(
        updateOrderStatus(staffA, "ord-b", { status: "confirmado" }),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("7. Contrato estático de firestore.rules para colecciones operativas", () => {
    it("declara bloqueo explícito de lectura y escritura en cliente para colecciones v1.2–v1.7", () => {
      const rules = readFileSync("firestore.rules", "utf8");
      const serverOnlyBlocks = [
        "match /insumos/{supplyId} { allow read, write: if false; }",
        "match /recetas/{recipeId} { allow read, write: if false; }",
        "match /caja_turnos/{shiftId} { allow read, write: if false; }",
        "match /cuentas_mesas/{tabId} { allow read, write: if false; }",
        "match /inventario_movimientos/{movementId} { allow read, write: if false; }",
        "match /promociones/{promotionId} { allow read, write: if false; }",
        "match /configuracion/{configId} { allow read, write: if false; }",
        "match /push_subscriptions/{subscriptionId} { allow read, write: if false; }",
        "match /ai_rate_limits/{digest} { allow read, write: if false; }",
        "match /table_rate_limits/{digest} { allow read, write: if false; }",
      ];

      for (const block of serverOnlyBlocks) {
        expect(rules).toContain(block);
      }
      expect(rules).toContain("match /{document=**} {\n      allow read, write: if false;\n    }");
      expect(rules).not.toContain("allow write: if isAdmin");
    });
  });
});
