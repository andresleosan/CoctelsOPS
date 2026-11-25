import "server-only";

import { requireNegocioAccess, resolveAuthorizedNegocioId } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import type { VerifiedUser } from "@/types/auth";
import { DEFAULT_TENANT_ID } from "@/types/tenant";
import {
  calculateSupplyStatus,
  type SuppliesKpis,
  type SupplyItem,
  type SupplyItemInput,
  type SupplyMovement,
  type SupplyMovementInput,
  type SupplyMovementType,
} from "@/types/supplies";

export { calculateSupplyStatus };

export class SupplyValidationError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "SupplyValidationError";
  }
}

export function calculateSupplyStock(
  currentStock: number,
  movement: { type: SupplyMovementType; quantity: number }
): number {
  if (typeof currentStock !== "number" || isNaN(currentStock) || currentStock < 0) {
    throw new SupplyValidationError("El stock actual no es válido");
  }

  const { type, quantity } = movement;

  if (typeof quantity !== "number" || isNaN(quantity)) {
    throw new SupplyValidationError("La cantidad debe ser un número válido");
  }

  if (type === "entrada") {
    if (quantity <= 0) throw new SupplyValidationError("La cantidad de entrada debe ser mayor a 0");
    return Number((currentStock + quantity).toFixed(2));
  }

  if (type === "merma" || type === "consumo") {
    if (quantity <= 0) throw new SupplyValidationError(`La cantidad de ${type} debe ser mayor a 0`);
    if (quantity > currentStock) {
      throw new SupplyValidationError(`Stock insuficiente: disponible ${currentStock}, se intentó retirar ${quantity}`);
    }
    return Number((currentStock - quantity).toFixed(2));
  }

  if (type === "ajuste") {
    if (quantity < 0) throw new SupplyValidationError("El stock de ajuste no puede ser negativo");
    return Number(quantity.toFixed(2));
  }

  throw new SupplyValidationError("Tipo de movimiento no soportado");
}

export function calculateSuppliesKpis(supplies: SupplyItem[]): SuppliesKpis {
  return supplies.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.status === "critico") acc.criticos += 1;
      else if (item.status === "bajo") acc.bajos += 1;
      else acc.ok += 1;
      acc.valorTotalCop += Math.max(0, item.currentStock) * Math.max(0, item.costPerUnit || 0);
      return acc;
    },
    { total: 0, criticos: 0, bajos: 0, ok: 0, valorTotalCop: 0 }
  );
}

function normalizeTenantId(negocioId?: string): string {
  return negocioId?.trim() || DEFAULT_TENANT_ID;
}

function parseSupplyDoc(id: string, data: Record<string, unknown>): SupplyItem {
  const currentStock = typeof data.currentStock === "number" ? data.currentStock : 0;
  const minStock = typeof data.minStock === "number" ? data.minStock : 0;
  const rawNegocioId = typeof data.negocioId === "string" ? data.negocioId.trim() : "";
  return {
    id,
    negocioId: rawNegocioId || DEFAULT_TENANT_ID,
    name: typeof data.name === "string" ? data.name : "Insumo sin nombre",
    category: (data.category as SupplyItem["category"]) ?? "otro",
    unit: (data.unit as SupplyItem["unit"]) ?? "unidad",
    currentStock,
    minStock,
    costPerUnit: typeof data.costPerUnit === "number" ? data.costPerUnit : 0,
    supplier: typeof data.supplier === "string" ? data.supplier : undefined,
    notes: typeof data.notes === "string" ? data.notes : undefined,
    status: calculateSupplyStatus(currentStock, minStock),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

export async function listSupplies(negocioId: string = DEFAULT_TENANT_ID): Promise<SupplyItem[]> {
  const targetNegocioId = normalizeTenantId(negocioId);
  const snapshot = await getAdminDb()
    .collection("insumos")
    .where("negocioId", "==", targetNegocioId)
    .get();

  const supplies = snapshot.docs
    .map((doc) => parseSupplyDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((supply) => supply.negocioId === targetNegocioId);
  // Sort alphabetically by name
  return supplies.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

export async function listSuppliesForCaller(
  caller: VerifiedUser,
  negocioId?: string
): Promise<SupplyItem[]> {
  const targetNegocioId = resolveAuthorizedNegocioId(caller, negocioId);
  return listSupplies(targetNegocioId);
}

export async function getSupplyById(
  id: string,
  expectedNegocioId?: string
): Promise<SupplyItem | null> {
  const cleanId = id.trim();
  if (!cleanId) return null;
  const doc = await getAdminDb().collection("insumos").doc(cleanId).get();
  if (!doc.exists) return null;
  const supply = parseSupplyDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
  const cleanExpectedNegocioId = expectedNegocioId?.trim();
  if (cleanExpectedNegocioId && supply.negocioId !== cleanExpectedNegocioId) {
    throw new AuthorizationError(403, "No tienes permiso para acceder a insumos de otro negocio");
  }
  return supply;
}

export async function getSupplyByIdForCaller(
  caller: VerifiedUser,
  id: string
): Promise<SupplyItem | null> {
  const supply = await getSupplyById(id);
  if (!supply) return null;
  requireNegocioAccess(caller, supply.negocioId);
  return supply;
}

export async function createSupply(
  input: SupplyItemInput,
  actorUid: string,
  options?: { caller?: VerifiedUser }
): Promise<SupplyItem> {
  if (!input.name?.trim()) throw new SupplyValidationError("El nombre del insumo es obligatorio");

  const db = getAdminDb();
  const ref = db.collection("insumos").doc();
  const now = new Date().toISOString();
  const negocioId = options?.caller
    ? resolveAuthorizedNegocioId(options.caller, input.negocioId)
    : normalizeTenantId(input.negocioId);
  const currentStock = Number(input.currentStock || 0);
  const minStock = Number(input.minStock || 0);

  const supply: SupplyItem = {
    id: ref.id,
    negocioId,
    name: input.name.trim(),
    category: input.category,
    unit: input.unit,
    currentStock,
    minStock,
    costPerUnit: Number(input.costPerUnit || 0),
    supplier: input.supplier?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    status: calculateSupplyStatus(currentStock, minStock),
    createdAt: now,
    updatedAt: now,
  };

  await db.runTransaction(async (transaction) => {
    transaction.set(ref, supply);
    writeAuditInTransaction(transaction, {
      actorUid,
      action: "create",
      module: "inventario",
      entityId: ref.id,
      changes: {
        negocioId: supply.negocioId,
        supplyName: supply.name,
        initialStock: supply.currentStock,
        minStock: supply.minStock,
      },
    });
  });

  return supply;
}

export async function updateSupply(
  id: string,
  patch: Partial<SupplyItemInput>,
  actorUid: string,
  options?: { expectedNegocioId?: string; caller?: VerifiedUser }
): Promise<SupplyItem> {
  const db = getAdminDb();
  const ref = db.collection("insumos").doc(id);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new SupplyValidationError("Insumo no encontrado");

    const existing = parseSupplyDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    if (options?.caller) {
      requireNegocioAccess(options.caller, existing.negocioId);
    }
    const cleanExpectedNegocioId = options?.expectedNegocioId?.trim();
    if (cleanExpectedNegocioId && existing.negocioId !== cleanExpectedNegocioId) {
      throw new AuthorizationError(403, "No tienes permiso para actualizar insumos de otro negocio");
    }

    const now = new Date().toISOString();
    const { negocioId: _ignoredNegocioId, ...safePatch } = patch;
    void _ignoredNegocioId;

    const minStock = typeof safePatch.minStock === "number" ? safePatch.minStock : existing.minStock;
    const currentStock = existing.currentStock;
    const status = calculateSupplyStatus(currentStock, minStock);

    const updated: SupplyItem = {
      ...existing,
      ...(safePatch.name ? { name: safePatch.name.trim() } : {}),
      ...(safePatch.category ? { category: safePatch.category } : {}),
      ...(safePatch.unit ? { unit: safePatch.unit } : {}),
      ...(typeof safePatch.costPerUnit === "number" ? { costPerUnit: safePatch.costPerUnit } : {}),
      ...(safePatch.supplier !== undefined ? { supplier: safePatch.supplier.trim() || undefined } : {}),
      ...(safePatch.notes !== undefined ? { notes: safePatch.notes.trim() || undefined } : {}),
      minStock,
      status,
      updatedAt: now,
    };

    transaction.update(ref, { ...updated });
    writeAuditInTransaction(transaction, {
      actorUid,
      action: "update",
      module: "inventario",
      entityId: id,
      changes: {
        ...safePatch,
        negocioId: existing.negocioId,
      },
    });

    return updated;
  });
}

export async function recordSupplyMovement(
  input: SupplyMovementInput,
  options?: { caller?: VerifiedUser }
): Promise<SupplyMovement> {
  if (!input.supplyId.trim() || !input.actorUid.trim() || !input.reason.trim()) {
    throw new SupplyValidationError("Insumo, actor y motivo son obligatorios");
  }

  const db = getAdminDb();
  const supplyRef = db.collection("insumos").doc(input.supplyId);
  const movementRef = db.collection("inventario_movimientos").doc();

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(supplyRef);
    if (!snap.exists) throw new SupplyValidationError("Insumo no encontrado");

    const currentSupply = parseSupplyDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    if (options?.caller) {
      requireNegocioAccess(options.caller, currentSupply.negocioId);
    }
    const cleanInputNegocioId = input.negocioId?.trim();
    if (cleanInputNegocioId && currentSupply.negocioId !== cleanInputNegocioId) {
      throw new AuthorizationError(403, "No tienes permiso para registrar movimientos en otro negocio");
    }

    const previousStock = currentSupply.currentStock;
    const resultingStock = calculateSupplyStock(previousStock, {
      type: input.type,
      quantity: input.quantity,
    });
    const nextStatus = calculateSupplyStatus(resultingStock, currentSupply.minStock);
    const now = new Date().toISOString();

    const movement: SupplyMovement = {
      id: movementRef.id,
      supplyId: currentSupply.id,
      supplyName: currentSupply.name,
      negocioId: currentSupply.negocioId,
      type: input.type,
      quantity: input.quantity,
      previousStock,
      resultingStock,
      reason: input.reason.trim(),
      actorUid: input.actorUid,
      actorEmail: input.actorEmail,
      createdAt: now,
    };

    transaction.update(supplyRef, {
      currentStock: resultingStock,
      status: nextStatus,
      updatedAt: now,
    });

    transaction.set(movementRef, movement);

    writeAuditInTransaction(transaction, {
      actorUid: input.actorUid,
      action: "create",
      module: "inventario",
      entityId: currentSupply.id,
      changes: {
        negocioId: currentSupply.negocioId,
        type: input.type,
        quantity: input.quantity,
        previousStock,
        resultingStock,
        reason: input.reason,
      },
    });

    return movement;
  });
}

export async function listSupplyMovements(options?: {
  supplyId?: string;
  limit?: number;
  negocioId?: string;
  caller?: VerifiedUser;
}): Promise<SupplyMovement[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const targetNegocioId = options?.caller
    ? resolveAuthorizedNegocioId(options.caller, options.negocioId)
    : normalizeTenantId(options?.negocioId);
  const db = getAdminDb();

  const snapshot = await db
    .collection("inventario_movimientos")
    .where("negocioId", "==", targetNegocioId)
    .get();

  const cleanSupplyId = options?.supplyId?.trim();

  const movements = snapshot.docs
    .map((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const rawNegocioId = typeof data.negocioId === "string" ? data.negocioId.trim() : "";
      return {
        id: doc.id,
        supplyId: (data.supplyId as string) || (data.productId as string) || "",
        supplyName: (data.supplyName as string) || (data.productName as string) || "Movimiento",
        negocioId: rawNegocioId || DEFAULT_TENANT_ID,
        type: (data.type as SupplyMovementType) || "ajuste",
        quantity: typeof data.quantity === "number" ? data.quantity : 0,
        previousStock: typeof data.previousStock === "number" ? data.previousStock : 0,
        resultingStock: typeof data.resultingStock === "number" ? data.resultingStock : 0,
        reason: (data.reason as string) || "",
        actorUid: (data.actorUid as string) || "",
        actorEmail: (data.actorEmail as string) || undefined,
        createdAt: (data.createdAt as string) || new Date().toISOString(),
      };
    })
    .filter((movement) => movement.negocioId === targetNegocioId)
    .filter((movement) => !cleanSupplyId || movement.supplyId === cleanSupplyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return movements.slice(0, limit);
}
