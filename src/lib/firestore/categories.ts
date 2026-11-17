import "server-only";

import { esTokenAdminVerificado } from "@/lib/auth-claims";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import { categoryInputSchema } from "@/lib/validation/catalog";
import type { Category, CategoryInput, CatalogCaller } from "@/types/catalog";

function categoryCollection() {
  return getAdminDb().collection("categorias");
}

function toCategory(id: string, data: Record<string, unknown>): Category {
  return { id, ...categoryInputSchema.parse(data) };
}

function requireCategoryPermission(caller: CatalogCaller, permission: "categorias.read" | "categorias.write"): void {
  const isAdmin = esTokenAdminVerificado(caller.token) && caller.profile.accountType === "admin";
  if (!caller.profile.active || (!isAdmin && !caller.permissions.includes(permission))) {
    throw new AuthorizationError(403, "No tienes permiso para gestionar las categorías");
  }
}

export async function listCategories(): Promise<Category[]> {
  const snapshot = await categoryCollection().where("active", "==", true).get();
  return snapshot.docs
    .map((document) => toCategory(document.id, document.data() as Record<string, unknown>))
    .sort((left, right) => left.order - right.order);
}

export async function listAllCategories(caller: CatalogCaller): Promise<Category[]> {
  requireCategoryPermission(caller, "categorias.read");
  const snapshot = await categoryCollection().get();
  return snapshot.docs
    .map((document) => toCategory(document.id, document.data() as Record<string, unknown>))
    .sort((left, right) => left.order - right.order);
}

export async function createCategory(input: CategoryInput, caller: CatalogCaller, id?: string): Promise<string> {
  requireCategoryPermission(caller, "categorias.write");
  const validated = categoryInputSchema.parse(input);
  const reference = id ? categoryCollection().doc(id) : categoryCollection().doc();
  const data = { ...validated, updatedAt: new Date().toISOString() };
  await getAdminDb().runTransaction(async (transaction) => {
    transaction.set(reference, data);
    writeAuditInTransaction(transaction, { actorUid: caller.uid, action: "create", module: "categorias", entityId: reference.id, changes: validated });
  });
  return reference.id;
}

export async function updateCategory(id: string, input: CategoryInput, caller: CatalogCaller): Promise<void> {
  requireCategoryPermission(caller, "categorias.write");
  const reference = categoryCollection().doc(id);
  const validated = categoryInputSchema.parse(input);
  const data = { ...validated, updatedAt: new Date().toISOString() };
  await getAdminDb().runTransaction(async (transaction) => {
    transaction.update(reference, data);
    writeAuditInTransaction(transaction, { actorUid: caller.uid, action: "update", module: "categorias", entityId: id, changes: validated });
  });
}

export async function deleteCategory(id: string, caller: CatalogCaller): Promise<void> {
  requireCategoryPermission(caller, "categorias.write");
  const reference = categoryCollection().doc(id);
  await getAdminDb().runTransaction(async (transaction) => {
    transaction.delete(reference);
    writeAuditInTransaction(transaction, { actorUid: caller.uid, action: "delete", module: "categorias", entityId: id });
  });
}
