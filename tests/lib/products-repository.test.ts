import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, where, collection, doc, set, update, runTransaction, transactionGet, transactionSet, transactionUpdate, transactionDelete, transactionCreate } = vi.hoisted(() => ({
  get: vi.fn(),
  where: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
  transactionGet: vi.fn(),
  transactionSet: vi.fn(),
  transactionUpdate: vi.fn(),
  transactionDelete: vi.fn(),
  transactionCreate: vi.fn(),
}));

const productCollection = { where, get, doc };
const categoryCollection = { where, get };
const productRef = { id: "1", get, set, update };

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({ collection, runTransaction }),
}));

import {
  createProduct,
  getProductById,
  listActiveProducts,
  listAllProducts,
  patchProduct,
  updateProduct,
} from "@/lib/firestore/products";
import type { CatalogCaller } from "@/types/catalog";

const productInput = {
  name: "Fresa Salvaje",
  description: "Granizado de fresa natural.",
  price: 8500,
  image: "/catalog-placeholder.svg",
  category: "granizado" as const,
  availableFlavors: ["Fresa"],
  availableAddOns: [{ name: "Gomitas", price: 1500 }],
  stock: 10,
  active: true,
  featured: false,
};

const caller: CatalogCaller = {
  uid: "admin-1",
  token: { uid: "admin-1", admin: true },
  profile: {
    uid: "admin-1",
    email: "admin@example.com",
    displayName: "Admin",
    photoURL: null,
    telefono: null,
    addresses: [],
    active: true,
    accountType: "admin",
    roleIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "2026-01-01T00:00:00.000Z",
  },
  permissions: ["productos.read", "productos.write"],
};

describe("products repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collection.mockImplementation((name: string) => name === "categorias" ? categoryCollection : productCollection);
    doc.mockReturnValue(productRef);
    where.mockReturnValue(productCollection);
    set.mockResolvedValue(undefined);
    update.mockResolvedValue(undefined);
    transactionGet.mockResolvedValue({ exists: false, data: () => undefined });
    runTransaction.mockImplementation(async (callback: (transaction: unknown) => Promise<unknown>) => callback({ get: transactionGet, set: transactionSet, update: transactionUpdate, delete: transactionDelete, create: transactionCreate }));
  });

  it("lista solo productos activos y los mapea con su id documental", async () => {
    get.mockResolvedValueOnce({
      docs: [
        {
          id: "1",
          data: () => ({ ...productInput, active: true }),
        },
      ],
    });

    await expect(listActiveProducts()).resolves.toEqual([{ id: "1", ...productInput }]);
    expect(collection).toHaveBeenCalledWith("productos");
    expect(where).toHaveBeenCalledWith("active", "==", true);
  });

  it("no devuelve productos inactivos en la lectura pública por id", async () => {
    get.mockResolvedValueOnce({ exists: true, data: () => ({ ...productInput, active: false }) });

    await expect(getProductById("1")).resolves.toBeNull();
    expect(doc).toHaveBeenCalledWith("1");
  });

  it("permite a una lectura administrativa incluir un producto inactivo", async () => {
    get.mockResolvedValueOnce({ exists: true, data: () => ({ ...productInput, active: false }) });

    await expect(getProductById("1", { includeInactive: true, caller })).resolves.toMatchObject({ id: "1", active: false });
  });

  it("rechaza una lectura inactiva sin un caller autorizado", async () => {
    await expect(getProductById("1", { includeInactive: true } as never)).rejects.toMatchObject({ status: 403 });
    expect(get).not.toHaveBeenCalled();
  });

  it("permite listar productos inactivos con permiso de lectura", async () => {
    get.mockResolvedValueOnce({ docs: [] });

    await expect(listAllProducts(caller)).resolves.toEqual([]);
    expect(collection).toHaveBeenCalledWith("productos");
    expect(where).not.toHaveBeenCalled();
  });

  it("permite a un staff activo con permiso explícito leer inactivos", async () => {
    const staff = {
      ...caller,
      token: { uid: "staff-1", admin: false },
      profile: { ...caller.profile, uid: "staff-1", accountType: "staff" as const },
      permissions: ["productos.read" as const],
    };
    get.mockResolvedValueOnce({ exists: true, data: () => ({ ...productInput, active: false }) });

    await expect(getProductById("1", { includeInactive: true, caller: staff })).resolves.toMatchObject({ active: false });
  });

  it("permite leer el producto actualizado con productos.write sin productos.read", async () => {
    const writeOnlyStaff = {
      ...caller,
      token: { uid: "staff-1", admin: false },
      profile: { ...caller.profile, uid: "staff-1", accountType: "staff" as const },
      permissions: ["productos.write" as const],
    };
    get.mockResolvedValueOnce({ exists: true, data: () => ({ ...productInput, active: true }) });

    await expect(getProductById("1", { includeInactive: true, caller: writeOnlyStaff })).resolves.toMatchObject({ id: "1" });
  });

  it("valida y escribe productos solo con permiso de escritura", async () => {
    await expect(createProduct(productInput, caller, "1")).resolves.toBe("1");
    expect(doc).toHaveBeenCalledWith("1");
    expect(transactionSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(productInput));

    await updateProduct("1", { ...productInput, price: 9000 }, caller);
    expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ price: 9000 }));
  });

  it("permite actualizar parcialmente un producto con patchProduct y registra auditoría", async () => {
    transactionGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...productInput, stock: 10, active: true }),
    });

    const result = await patchProduct("1", { stock: 0, active: false }, caller);

    expect(result).toMatchObject({ id: "1", stock: 0, active: false });
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stock: 0, active: false, updatedAt: expect.any(String) })
    );
  });

  it("rechaza escrituras sin permiso de catálogo", async () => {
    const customer = { ...caller, profile: { ...caller.profile, accountType: "customer" as const }, permissions: [] };

    await expect(createProduct(productInput, customer, "1")).rejects.toMatchObject({ status: 403 });
    await expect(updateProduct("1", productInput, customer)).rejects.toMatchObject({ status: 403 });
    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("hace upsert por id estable, preserva createdAt y nunca borra", async () => {
    transactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ createdAt: "2026-01-01T00:00:00.000Z" }) });

    await expect((await import("@/lib/firestore/products")).upsertImportedProduct("1", productInput, "catalog-import")).resolves.toBe("updated");

    expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      ...productInput,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: expect.any(String),
    }));
    expect(transactionDelete).not.toHaveBeenCalled();
  });

  it("lista solo categorías activas", async () => {
    get.mockResolvedValueOnce({
      docs: [{ id: "granizados", data: () => ({ name: "Granizados", active: true, order: 1 }) }],
    });

    const { listCategories } = await import("@/lib/firestore/categories");
    await expect(listCategories()).resolves.toEqual([
      { id: "granizados", name: "Granizados", active: true, order: 1 },
    ]);
    expect(collection).toHaveBeenCalledWith("categorias");
    expect(where).toHaveBeenCalledWith("active", "==", true);
  });
});
