import "server-only";

import { getAdminDb } from "@/lib/firebase-admin";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import { productInputSchema } from "@/lib/validation/catalog";
import type { CatalogCaller, CatalogPermission, Product, ProductInput } from "@/types/catalog";

type ProductReadOptions = { includeInactive?: false } | { includeInactive: true; caller: CatalogCaller };
type InternalProductReadOptions = { includeInactive?: boolean; caller?: CatalogCaller };

function productCollection() {
  return getAdminDb().collection("productos");
}

function requireCatalogPermission(caller: CatalogCaller | undefined, permission: CatalogPermission): void {
  const isAdmin = caller?.token.admin === true && caller.profile.accountType === "admin";
  const writeImpliesRead = permission === "productos.read" && caller?.permissions.includes("productos.write") === true;
  const isAllowed = caller?.profile.active === true && (isAdmin || caller.permissions.includes(permission) || writeImpliesRead);

  if (!isAllowed) {
    throw new AuthorizationError(403, "No tienes permiso para acceder al catálogo");
  }
}

export function productFromData(id: string, data: Record<string, unknown>): Product {
  const input = productInputSchema.parse({
    name: data.name,
    description: data.description,
    price: data.price,
    image: data.image,
    category: data.category,
    availableSizes: data.availableSizes,
    availableFlavors: data.availableFlavors,
    availableAddOns: data.availableAddOns,
    stock: data.stock,
    active: data.active,
    featured: data.featured,
  });

  return { id, ...input };
}

function toProduct(id: string, data: Record<string, unknown>): Product {
  return productFromData(id, data);
}

async function listProducts(options: InternalProductReadOptions = {}): Promise<Product[]> {
  if (options.includeInactive) requireCatalogPermission(options.caller, "productos.read");

  const query = options.includeInactive
    ? productCollection()
    : productCollection().where("active", "==", true);
  const snapshot = await query.get();

  return snapshot.docs.map((document) => toProduct(document.id, document.data() as Record<string, unknown>));
}

export function listActiveProducts(): Promise<Product[]> {
  return listProducts();
}

export function listAllProducts(caller: CatalogCaller): Promise<Product[]> {
  return listProducts({ includeInactive: true, caller });
}

export function getProductById(id: string): Promise<Product | null>;
export function getProductById(id: string, options: { includeInactive: true; caller: CatalogCaller }): Promise<Product | null>;
export async function getProductById(id: string, options: ProductReadOptions = {}): Promise<Product | null> {
  if (!id.trim()) return null;
  if (options.includeInactive) requireCatalogPermission(options.caller, "productos.read");

  const snapshot = await productCollection().doc(id).get();
  if (!snapshot.exists) return null;

  const product = toProduct(id, snapshot.data() as Record<string, unknown>);
  return options.includeInactive || product.active ? product : null;
}

export async function createProduct(input: ProductInput, caller: CatalogCaller, id?: string): Promise<string> {
  requireCatalogPermission(caller, "productos.write");
  const validated = productInputSchema.parse(input);
  const reference = id ? productCollection().doc(id) : productCollection().doc();
  const now = new Date().toISOString();

  const data = { ...validated, createdAt: now, updatedAt: now };
  await getAdminDb().runTransaction(async (transaction) => {
    transaction.set(reference, data);
    writeAuditInTransaction(transaction, { actorUid: caller.uid, action: "create", module: "productos", entityId: reference.id, changes: validated });
  });
  return reference.id;
}

export async function updateProduct(id: string, input: ProductInput, caller: CatalogCaller): Promise<void> {
  requireCatalogPermission(caller, "productos.write");
  const validated = productInputSchema.parse(input);
  const reference = productCollection().doc(id);
  const data = { ...validated, updatedAt: new Date().toISOString() };
  await getAdminDb().runTransaction(async (transaction) => {
    transaction.update(reference, data);
    writeAuditInTransaction(transaction, { actorUid: caller.uid, action: "update", module: "productos", entityId: id, changes: validated });
  });
}

export async function patchProduct(id: string, patch: Partial<ProductInput>, caller: CatalogCaller): Promise<Product> {
  requireCatalogPermission(caller, "productos.write");
  const reference = productCollection().doc(id);

  const updatedProduct = await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new Error("Producto no encontrado");
    }

    const current = snapshot.data() as Record<string, unknown>;
    const merged = {
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      price: patch.price ?? current.price,
      image: patch.image ?? current.image,
      category: patch.category ?? current.category,
      availableSizes: patch.availableSizes !== undefined ? patch.availableSizes : current.availableSizes,
      availableFlavors: patch.availableFlavors !== undefined ? patch.availableFlavors : current.availableFlavors,
      availableAddOns: patch.availableAddOns !== undefined ? patch.availableAddOns : current.availableAddOns,
      stock: patch.stock !== undefined ? patch.stock : current.stock,
      active: patch.active !== undefined ? patch.active : current.active,
      featured: patch.featured !== undefined ? patch.featured : current.featured,
    };

    const validated = productInputSchema.parse(merged);
    const data = { ...validated, updatedAt: new Date().toISOString() };
    transaction.update(reference, data);
    writeAuditInTransaction(transaction, {
      actorUid: caller.uid,
      action: "update",
      module: "productos",
      entityId: id,
      changes: patch,
    });
    return { id, ...validated };
  });

  return updatedProduct;
}

export async function updateProductImage(id: string, image: string, actorUid: string): Promise<void> {
  if (!id.trim() || !image.trim()) throw new Error("El producto y la imagen son obligatorios");
  const reference = productCollection().doc(id);
  const changes = { image };
  const data = { ...changes, updatedAt: new Date().toISOString() };
  await getAdminDb().runTransaction(async (transaction) => {
    transaction.update(reference, data);
    writeAuditInTransaction(transaction, { actorUid, action: "update", module: "productos", entityId: id, changes });
  });
}

export async function upsertImportedProduct(id: string, input: ProductInput, actorUid: string): Promise<"created" | "updated"> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("El identificador del producto no es válido");
  const validated = productInputSchema.parse(input);
  const reference = productCollection().doc(id);
  const result = await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const now = new Date().toISOString();
    const existingCreatedAt = snapshot.exists ? snapshot.data()?.createdAt : undefined;
    const createdAt = typeof existingCreatedAt === "string" ? existingCreatedAt : now;
    const data = { ...validated, createdAt, updatedAt: now };
    const action = snapshot.exists ? "updated" : "created";
    if (snapshot.exists) transaction.update(reference, data);
    else transaction.set(reference, data);
    writeAuditInTransaction(transaction, { actorUid, action: action === "created" ? "create" : "update", module: "productos", entityId: id, changes: validated });
    return action;
  });
  return result;
}

export async function deleteProduct(id: string, caller: CatalogCaller): Promise<void> {
  requireCatalogPermission(caller, "productos.write");
  const reference = productCollection().doc(id);
  await getAdminDb().runTransaction(async (transaction) => {
    transaction.delete(reference);
    writeAuditInTransaction(transaction, { actorUid: caller.uid, action: "delete", module: "productos", entityId: id });
  });
}

export async function seedProduct(input: ProductInput, id: string): Promise<void> {
  const validated = productInputSchema.parse(input);
  await productCollection().doc(id).set({ ...validated, updatedAt: new Date().toISOString() }, { merge: true });
}
