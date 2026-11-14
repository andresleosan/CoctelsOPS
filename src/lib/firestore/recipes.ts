import "server-only";

import { hasPermission, isGlobalAdmin } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import {
  areUnitsCompatible,
  buildOrderEscandalloAndConsumptions,
  calculateRecipeCost,
  compactPresentationKey,
  convertRecipeQuantityToSupplyUnit,
  getCompatibleRecipeUnits,
  getUnitDimension,
  matchRecipeForOrderItem,
  normalizePresentationKey,
  RecipeValidationError,
  roundSupplyQuantity,
} from "@/lib/recipes/escandallo";
import {
  addOnRecipeIngredientSchema,
  productRecipeInputSchema,
  productRecipePatchSchema,
  recipeIngredientSchema,
  recipeUnitSchema,
} from "@/lib/validation/recipes";
import { supplyUnitSchema } from "@/lib/validation/supplies";
import type { VerifiedUser } from "@/types/auth";
import type { Order } from "@/types/orders";
import {
  RECIPE_UNITS,
  type AddOnRecipeIngredient,
  type OrderEscandalloSummary,
  type ProductRecipe,
  type ProductRecipeInput,
  type ProductRecipePatch,
  type RecipeIngredient,
  type RecipeUnit,
} from "@/types/recipes";
import { calculateSupplyStatus, type SupplyItem, type SupplyUnit } from "@/types/supplies";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

export {
  areUnitsCompatible,
  buildOrderEscandalloAndConsumptions,
  calculateRecipeCost,
  compactPresentationKey,
  convertRecipeQuantityToSupplyUnit,
  getCompatibleRecipeUnits,
  getUnitDimension,
  matchRecipeForOrderItem,
  normalizePresentationKey,
  RecipeValidationError,
  roundSupplyQuantity,
};

export class RecipeNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Receta no encontrada") {
    super(message);
    this.name = "RecipeNotFoundError";
  }
}

export class RecipeConflictError extends Error {
  readonly status = 409;

  constructor(message = "Ya existe una receta para esta presentación del producto") {
    super(message);
    this.name = "RecipeConflictError";
  }
}

type FirestoreLike = ReturnType<typeof getAdminDb>;
type TransactionLike = Parameters<Parameters<FirestoreLike["runTransaction"]>[0]>[0];
type DocRefLike = ReturnType<ReturnType<FirestoreLike["collection"]>["doc"]>;

function isRecipeUnit(value: unknown): value is RecipeUnit {
  return typeof value === "string" && (RECIPE_UNITS as readonly string[]).includes(value);
}

function parseSupplyUnit(value: unknown): SupplyUnit {
  return supplyUnitSchema.parse(value);
}

function parseStoredIngredients(raw: unknown): RecipeIngredient[] {
  if (!Array.isArray(raw)) return [];
  const parsed: RecipeIngredient[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const supplyId = typeof data.supplyId === "string" ? data.supplyId.trim() : "";
    const supplyName = typeof data.supplyName === "string" ? data.supplyName.trim() : "";
    const quantity = typeof data.quantity === "number" && Number.isFinite(data.quantity) ? data.quantity : 0;
    const unit = isRecipeUnit(data.unit) ? data.unit : null;
    const parsedSupplyUnit = supplyUnitSchema.safeParse(data.supplyUnit);
    if (!supplyId || !unit || !parsedSupplyUnit.success || quantity <= 0) continue;

    parsed.push({
      supplyId,
      supplyName: supplyName || supplyId,
      supplyUnit: parsedSupplyUnit.data,
      quantity,
      unit,
      ...(typeof data.bottleVolumeMl === "number" && Number.isFinite(data.bottleVolumeMl) && data.bottleVolumeMl > 0
        ? { bottleVolumeMl: data.bottleVolumeMl }
        : {}),
    });
  }
  return parsed;
}

function parseStoredAddOnIngredients(raw: unknown): AddOnRecipeIngredient[] {
  if (!Array.isArray(raw)) return [];
  const parsed: AddOnRecipeIngredient[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const addOnName = typeof data.addOnName === "string" ? data.addOnName.trim() : "";
    const supplyId = typeof data.supplyId === "string" ? data.supplyId.trim() : "";
    const supplyName = typeof data.supplyName === "string" ? data.supplyName.trim() : "";
    const quantity = typeof data.quantity === "number" && Number.isFinite(data.quantity) ? data.quantity : 0;
    const unit = isRecipeUnit(data.unit) ? data.unit : null;
    const parsedSupplyUnit = supplyUnitSchema.safeParse(data.supplyUnit);
    if (!addOnName || !supplyId || !unit || !parsedSupplyUnit.success || quantity <= 0) continue;

    parsed.push({
      addOnName,
      supplyId,
      supplyName: supplyName || supplyId,
      supplyUnit: parsedSupplyUnit.data,
      quantity,
      unit,
      ...(typeof data.bottleVolumeMl === "number" && Number.isFinite(data.bottleVolumeMl) && data.bottleVolumeMl > 0
        ? { bottleVolumeMl: data.bottleVolumeMl }
        : {}),
    });
  }
  return parsed;
}

export function recipeFromData(id: string, data: Record<string, unknown>): ProductRecipe {
  const presentation = String(data.presentation ?? "").trim() || "*";
  const rawKey = typeof data.presentationKey === "string" ? data.presentationKey.trim() : "";
  const notes = typeof data.notes === "string" && data.notes.trim() ? data.notes.trim() : undefined;
  const yieldUnits =
    typeof data.yieldUnits === "number" && Number.isFinite(data.yieldUnits) && data.yieldUnits > 0
      ? data.yieldUnits
      : 1;

  return {
    id,
    negocioId:
      typeof data.negocioId === "string" && data.negocioId.trim()
        ? data.negocioId.trim()
        : DEFAULT_TENANT_ID,
    productId: String(data.productId ?? ""),
    productName: String(data.productName ?? ""),
    presentation,
    presentationKey: rawKey || normalizePresentationKey(presentation),
    ingredients: parseStoredIngredients(data.ingredients),
    addOnIngredients: parseStoredAddOnIngredients(data.addOnIngredients),
    yieldUnits,
    ...(notes ? { notes } : {}),
    active: data.active !== false,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };
}

type StoredSupplySnapshot = {
  id: string;
  ref: DocRefLike;
  negocioId: string;
  name: string;
  unit: SupplyUnit;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  active: boolean;
};

function parseSupplySnapshot(
  id: string,
  ref: DocRefLike,
  data: Record<string, unknown>
): StoredSupplySnapshot {
  return {
    id,
    ref,
    negocioId:
      typeof data.negocioId === "string" && data.negocioId.trim()
        ? data.negocioId.trim()
        : DEFAULT_TENANT_ID,
    name: String(data.name ?? "").trim() || id,
    unit: parseSupplyUnit(data.unit),
    currentStock:
      typeof data.currentStock === "number" && Number.isFinite(data.currentStock)
        ? Math.max(0, data.currentStock)
        : 0,
    minStock:
      typeof data.minStock === "number" && Number.isFinite(data.minStock)
        ? Math.max(0, data.minStock)
        : 0,
    costPerUnit:
      typeof data.costPerUnit === "number" && Number.isFinite(data.costPerUnit)
        ? Math.max(0, data.costPerUnit)
        : 0,
    active: data.active !== false,
  };
}

function requireRecipePermission(caller: VerifiedUser, permission: "inventario.read" | "inventario.write"): void {
  if (!hasPermission(caller.profile, permission)) {
    throw new AuthorizationError(403, "No tienes permisos sobre recetas e inventario");
  }
}

export function assertRecipeTenantAccess(caller: VerifiedUser, targetNegocioId: string): void {
  if (isGlobalAdmin(caller)) return;
  const userNegocioId = caller.profile.negocioId?.trim();
  if (userNegocioId && userNegocioId !== targetNegocioId) {
    throw new AuthorizationError(403, "No tienes acceso a recetas de otro negocio");
  }
}

function resolveTenantScope(caller: VerifiedUser, requestedNegocioId?: string): string {
  const cleanRequested = requestedNegocioId?.trim();
  if (cleanRequested) {
    assertRecipeTenantAccess(caller, cleanRequested);
    return cleanRequested;
  }
  const userNegocioId = caller.profile.negocioId?.trim();
  return userNegocioId || DEFAULT_TENANT_ID;
}

async function resolveAuthoritativeIngredients(params: {
  db: FirestoreLike;
  negocioId: string;
  ingredients: readonly RecipeIngredient[];
  addOnIngredients: readonly AddOnRecipeIngredient[];
}): Promise<{
  ingredients: RecipeIngredient[];
  addOnIngredients: AddOnRecipeIngredient[];
}> {
  const { db, negocioId, ingredients, addOnIngredients } = params;
  const uniqueIds = [...new Set([...ingredients.map((i) => i.supplyId), ...addOnIngredients.map((i) => i.supplyId)])];
  const snapshots = await Promise.all(
    uniqueIds.map(async (supplyId) => {
      const ref = db.collection("insumos").doc(supplyId);
      const snap = await ref.get();
      return { supplyId, ref, snap };
    })
  );

  const suppliesMap = new Map<string, StoredSupplySnapshot>();
  for (const { supplyId, ref, snap } of snapshots) {
    if (!snap.exists) {
      throw new RecipeValidationError(`Insumo no encontrado: ${supplyId}`);
    }
    const parsed = parseSupplySnapshot(supplyId, ref, (snap.data() ?? {}) as Record<string, unknown>);
    if (parsed.negocioId !== negocioId) {
      throw new AuthorizationError(403, `El insumo "${parsed.name}" pertenece a otro negocio`);
    }
    suppliesMap.set(supplyId, parsed);
  }

  const sanitizedIngredients: RecipeIngredient[] = ingredients.map((item) => {
    const supply = suppliesMap.get(item.supplyId);
    if (!supply) {
      throw new RecipeValidationError(`Insumo no encontrado: ${item.supplyId}`);
    }
    const unit = recipeUnitSchema.parse(item.unit);
    if (!areUnitsCompatible(unit, supply.unit)) {
      throw new RecipeValidationError(
        `Unidad incompatible para "${supply.name}": no se puede convertir "${unit}" a "${supply.unit}"`
      );
    }
    return recipeIngredientSchema.parse({
      supplyId: supply.id,
      supplyName: supply.name,
      supplyUnit: supply.unit,
      quantity: roundSupplyQuantity(item.quantity),
      unit,
      ...(typeof item.bottleVolumeMl === "number" ? { bottleVolumeMl: item.bottleVolumeMl } : {}),
    });
  });

  const sanitizedAddOns: AddOnRecipeIngredient[] = addOnIngredients.map((item) => {
    const supply = suppliesMap.get(item.supplyId);
    if (!supply) {
      throw new RecipeValidationError(`Insumo no encontrado: ${item.supplyId}`);
    }
    const unit = recipeUnitSchema.parse(item.unit);
    if (!areUnitsCompatible(unit, supply.unit)) {
      throw new RecipeValidationError(
        `Unidad incompatible para adición "${item.addOnName}" con "${supply.name}" (${supply.unit})`
      );
    }
    return addOnRecipeIngredientSchema.parse({
      addOnName: item.addOnName.trim(),
      supplyId: supply.id,
      supplyName: supply.name,
      supplyUnit: supply.unit,
      quantity: roundSupplyQuantity(item.quantity),
      unit,
      ...(typeof item.bottleVolumeMl === "number" ? { bottleVolumeMl: item.bottleVolumeMl } : {}),
    });
  });

  return {
    ingredients: sanitizedIngredients,
    addOnIngredients: sanitizedAddOns,
  };
}

async function ensureNoDuplicatePresentationRecipe(params: {
  db: FirestoreLike;
  negocioId: string;
  productId: string;
  presentationKey: string;
  excludeId?: string;
}): Promise<void> {
  const { db, negocioId, productId, presentationKey, excludeId } = params;
  const targetCompactKey = compactPresentationKey(presentationKey);
  const existingSnapshot = await db.collection("recetas").where("productId", "==", productId).get();
  for (const doc of existingSnapshot.docs) {
    if (excludeId && doc.id === excludeId) continue;
    const recipe = recipeFromData(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    if (
      recipe.negocioId === negocioId &&
      compactPresentationKey(recipe.presentation) === targetCompactKey
    ) {
      throw new RecipeConflictError(
        `Ya existe una receta para "${recipe.productName}" (${recipe.presentation})`
      );
    }
  }
}

async function recordRecipeAudit(params: {
  db: FirestoreLike;
  actorUid: string;
  action: "create" | "update" | "delete";
  entityId: string;
  changes: Record<string, unknown>;
  createdAt: string;
}): Promise<void> {
  const { db, actorUid, action, entityId, changes, createdAt } = params;
  await db.collection("auditoria").doc().set({
    actorUid,
    action,
    module: "recetas",
    entityId,
    changes,
    createdAt,
  });
}

export async function listRecipes(
  caller: VerifiedUser,
  options: { negocioId?: string; productId?: string } = {}
): Promise<ProductRecipe[]> {
  requireRecipePermission(caller, "inventario.read");
  const targetNegocioId = resolveTenantScope(caller, options.negocioId);
  const db = getAdminDb();
  const snapshot = await db.collection("recetas").where("negocioId", "==", targetNegocioId).get();

  const recipes = snapshot.docs
    .map((doc) => recipeFromData(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((recipe) => !options.productId || recipe.productId === options.productId);

  return recipes.sort((a, b) => {
    const byProduct = a.productName.localeCompare(b.productName, "es");
    return byProduct !== 0 ? byProduct : a.presentation.localeCompare(b.presentation, "es");
  });
}

export async function getRecipeById(caller: VerifiedUser, id: string): Promise<ProductRecipe> {
  requireRecipePermission(caller, "inventario.read");
  const trimmedId = id.trim();
  if (!trimmedId) throw new RecipeNotFoundError();
  const snapshot = await getAdminDb().collection("recetas").doc(trimmedId).get();
  if (!snapshot.exists) throw new RecipeNotFoundError();
  const recipe = recipeFromData(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
  assertRecipeTenantAccess(caller, recipe.negocioId);
  return recipe;
}

export async function getRecipesForProductIds(
  db: FirestoreLike,
  productIds: readonly string[],
  negocioId: string
): Promise<ProductRecipe[]> {
  const uniqueProductIds = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueProductIds.length === 0) return [];

  const collection = db.collection("recetas");
  if (!collection || typeof collection.where !== "function") {
    return [];
  }

  const collected: ProductRecipe[] = [];
  for (let i = 0; i < uniqueProductIds.length; i += 10) {
    const chunk = uniqueProductIds.slice(i, i + 10);
    const query = collection.where("productId", "in", chunk);
    if (!query || typeof query.get !== "function") continue;
    const snap = await query.get();
    if (!snap || !Array.isArray(snap.docs)) continue;
    for (const doc of snap.docs) {
      const recipe = recipeFromData(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
      if (recipe.active && recipe.negocioId === negocioId) {
        collected.push(recipe);
      }
    }
  }
  return collected;
}

export async function createRecipe(
  caller: VerifiedUser,
  input: ProductRecipeInput
): Promise<ProductRecipe> {
  requireRecipePermission(caller, "inventario.write");
  const validated = productRecipeInputSchema.parse(input);
  const targetNegocioId = resolveTenantScope(caller, validated.negocioId);
  const db = getAdminDb();

  const productSnap = await db.collection("productos").doc(validated.productId).get();
  if (!productSnap.exists) {
    throw new RecipeValidationError("El producto seleccionado no existe");
  }
  const productData = (productSnap.data() ?? {}) as Record<string, unknown>;
  const productNegocioId =
    typeof productData.negocioId === "string" && productData.negocioId.trim()
      ? productData.negocioId.trim()
      : DEFAULT_TENANT_ID;
  if (productNegocioId !== targetNegocioId) {
    throw new AuthorizationError(403, "El producto no pertenece a este negocio");
  }

  const presentation = validated.presentation.trim();
  const presentationKey = normalizePresentationKey(presentation);

  await ensureNoDuplicatePresentationRecipe({
    db,
    negocioId: targetNegocioId,
    productId: validated.productId,
    presentationKey,
  });

  const resolved = await resolveAuthoritativeIngredients({
    db,
    negocioId: targetNegocioId,
    ingredients: validated.ingredients,
    addOnIngredients: validated.addOnIngredients,
  });

  const now = new Date().toISOString();
  const productName = String(productData.name ?? "").trim() || validated.productName.trim();
  const cleanNotes = validated.notes?.trim();

  const docRef = db.collection("recetas").doc();
  const payload = {
    negocioId: targetNegocioId,
    productId: validated.productId,
    productName,
    presentation,
    presentationKey,
    ingredients: resolved.ingredients,
    addOnIngredients: resolved.addOnIngredients,
    yieldUnits: validated.yieldUnits,
    ...(cleanNotes ? { notes: cleanNotes } : {}),
    active: validated.active,
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(payload);
  await recordRecipeAudit({
    db,
    actorUid: caller.uid,
    action: "create",
    entityId: docRef.id,
    changes: {
      negocioId: targetNegocioId,
      productId: validated.productId,
      presentation,
      ingredientCount: resolved.ingredients.length,
    },
    createdAt: now,
  });

  return recipeFromData(docRef.id, payload);
}

export async function updateRecipe(
  caller: VerifiedUser,
  id: string,
  patch: ProductRecipePatch
): Promise<ProductRecipe> {
  requireRecipePermission(caller, "inventario.write");
  const trimmedId = id.trim();
  if (!trimmedId) throw new RecipeNotFoundError();
  const validated = productRecipePatchSchema.parse(patch);
  const db = getAdminDb();
  const docRef = db.collection("recetas").doc(trimmedId);
  const snap = await docRef.get();
  if (!snap.exists) throw new RecipeNotFoundError();

  const current = recipeFromData(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  assertRecipeTenantAccess(caller, current.negocioId);

  const nextPresentation = validated.presentation?.trim() || current.presentation;
  const nextPresentationKey = normalizePresentationKey(nextPresentation);

  if (nextPresentationKey !== current.presentationKey) {
    await ensureNoDuplicatePresentationRecipe({
      db,
      negocioId: current.negocioId,
      productId: current.productId,
      presentationKey: nextPresentationKey,
      excludeId: current.id,
    });
  }

  const resolved = await resolveAuthoritativeIngredients({
    db,
    negocioId: current.negocioId,
    ingredients: validated.ingredients ?? current.ingredients,
    addOnIngredients: validated.addOnIngredients ?? current.addOnIngredients,
  });

  const now = new Date().toISOString();
  const nextNotes = validated.notes !== undefined ? validated.notes.trim() : current.notes;

  const updatePayload = {
    ...(validated.productName ? { productName: validated.productName.trim() } : {}),
    presentation: nextPresentation,
    presentationKey: nextPresentationKey,
    ingredients: resolved.ingredients,
    addOnIngredients: resolved.addOnIngredients,
    yieldUnits: validated.yieldUnits ?? current.yieldUnits,
    ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
    active: validated.active ?? current.active,
    updatedAt: now,
  };

  await docRef.update(updatePayload);
  await recordRecipeAudit({
    db,
    actorUid: caller.uid,
    action: "update",
    entityId: current.id,
    changes: {
      presentation: nextPresentation,
      ingredientCount: resolved.ingredients.length,
      active: updatePayload.active,
    },
    createdAt: now,
  });

  return recipeFromData(current.id, {
    ...current,
    ...updatePayload,
  });
}

export async function deleteRecipe(caller: VerifiedUser, id: string): Promise<void> {
  requireRecipePermission(caller, "inventario.write");
  const trimmedId = id.trim();
  if (!trimmedId) throw new RecipeNotFoundError();
  const db = getAdminDb();
  const docRef = db.collection("recetas").doc(trimmedId);
  const snap = await docRef.get();
  if (!snap.exists) throw new RecipeNotFoundError();

  const current = recipeFromData(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  assertRecipeTenantAccess(caller, current.negocioId);

  await docRef.delete();
  await recordRecipeAudit({
    db,
    actorUid: caller.uid,
    action: "delete",
    entityId: current.id,
    changes: {
      productId: current.productId,
      productName: current.productName,
      presentation: current.presentation,
    },
    createdAt: new Date().toISOString(),
  });
}

export type PreparedOrderDepletion = {
  escandallo: OrderEscandalloSummary;
  applyWrites: (transaction: TransactionLike) => void;
};

/**
 * Ejecuta todas las lecturas de insumos DENTRO de la transacción ANTES de emitir escrituras,
 * respetando el invariante de Firestore (reads before writes) y garantizando el descuento idempotente.
 */
export async function prepareOrderSupplyDepletion(params: {
  db: FirestoreLike;
  transaction: TransactionLike;
  order: Order;
  actorUid: string;
  targetStatus: "preparando" | "entregado";
  negocioId: string;
  now: string;
}): Promise<PreparedOrderDepletion | null> {
  const { db, transaction, order, actorUid, targetStatus, negocioId, now } = params;
  if (order.items.length === 0) return null;

  const productIds = order.items.map((item) => item.productId);
  const recipes = await getRecipesForProductIds(db, productIds, negocioId);
  if (recipes.length === 0) return null;

  const matchedRecipes = order.items
    .map((item) => matchRecipeForOrderItem(recipes, item.productId, item.customization.size))
    .filter((recipe): recipe is ProductRecipe => recipe !== null);
  if (matchedRecipes.length === 0) return null;

  const supplyIds = new Set<string>();
  for (const recipe of matchedRecipes) {
    for (const ing of recipe.ingredients) supplyIds.add(ing.supplyId);
    for (const ing of recipe.addOnIngredients) supplyIds.add(ing.supplyId);
  }
  const uniqueSupplyIds = [...supplyIds].sort();
  if (uniqueSupplyIds.length === 0) return null;

  const supplySnapshots = await Promise.all(
    uniqueSupplyIds.map(async (supplyId) => {
      const ref = db.collection("insumos").doc(supplyId);
      const snapshot = await transaction.get(ref);
      return { supplyId, ref, snapshot };
    })
  );

  const supplyDocs = new Map<string, StoredSupplySnapshot>();
  const suppliesById = new Map<string, Pick<SupplyItem, "id" | "name" | "unit" | "costPerUnit">>();
  for (const { supplyId, ref, snapshot } of supplySnapshots) {
    if (!snapshot.exists) continue;
    const parsed = parseSupplySnapshot(supplyId, ref, (snapshot.data() ?? {}) as Record<string, unknown>);
    supplyDocs.set(supplyId, parsed);
    suppliesById.set(supplyId, {
      id: parsed.id,
      name: parsed.name,
      unit: parsed.unit,
      costPerUnit: parsed.costPerUnit,
    });
  }

  const plan = buildOrderEscandalloAndConsumptions({
    order,
    recipes,
    suppliesById,
    depletedAt: now,
    triggeredOnStatus: targetStatus,
  });
  if (!plan) return null;

  const operations: Array<{
    supply: StoredSupplySnapshot;
    requiredQuantity: number;
    previousStock: number;
    resultingStock: number;
    shortfallQuantity: number;
    nextStatus: ReturnType<typeof calculateSupplyStatus>;
    movementRef: DocRefLike;
    alertRef: DocRefLike | null;
  }> = [];

  const shortfallBySupplyId = new Map<string, number>();

  for (const consumption of plan.consumptions) {
    const supply = supplyDocs.get(consumption.supplyId);
    if (!supply) continue;
    const previousStock = supply.currentStock;
    const rawResulting = roundSupplyQuantity(previousStock - consumption.requiredQuantity);
    const resultingStock = Math.max(0, rawResulting);
    const shortfallQuantity = rawResulting < 0 ? roundSupplyQuantity(Math.abs(rawResulting)) : 0;
    if (shortfallQuantity > 0) {
      shortfallBySupplyId.set(supply.id, shortfallQuantity);
    }
    const nextStatus = calculateSupplyStatus(resultingStock, supply.minStock);
    const needsAlert = nextStatus === "bajo" || nextStatus === "critico" || shortfallQuantity > 0;

    operations.push({
      supply,
      requiredQuantity: consumption.requiredQuantity,
      previousStock,
      resultingStock,
      shortfallQuantity,
      nextStatus,
      movementRef: db.collection("inventario_movimientos").doc(),
      alertRef: needsAlert ? db.collection("notificaciones").doc() : null,
    });
  }

  if (shortfallBySupplyId.size > 0) {
    for (const itemCost of plan.escandallo.items) {
      for (const ing of itemCost.ingredients) {
        const shortfall = shortfallBySupplyId.get(ing.supplyId);
        if (shortfall && shortfall > 0) {
          ing.shortfallQuantity = shortfall;
        }
      }
    }
  }

  const applyWrites = (tx: TransactionLike): void => {
    for (const op of operations) {
      tx.update(op.supply.ref, {
        currentStock: op.resultingStock,
        status: op.nextStatus,
        updatedAt: now,
      });

      tx.create(op.movementRef, {
        negocioId,
        supplyId: op.supply.id,
        supplyName: op.supply.name,
        supplyUnit: op.supply.unit,
        type: "consumo",
        quantity: op.requiredQuantity,
        reason: `Comanda #${order.id.slice(0, 8)} (${targetStatus})`,
        orderId: order.id,
        actorUid,
        previousStock: op.previousStock,
        resultingStock: op.resultingStock,
        ...(op.shortfallQuantity > 0 ? { shortfallQuantity: op.shortfallQuantity } : {}),
        createdAt: now,
      });

      writeAuditInTransaction(tx, {
        actorUid,
        action: "create",
        module: "inventario",
        entityId: op.supply.id,
        changes: {
          source: "escandallo_auto_depletion",
          orderId: order.id,
          triggeredOnStatus: targetStatus,
          type: "consumo",
          quantity: op.requiredQuantity,
          previousStock: op.previousStock,
          resultingStock: op.resultingStock,
          status: op.nextStatus,
          ...(op.shortfallQuantity > 0 ? { shortfallQuantity: op.shortfallQuantity } : {}),
        },
      });

      if (op.alertRef) {
        const title =
          op.shortfallQuantity > 0
            ? "Stock insuficiente en comanda"
            : op.nextStatus === "critico"
              ? "Stock crítico de insumo"
              : "Stock bajo de insumo";
        const message =
          op.shortfallQuantity > 0
            ? `${op.supply.name} quedó en 0 ${op.supply.unit} (faltante estimado de ${op.shortfallQuantity} ${op.supply.unit}) al preparar #${order.id.slice(0, 8)}.`
            : `${op.supply.name} bajó a ${op.resultingStock} ${op.supply.unit} (mínimo ${op.supply.minStock} ${op.supply.unit}).`;
        tx.create(op.alertRef, {
          audience: "admin",
          negocioId,
          orderId: order.id,
          supplyId: op.supply.id,
          title,
          message,
          status: op.nextStatus,
          read: false,
          createdAt: now,
        });
      }
    }
  };

  return {
    escandallo: plan.escandallo,
    applyWrites,
  };
}
