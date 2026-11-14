import {
  GRAMS_PER_KG,
  ML_PER_LITER,
  ML_PER_OZ,
  STANDARD_BOTTLE_ML,
  type AddOnRecipeIngredient,
  type OrderEscandalloCoverage,
  type OrderEscandalloItemCost,
  type OrderEscandalloItemIngredient,
  type OrderEscandalloSummary,
  type ProductRecipe,
  type RecipeCostLine,
  type RecipeCostPreview,
  type RecipeIngredient,
  type RecipeUnit,
  type RecipeUnitDimension,
  type SupplyDepletionPlanItem,
} from "@/types/recipes";
import type { Order } from "@/types/orders";
import type { SupplyItem, SupplyUnit } from "@/types/supplies";

export class RecipeValidationError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "RecipeValidationError";
  }
}

export function roundSupplyQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(4));
}

export function normalizePresentationKey(presentation: string): string {
  const cleaned = presentation.trim().toLocaleLowerCase("es-CO").replace(/\s+/g, " ");
  return cleaned || "*";
}

export function compactPresentationKey(presentation: string): string {
  return normalizePresentationKey(presentation).replace(/\s+/g, "");
}

export function getUnitDimension(unit: RecipeUnit | SupplyUnit): RecipeUnitDimension {
  if (unit === "g" || unit === "kg") return "weight";
  if (unit === "unidad") return "count";
  return "volume";
}

export function areUnitsCompatible(recipeUnit: RecipeUnit, supplyUnit: SupplyUnit): boolean {
  return getUnitDimension(recipeUnit) === getUnitDimension(supplyUnit);
}

const COMPATIBLE_RECIPE_UNITS: Record<SupplyUnit, readonly RecipeUnit[]> = {
  ml: ["ml", "oz", "l", "botella"],
  l: ["ml", "oz", "l", "botella"],
  botella: ["ml", "oz", "l", "botella"],
  g: ["g", "kg"],
  kg: ["g", "kg"],
  unidad: ["unidad"],
};

export function getCompatibleRecipeUnits(supplyUnit: SupplyUnit): readonly RecipeUnit[] {
  return COMPATIBLE_RECIPE_UNITS[supplyUnit] ?? [supplyUnit];
}

function toMilliliters(quantity: number, unit: RecipeUnit, bottleVolumeMl: number): number {
  switch (unit) {
    case "ml":
      return quantity;
    case "oz":
      return quantity * ML_PER_OZ;
    case "l":
      return quantity * ML_PER_LITER;
    case "botella":
      return quantity * bottleVolumeMl;
    default:
      throw new RecipeValidationError(`La unidad "${unit}" no corresponde a volumen`);
  }
}

function fromMilliliters(milliliters: number, supplyUnit: SupplyUnit, bottleVolumeMl: number): number {
  switch (supplyUnit) {
    case "ml":
      return milliliters;
    case "l":
      return milliliters / ML_PER_LITER;
    case "botella":
      return milliliters / bottleVolumeMl;
    default:
      throw new RecipeValidationError(`La unidad de stock "${supplyUnit}" no corresponde a volumen`);
  }
}

function toGrams(quantity: number, unit: RecipeUnit): number {
  if (unit === "g") return quantity;
  if (unit === "kg") return quantity * GRAMS_PER_KG;
  throw new RecipeValidationError(`La unidad "${unit}" no corresponde a peso`);
}

function fromGrams(grams: number, supplyUnit: SupplyUnit): number {
  if (supplyUnit === "g") return grams;
  if (supplyUnit === "kg") return grams / GRAMS_PER_KG;
  throw new RecipeValidationError(`La unidad de stock "${supplyUnit}" no corresponde a peso`);
}

export function convertRecipeQuantityToSupplyUnit(
  quantity: number,
  recipeUnit: RecipeUnit,
  supplyUnit: SupplyUnit,
  bottleVolumeMl: number = STANDARD_BOTTLE_ML
): number {
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new RecipeValidationError("La cantidad del ingrediente debe ser mayor a 0");
  }
  if (typeof bottleVolumeMl !== "number" || !Number.isFinite(bottleVolumeMl) || bottleVolumeMl <= 0) {
    throw new RecipeValidationError("El volumen por botella debe ser mayor a 0");
  }
  if (!areUnitsCompatible(recipeUnit, supplyUnit)) {
    throw new RecipeValidationError(
      `Unidad incompatible: no se puede convertir "${recipeUnit}" al inventario en "${supplyUnit}"`
    );
  }
  if (recipeUnit === supplyUnit) {
    return roundSupplyQuantity(quantity);
  }

  const dimension = getUnitDimension(supplyUnit);
  if (dimension === "volume") {
    const ml = toMilliliters(quantity, recipeUnit, bottleVolumeMl);
    return roundSupplyQuantity(fromMilliliters(ml, supplyUnit, bottleVolumeMl));
  }
  if (dimension === "weight") {
    const grams = toGrams(quantity, recipeUnit);
    return roundSupplyQuantity(fromGrams(grams, supplyUnit));
  }
  return roundSupplyQuantity(quantity);
}

export function matchRecipeForOrderItem(
  recipes: readonly ProductRecipe[],
  productId: string,
  presentation: string
): ProductRecipe | null {
  const candidates = recipes.filter((recipe) => recipe.active && recipe.productId === productId);
  if (candidates.length === 0) return null;

  const exactKey = normalizePresentationKey(presentation);
  const exactMatch = candidates.find((recipe) => recipe.presentationKey === exactKey);
  if (exactMatch) return exactMatch;

  const compactKey = compactPresentationKey(presentation);
  const compactMatch = candidates.find(
    (recipe) => compactPresentationKey(recipe.presentation) === compactKey
  );
  if (compactMatch) return compactMatch;

  return candidates.find((recipe) => recipe.presentationKey === "*") ?? null;
}

type SupplyCostLike = Pick<SupplyItem, "id" | "name" | "unit" | "costPerUnit">;

export function calculateRecipeCost(params: {
  ingredients: readonly RecipeIngredient[];
  addOnIngredients?: readonly AddOnRecipeIngredient[];
  suppliesById: ReadonlyMap<string, SupplyCostLike>;
  selectedAddOns?: readonly string[];
  yieldUnits?: number;
  salePriceCop?: number;
}): RecipeCostPreview {
  const yieldUnits =
    typeof params.yieldUnits === "number" && Number.isFinite(params.yieldUnits) && params.yieldUnits > 0
      ? params.yieldUnits
      : 1;
  const selectedSet = new Set(
    (params.selectedAddOns ?? []).map((name) => name.trim().toLocaleLowerCase("es-CO"))
  );

  const lines: RecipeCostLine[] = [];
  let rawTotalCost = 0;

  for (const ingredient of params.ingredients) {
    const supply = params.suppliesById.get(ingredient.supplyId);
    const effectiveSupplyUnit = supply?.unit ?? ingredient.supplyUnit;
    const perDrinkRecipeQty = roundSupplyQuantity(ingredient.quantity / yieldUnits);
    const supplyQuantity = areUnitsCompatible(ingredient.unit, effectiveSupplyUnit)
      ? convertRecipeQuantityToSupplyUnit(
          perDrinkRecipeQty,
          ingredient.unit,
          effectiveSupplyUnit,
          ingredient.bottleVolumeMl
        )
      : 0;
    const unitCostCop = Math.max(0, supply?.costPerUnit ?? 0);
    const rawLineCost = supplyQuantity * unitCostCop;
    rawTotalCost += rawLineCost;

    lines.push({
      supplyId: ingredient.supplyId,
      supplyName: supply?.name ?? ingredient.supplyName,
      recipeQuantity: perDrinkRecipeQty,
      recipeUnit: ingredient.unit,
      supplyQuantity,
      supplyUnit: effectiveSupplyUnit,
      unitCostCop,
      costCop: Math.round(rawLineCost),
    });
  }

  for (const addOn of params.addOnIngredients ?? []) {
    if (!selectedSet.has(addOn.addOnName.trim().toLocaleLowerCase("es-CO"))) continue;
    const supply = params.suppliesById.get(addOn.supplyId);
    const effectiveSupplyUnit = supply?.unit ?? addOn.supplyUnit;
    const supplyQuantity = areUnitsCompatible(addOn.unit, effectiveSupplyUnit)
      ? convertRecipeQuantityToSupplyUnit(
          addOn.quantity,
          addOn.unit,
          effectiveSupplyUnit,
          addOn.bottleVolumeMl
        )
      : 0;
    const unitCostCop = Math.max(0, supply?.costPerUnit ?? 0);
    const rawLineCost = supplyQuantity * unitCostCop;
    rawTotalCost += rawLineCost;

    lines.push({
      supplyId: addOn.supplyId,
      supplyName: supply?.name ?? addOn.supplyName,
      recipeQuantity: addOn.quantity,
      recipeUnit: addOn.unit,
      supplyQuantity,
      supplyUnit: effectiveSupplyUnit,
      unitCostCop,
      costCop: Math.round(rawLineCost),
      addOnName: addOn.addOnName,
    });
  }

  const unitCostCop = Math.round(rawTotalCost);
  if (typeof params.salePriceCop === "number" && Number.isFinite(params.salePriceCop)) {
    const salePriceCop = Math.max(0, Math.round(params.salePriceCop));
    const grossProfitCop = salePriceCop - unitCostCop;
    const grossMarginPct =
      salePriceCop > 0 ? Number(((grossProfitCop / salePriceCop) * 100).toFixed(1)) : 0;

    return {
      unitCostCop,
      salePriceCop,
      grossProfitCop,
      grossMarginPct,
      lines,
    };
  }

  return { unitCostCop, lines };
}

export function buildOrderEscandalloAndConsumptions(params: {
  order: Pick<Order, "items" | "total">;
  recipes: readonly ProductRecipe[];
  suppliesById: ReadonlyMap<string, SupplyCostLike>;
  depletedAt: string;
  triggeredOnStatus: "preparando" | "entregado";
}): {
  escandallo: OrderEscandalloSummary;
  consumptions: SupplyDepletionPlanItem[];
} | null {
  const { order, recipes, suppliesById, depletedAt, triggeredOnStatus } = params;
  if (order.items.length === 0 || recipes.length === 0) return null;

  const consumptionMap = new Map<string, SupplyDepletionPlanItem>();
  const itemCosts: OrderEscandalloItemCost[] = [];
  let coveredItemsCount = 0;
  let totalCostRaw = 0;

  for (const item of order.items) {
    const recipe = matchRecipeForOrderItem(recipes, item.productId, item.customization.size);
    if (!recipe) {
      itemCosts.push({
        productId: item.productId,
        productName: item.name,
        presentation: item.customization.size,
        quantity: item.quantity,
        unitPriceCop: item.unitPrice,
        subtotalCop: item.subtotal,
        unitCostCop: 0,
        totalCostCop: 0,
        grossProfitCop: item.subtotal,
        grossMarginPct: item.subtotal > 0 ? 100 : 0,
        matchedAddOns: [],
        ingredients: [],
      });
      continue;
    }

    coveredItemsCount += 1;
    const preview = calculateRecipeCost({
      ingredients: recipe.ingredients,
      addOnIngredients: recipe.addOnIngredients,
      suppliesById,
      selectedAddOns: item.customization.addOns,
      yieldUnits: recipe.yieldUnits,
      salePriceCop: item.unitPrice,
    });

    const itemIngredients: OrderEscandalloItemIngredient[] = [];
    let itemRawCost = 0;
    const matchedAddOns = new Set<string>();

    for (const line of preview.lines) {
      const scaledRecipeQty = roundSupplyQuantity(line.recipeQuantity * item.quantity);
      const scaledSupplyQty = roundSupplyQuantity(line.supplyQuantity * item.quantity);
      const lineRawCost = scaledSupplyQty * line.unitCostCop;
      const lineCostCop = Math.round(lineRawCost);
      itemRawCost += lineRawCost;

      if (line.addOnName) {
        matchedAddOns.add(line.addOnName);
      }

      itemIngredients.push({
        supplyId: line.supplyId,
        supplyName: line.supplyName,
        recipeQuantity: scaledRecipeQty,
        recipeUnit: line.recipeUnit,
        supplyQuantity: scaledSupplyQty,
        supplyUnit: line.supplyUnit,
        unitCostCop: line.unitCostCop,
        costCop: lineCostCop,
        ...(line.addOnName ? { addOnName: line.addOnName } : {}),
      });

      if (scaledSupplyQty > 0) {
        const existing = consumptionMap.get(line.supplyId);
        if (existing) {
          existing.requiredQuantity = roundSupplyQuantity(existing.requiredQuantity + scaledSupplyQty);
          existing.costCop = Math.round(existing.requiredQuantity * line.unitCostCop);
        } else {
          consumptionMap.set(line.supplyId, {
            supplyId: line.supplyId,
            supplyName: line.supplyName,
            supplyUnit: line.supplyUnit,
            requiredQuantity: scaledSupplyQty,
            costCop: lineCostCop,
          });
        }
      }
    }

    const totalItemCostCop = Math.round(itemRawCost);
    totalCostRaw += itemRawCost;
    const grossProfitCop = item.subtotal - totalItemCostCop;
    const grossMarginPct =
      item.subtotal > 0 ? Number(((grossProfitCop / item.subtotal) * 100).toFixed(1)) : 0;

    itemCosts.push({
      productId: item.productId,
      productName: item.name,
      presentation: item.customization.size,
      quantity: item.quantity,
      unitPriceCop: item.unitPrice,
      subtotalCop: item.subtotal,
      recipeId: recipe.id,
      unitCostCop: preview.unitCostCop,
      totalCostCop: totalItemCostCop,
      grossProfitCop,
      grossMarginPct,
      matchedAddOns: [...matchedAddOns],
      ingredients: itemIngredients,
    });
  }

  if (coveredItemsCount === 0) {
    return null;
  }

  const totalCostCop = Math.round(totalCostRaw);
  const revenueCop = Math.max(0, Math.round(order.total));
  const grossProfitCop = revenueCop - totalCostCop;
  const grossMarginPct =
    revenueCop > 0 ? Number(((grossProfitCop / revenueCop) * 100).toFixed(1)) : 0;
  const coverage: OrderEscandalloCoverage =
    coveredItemsCount === order.items.length ? "complete" : "partial";

  return {
    escandallo: {
      totalCostCop,
      revenueCop,
      grossProfitCop,
      grossMarginPct,
      coveredItemsCount,
      totalItemsCount: order.items.length,
      coverage,
      depletedAt,
      triggeredOnStatus,
      items: itemCosts,
    },
    consumptions: [...consumptionMap.values()],
  };
}
