import { getProductSizes } from "@/lib/catalog/presentations";
import {
  calculateRecipeCost,
  compactPresentationKey,
  matchRecipeForOrderItem,
  normalizePresentationKey,
} from "@/lib/recipes/escandallo";
import type { ProductAddOn, ProductSize } from "@/types/catalog";
import {
  LOW_MARGIN_CRITICAL_PCT,
  LOW_MARGIN_WARNING_PCT,
  TARGET_MARGIN_DEFAULT_PCT,
  type CatalogProfitabilityReport,
  type CocktailProfitabilityItem,
  type MarginHealthStatus,
  type ProductRecipe,
  type UncoveredPresentationItem,
} from "@/types/recipes";
import type { SupplyItem } from "@/types/supplies";

export type RecipeCatalogSizeV2 = {
  id?: string;
  label: string;
  volumeOz?: number | null;
  priceCop?: number | null;
};

export type RecipeCatalogAddOnV2 = {
  id?: string;
  name: string;
  priceCop?: number | null;
  maxQuantity?: number;
};

export type RecipeCatalogProduct = {
  id: string;
  name: string;
  category?: string;
  price?: number | null;
  active?: boolean;
  negocioId?: string;
  availableSizes?: ProductSize[];
  sizes?: RecipeCatalogSizeV2[];
  availableAddOns?: ProductAddOn[];
  addOns?: RecipeCatalogAddOnV2[];
};

export function resolveAdminProductSizes(product: RecipeCatalogProduct): ProductSize[] {
  if (Array.isArray(product.availableSizes) && product.availableSizes.length > 0) {
    return product.availableSizes.filter(
      (size) => typeof size?.name === "string" && size.name.trim().length > 0
    );
  }

  if (Array.isArray(product.sizes) && product.sizes.length > 0) {
    const mapped = product.sizes
      .filter((size) => typeof size?.label === "string" && size.label.trim().length > 0)
      .map((size) => ({
        name: size.label.trim(),
        price:
          typeof size.priceCop === "number" && Number.isFinite(size.priceCop) && size.priceCop > 0
            ? Math.round(size.priceCop)
            : 0,
      }));
    if (mapped.length > 0) {
      return mapped;
    }
  }

  const basePrice =
    typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0
      ? Math.round(product.price)
      : 0;

  if (!product.category && basePrice <= 0) {
    return [];
  }

  return getProductSizes({
    availableSizes: undefined,
    category: product.category ?? "special",
    price: basePrice,
  }).filter((size) => size.price > 0 || Boolean(product.category));
}

export function resolveAdminProductAddOns(
  product: RecipeCatalogProduct | undefined
): Array<{ name: string; price: number }> {
  if (!product) return [];

  if (Array.isArray(product.availableAddOns) && product.availableAddOns.length > 0) {
    return product.availableAddOns
      .filter((addon) => typeof addon?.name === "string" && addon.name.trim().length > 0)
      .map((addon) => ({
        name: addon.name.trim(),
        price:
          typeof addon.price === "number" && Number.isFinite(addon.price)
            ? Math.max(0, Math.round(addon.price))
            : 0,
      }));
  }

  if (Array.isArray(product.addOns) && product.addOns.length > 0) {
    return product.addOns
      .filter((addon) => typeof addon?.name === "string" && addon.name.trim().length > 0)
      .map((addon) => ({
        name: addon.name.trim(),
        price:
          typeof addon.priceCop === "number" && Number.isFinite(addon.priceCop)
            ? Math.max(0, Math.round(addon.priceCop))
            : 0,
      }));
  }

  return [];
}

export function resolveCatalogSalePriceCop(
  product: RecipeCatalogProduct | undefined,
  presentation: string
): number | undefined {
  if (!product) return undefined;

  const targetKey = normalizePresentationKey(presentation);
  const targetCompact = compactPresentationKey(presentation);
  const sizes = resolveAdminProductSizes(product);

  const exactSize =
    sizes.find((size) => normalizePresentationKey(size.name) === targetKey) ??
    sizes.find((size) => compactPresentationKey(size.name) === targetCompact);

  if (exactSize) {
    return exactSize.price > 0 ? exactSize.price : undefined;
  }

  if (targetKey === "*") {
    const firstPositive = sizes.find((size) => size.price > 0)?.price;
    if (typeof firstPositive === "number" && firstPositive > 0) {
      return firstPositive;
    }
    if (typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0) {
      return Math.round(product.price);
    }
    return undefined;
  }

  if (sizes.length === 0 && typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0) {
    return Math.round(product.price);
  }

  return undefined;
}

export function classifyMarginHealth(
  grossMarginPct: number,
  options?: { criticalPct?: number; warningPct?: number }
): MarginHealthStatus {
  const criticalPct = options?.criticalPct ?? LOW_MARGIN_CRITICAL_PCT;
  const warningPct = options?.warningPct ?? LOW_MARGIN_WARNING_PCT;
  if (grossMarginPct < criticalPct) return "critico";
  if (grossMarginPct < warningPct) return "bajo";
  return "saludable";
}

export function calculateSuggestedSalePrice(
  unitCostCop: number,
  targetMarginPct: number = TARGET_MARGIN_DEFAULT_PCT
): number {
  if (
    typeof unitCostCop !== "number" ||
    !Number.isFinite(unitCostCop) ||
    unitCostCop <= 0 ||
    typeof targetMarginPct !== "number" ||
    !Number.isFinite(targetMarginPct) ||
    targetMarginPct <= 0 ||
    targetMarginPct >= 95
  ) {
    return 0;
  }

  const rawSuggested = unitCostCop / (1 - targetMarginPct / 100);
  return Math.ceil(rawSuggested / 500) * 500;
}

type SupplyCostInput = Pick<SupplyItem, "id" | "name" | "unit" | "costPerUnit">;

export function buildCatalogProfitabilityReport(params: {
  recipes: readonly ProductRecipe[];
  products: readonly RecipeCatalogProduct[];
  supplies: readonly SupplyCostInput[];
  warningMarginPct?: number;
  criticalMarginPct?: number;
  targetMarginPct?: number;
}): CatalogProfitabilityReport {
  const warningMarginPct = params.warningMarginPct ?? LOW_MARGIN_WARNING_PCT;
  const criticalMarginPct = params.criticalMarginPct ?? LOW_MARGIN_CRITICAL_PCT;
  const targetMarginPct = params.targetMarginPct ?? TARGET_MARGIN_DEFAULT_PCT;

  const productsById = new Map<string, RecipeCatalogProduct>();
  for (const product of params.products) {
    productsById.set(product.id, product);
  }

  const suppliesById = new Map<string, SupplyCostInput>();
  for (const supply of params.supplies) {
    suppliesById.set(supply.id, supply);
  }

  const items: CocktailProfitabilityItem[] = params.recipes.map((recipe) => {
    const product = productsById.get(recipe.productId);
    const salePriceCop = resolveCatalogSalePriceCop(product, recipe.presentation);
    const preview = calculateRecipeCost({
      ingredients: recipe.ingredients,
      addOnIngredients: recipe.addOnIngredients,
      suppliesById,
      yieldUnits: recipe.yieldUnits,
      salePriceCop,
    });

    const baseLines = preview.lines.filter((line) => !line.addOnName);
    let topLine = baseLines[0];
    for (const line of baseLines) {
      if (!topLine || line.costCop > topLine.costCop) {
        topLine = line;
      }
    }

    const topCostSharePct =
      topLine && preview.unitCostCop > 0
        ? Number(((topLine.costCop / preview.unitCostCop) * 100).toFixed(1))
        : undefined;

    const grossMarginPct =
      typeof preview.grossMarginPct === "number" ? preview.grossMarginPct : null;
    const grossProfitCop =
      typeof preview.grossProfitCop === "number" ? preview.grossProfitCop : null;
    const health: MarginHealthStatus =
      grossMarginPct !== null
        ? classifyMarginHealth(grossMarginPct, {
            criticalPct: criticalMarginPct,
            warningPct: warningMarginPct,
          })
        : "saludable";

    const suggestedPriceCop =
      preview.unitCostCop > 0
        ? calculateSuggestedSalePrice(preview.unitCostCop, targetMarginPct)
        : null;

    return {
      recipeId: recipe.id,
      productId: recipe.productId,
      productName: product?.name?.trim() || recipe.productName,
      presentation: recipe.presentation,
      salePriceCop: typeof salePriceCop === "number" ? salePriceCop : null,
      unitCostCop: preview.unitCostCop,
      grossProfitCop,
      grossMarginPct,
      health,
      suggestedPriceCop,
      ingredientCount: recipe.ingredients.length,
      addOnCount: recipe.addOnIngredients.length,
      ...(topLine ? { topCostSupplyName: topLine.supplyName } : {}),
      ...(typeof topCostSharePct === "number" ? { topCostSharePct } : {}),
      active: recipe.active,
    };
  });

  const sortedItems = [...items].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.grossMarginPct === null && b.grossMarginPct === null) {
      return a.productName.localeCompare(b.productName, "es");
    }
    if (a.grossMarginPct === null) return 1;
    if (b.grossMarginPct === null) return -1;
    if (a.grossMarginPct !== b.grossMarginPct) return a.grossMarginPct - b.grossMarginPct;
    return a.productName.localeCompare(b.productName, "es");
  });

  const activeItems = sortedItems.filter((item) => item.active);
  const activeRecipes = params.recipes.filter((recipe) => recipe.active);
  const lowMarginAlerts = activeItems.filter(
    (item) => item.grossMarginPct !== null && item.grossMarginPct < warningMarginPct
  );

  const activeProducts = params.products.filter((product) => product.active !== false);
  const uncoveredPresentations: UncoveredPresentationItem[] = [];
  const coveredProductIds = new Set<string>();

  for (const product of activeProducts) {
    const sizes = resolveAdminProductSizes(product);
    if (sizes.length === 0) {
      const matched = matchRecipeForOrderItem(activeRecipes, product.id, "*");
      if (matched) {
        coveredProductIds.add(product.id);
      } else {
        uncoveredPresentations.push({
          productId: product.id,
          productName: product.name,
          presentation: "Estándar",
          salePriceCop:
            typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0
              ? Math.round(product.price)
              : null,
        });
      }
      continue;
    }

    let hasAtLeastOneCovered = false;
    for (const size of sizes) {
      const matched = matchRecipeForOrderItem(activeRecipes, product.id, size.name);
      if (matched) {
        hasAtLeastOneCovered = true;
      } else {
        uncoveredPresentations.push({
          productId: product.id,
          productName: product.name,
          presentation: size.name,
          salePriceCop: size.price > 0 ? size.price : null,
        });
      }
    }
    if (hasAtLeastOneCovered) {
      coveredProductIds.add(product.id);
    }
  }

  if (activeProducts.length === 0) {
    for (const recipe of activeRecipes) {
      coveredProductIds.add(recipe.productId);
    }
  }

  const activeRecipeCount = activeItems.length;
  const averageCostCop =
    activeRecipeCount > 0
      ? Math.round(activeItems.reduce((sum, item) => sum + item.unitCostCop, 0) / activeRecipeCount)
      : 0;
  const itemsWithMargin = activeItems.filter(
    (item): item is CocktailProfitabilityItem & { grossMarginPct: number } =>
      item.grossMarginPct !== null
  );
  const averageMarginPct =
    itemsWithMargin.length > 0
      ? Number(
          (
            itemsWithMargin.reduce((sum, item) => sum + item.grossMarginPct, 0) /
            itemsWithMargin.length
          ).toFixed(1)
        )
      : 0;

  const totalActiveProducts = activeProducts.length;
  const coveredProductCount = coveredProductIds.size;
  const coveragePct =
    totalActiveProducts > 0
      ? Number(((coveredProductCount / totalActiveProducts) * 100).toFixed(1))
      : activeRecipeCount > 0
        ? 100
        : 0;

  return {
    summary: {
      activeRecipeCount,
      coveredProductCount,
      totalActiveProducts,
      coveragePct,
      averageCostCop,
      averageMarginPct,
      lowMarginCount: lowMarginAlerts.length,
      criticalMarginCount: lowMarginAlerts.filter((item) => item.health === "critico").length,
      targetMarginPct,
      warningMarginPct,
      criticalMarginPct,
    },
    items: sortedItems,
    lowMarginAlerts,
    uncoveredPresentations,
  };
}
