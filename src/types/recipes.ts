import type { SupplyUnit } from "@/types/supplies";

export const RECIPE_UNITS = [
  "ml",
  "oz",
  "l",
  "g",
  "kg",
  "unidad",
  "botella",
] as const;

export type RecipeUnit = (typeof RECIPE_UNITS)[number];

export type RecipeUnitDimension = "volume" | "weight" | "count";

/**
 * Conversión estándar de barra/dosificador en Coctels OPS:
 * 1 oz = 30 ml (25 oz por botella estándar de 750 ml).
 */
export const ML_PER_OZ = 30;
export const ML_PER_LITER = 1000;
export const STANDARD_BOTTLE_ML = 750;
export const GRAMS_PER_KG = 1000;

export type RecipeIngredient = {
  supplyId: string;
  supplyName: string;
  supplyUnit: SupplyUnit;
  quantity: number;
  unit: RecipeUnit;
  bottleVolumeMl?: number;
};

export type AddOnRecipeIngredient = RecipeIngredient & {
  addOnName: string;
};

export type ProductRecipe = {
  id: string;
  negocioId: string;
  productId: string;
  productName: string;
  presentation: string;
  presentationKey: string;
  ingredients: RecipeIngredient[];
  addOnIngredients: AddOnRecipeIngredient[];
  yieldUnits: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductRecipeInput = {
  negocioId?: string;
  productId: string;
  productName: string;
  presentation: string;
  ingredients: RecipeIngredient[];
  addOnIngredients?: AddOnRecipeIngredient[];
  yieldUnits?: number;
  notes?: string;
  active?: boolean;
};

export type ProductRecipePatch = Partial<Omit<ProductRecipeInput, "negocioId" | "productId">>;

export type RecipeCostLine = {
  supplyId: string;
  supplyName: string;
  recipeQuantity: number;
  recipeUnit: RecipeUnit;
  supplyQuantity: number;
  supplyUnit: SupplyUnit;
  unitCostCop: number;
  costCop: number;
  addOnName?: string;
};

export type RecipeCostPreview = {
  unitCostCop: number;
  salePriceCop?: number;
  grossProfitCop?: number;
  grossMarginPct?: number;
  lines: RecipeCostLine[];
};

export type OrderEscandalloItemIngredient = {
  supplyId: string;
  supplyName: string;
  recipeQuantity: number;
  recipeUnit: RecipeUnit;
  supplyQuantity: number;
  supplyUnit: SupplyUnit;
  unitCostCop: number;
  costCop: number;
  shortfallQuantity?: number;
  addOnName?: string;
};

export type OrderEscandalloItemCost = {
  productId: string;
  productName: string;
  presentation: string;
  quantity: number;
  unitPriceCop: number;
  subtotalCop: number;
  recipeId?: string;
  unitCostCop: number;
  totalCostCop: number;
  grossProfitCop: number;
  grossMarginPct: number;
  matchedAddOns: string[];
  ingredients: OrderEscandalloItemIngredient[];
};

export type OrderEscandalloCoverage = "complete" | "partial" | "none";

export type OrderEscandalloSummary = {
  totalCostCop: number;
  revenueCop: number;
  grossProfitCop: number;
  grossMarginPct: number;
  coveredItemsCount: number;
  totalItemsCount: number;
  coverage: OrderEscandalloCoverage;
  depletedAt: string;
  triggeredOnStatus: "preparando" | "entregado";
  items: OrderEscandalloItemCost[];
};

export type SupplyDepletionPlanItem = {
  supplyId: string;
  supplyName: string;
  supplyUnit: SupplyUnit;
  requiredQuantity: number;
  costCop: number;
};

export const LOW_MARGIN_CRITICAL_PCT = 35;
export const LOW_MARGIN_WARNING_PCT = 50;
export const TARGET_MARGIN_DEFAULT_PCT = 60;

export type MarginHealthStatus = "saludable" | "bajo" | "critico";

export type CocktailProfitabilityItem = {
  recipeId: string;
  productId: string;
  productName: string;
  presentation: string;
  salePriceCop: number | null;
  unitCostCop: number;
  grossProfitCop: number | null;
  grossMarginPct: number | null;
  health: MarginHealthStatus;
  suggestedPriceCop: number | null;
  ingredientCount: number;
  addOnCount: number;
  topCostSupplyName?: string;
  topCostSharePct?: number;
  active: boolean;
};

export type UncoveredPresentationItem = {
  productId: string;
  productName: string;
  presentation: string;
  salePriceCop: number | null;
};

export type CatalogProfitabilitySummary = {
  activeRecipeCount: number;
  coveredProductCount: number;
  totalActiveProducts: number;
  coveragePct: number;
  averageCostCop: number;
  averageMarginPct: number;
  lowMarginCount: number;
  criticalMarginCount: number;
  targetMarginPct: number;
  warningMarginPct: number;
  criticalMarginPct: number;
};

export type CatalogProfitabilityReport = {
  summary: CatalogProfitabilitySummary;
  items: CocktailProfitabilityItem[];
  lowMarginAlerts: CocktailProfitabilityItem[];
  uncoveredPresentations: UncoveredPresentationItem[];
};

export type PeriodCocktailProfitabilityItem = {
  productId: string;
  productName: string;
  presentation: string;
  recipeId?: string;
  unitsSold: number;
  revenueCop: number;
  totalCostCop: number;
  grossProfitCop: number;
  grossMarginPct: number;
  unitCostCop: number;
  averagePriceCop: number;
  health: MarginHealthStatus;
};

export type OrderProfitabilitySummary = {
  coveredOrderCount: number;
  totalEligibleOrderCount: number;
  revenueCop: number;
  totalCostCop: number;
  grossProfitCop: number;
  grossMarginPct: number;
  cocktails: PeriodCocktailProfitabilityItem[];
  lowMarginAlerts: PeriodCocktailProfitabilityItem[];
};
