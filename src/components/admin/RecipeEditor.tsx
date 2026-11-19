"use client";

import {
  AlertTriangle,
  Calculator,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import {
  areUnitsCompatible,
  calculateRecipeCost,
  compactPresentationKey,
  convertRecipeQuantityToSupplyUnit,
  getCompatibleRecipeUnits,
  normalizePresentationKey,
  roundSupplyQuantity,
} from "@/lib/recipes/escandallo";
import {
  calculateSuggestedSalePrice,
  classifyMarginHealth,
  resolveAdminProductAddOns,
  resolveAdminProductSizes,
  resolveCatalogSalePriceCop,
  type RecipeCatalogProduct,
} from "@/lib/recipes/profitability";
import {
  LOW_MARGIN_CRITICAL_PCT,
  LOW_MARGIN_WARNING_PCT,
  TARGET_MARGIN_DEFAULT_PCT,
  type AddOnRecipeIngredient,
  type ProductRecipe,
  type RecipeIngredient,
  type RecipeUnit,
} from "@/types/recipes";
import type { SupplyItem } from "@/types/supplies";

export type RecipeEditorProps = {
  mode: "create" | "edit";
  initialRecipe?: ProductRecipe | null;
  initialProductId?: string;
  initialPresentation?: string;
  products: RecipeCatalogProduct[];
  supplies: SupplyItem[];
  existingRecipes?: ProductRecipe[];
  onSaved: (recipe: ProductRecipe) => void | Promise<void>;
  onClose: () => void;
};

type IngredientFormRow = {
  key: string;
  supplyId: string;
  quantity: string;
  unit: RecipeUnit;
  bottleVolumeMl: string;
  addOnName?: string;
};

const UNIT_LABELS: Record<RecipeUnit, string> = {
  ml: "ml (mililitros)",
  oz: "oz (30 ml)",
  l: "l (litros)",
  botella: "botella (750 ml)",
  g: "g (gramos)",
  kg: "kg (kilogramos)",
  unidad: "unidad",
};

const UNIT_PRESETS: Partial<Record<RecipeUnit, readonly string[]>> = {
  oz: ["1", "1.5", "2"],
  ml: ["30", "45", "60", "120"],
  unidad: ["1", "2"],
};

function formatCop(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

function makeRowKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createRowFromSupply(supply: SupplyItem, addOnName?: string): IngredientFormRow {
  const defaultUnit: RecipeUnit = supply.unit === "l" ? "ml" : supply.unit;
  return {
    key: makeRowKey(addOnName !== undefined ? "addon" : "ing"),
    supplyId: supply.id,
    quantity: defaultUnit === "ml" ? "30" : "1",
    unit: defaultUnit,
    bottleVolumeMl: "750",
    ...(addOnName !== undefined ? { addOnName } : {}),
  };
}

function rowsToRecipeIngredients(
  rows: readonly IngredientFormRow[],
  suppliesById: ReadonlyMap<string, SupplyItem>
): RecipeIngredient[] {
  const result: RecipeIngredient[] = [];
  for (const row of rows) {
    const supply = suppliesById.get(row.supplyId);
    const parsedQty = Number(row.quantity);
    if (!supply || !Number.isFinite(parsedQty) || parsedQty <= 0) continue;
    const bottleVol = row.unit === "botella" ? Number(row.bottleVolumeMl) : undefined;
    result.push({
      supplyId: supply.id,
      supplyName: supply.name,
      supplyUnit: supply.unit,
      quantity: parsedQty,
      unit: row.unit,
      ...(typeof bottleVol === "number" && Number.isFinite(bottleVol) && bottleVol > 0
        ? { bottleVolumeMl: bottleVol }
        : {}),
    });
  }
  return result;
}

function rowsToAddOnIngredients(
  rows: readonly IngredientFormRow[],
  suppliesById: ReadonlyMap<string, SupplyItem>
): AddOnRecipeIngredient[] {
  const result: AddOnRecipeIngredient[] = [];
  for (const row of rows) {
    const supply = suppliesById.get(row.supplyId);
    const parsedQty = Number(row.quantity);
    const addOnName = (row.addOnName ?? "").trim();
    if (!supply || !addOnName || !Number.isFinite(parsedQty) || parsedQty <= 0) continue;
    const bottleVol = row.unit === "botella" ? Number(row.bottleVolumeMl) : undefined;
    result.push({
      addOnName,
      supplyId: supply.id,
      supplyName: supply.name,
      supplyUnit: supply.unit,
      quantity: parsedQty,
      unit: row.unit,
      ...(typeof bottleVol === "number" && Number.isFinite(bottleVol) && bottleVol > 0
        ? { bottleVolumeMl: bottleVol }
        : {}),
    });
  }
  return result;
}

function getMarginBadgeMeta(marginPct: number): {
  label: string;
  textClass: string;
  badgeClass: string;
} {
  const health = classifyMarginHealth(marginPct);
  if (health === "critico") {
    return {
      label: `Crítico (<${LOW_MARGIN_CRITICAL_PCT}%)`,
      textClass: "text-rose-300",
      badgeClass: "border-rose-500/40 bg-rose-500/20 text-rose-200",
    };
  }
  if (health === "bajo") {
    return {
      label: `Margen bajo (<${LOW_MARGIN_WARNING_PCT}%)`,
      textClass: "text-amber-300",
      badgeClass: "border-amber-500/40 bg-amber-500/20 text-amber-200",
    };
  }
  return {
    label: "Saludable",
    textClass: "text-emerald-300",
    badgeClass: "border-emerald-500/40 bg-emerald-500/20 text-emerald-200",
  };
}

type InitialEditorState = {
  productId: string;
  presentation: string;
  customPresentation: string;
  yieldUnits: string;
  notes: string;
  active: boolean;
  ingredients: IngredientFormRow[];
  addOnIngredients: IngredientFormRow[];
};

function buildInitialEditorState(params: {
  mode: "create" | "edit";
  initialRecipe?: ProductRecipe | null;
  initialProductId?: string;
  initialPresentation?: string;
  products: readonly RecipeCatalogProduct[];
  supplies: readonly SupplyItem[];
}): InitialEditorState {
  const { mode, initialRecipe, initialProductId, initialPresentation, products, supplies } = params;
  const initialProduct =
    mode === "edit" && initialRecipe
      ? products.find((p) => p.id === initialRecipe.productId) ?? products[0]
      : initialProductId
        ? products.find((p) => p.id === initialProductId) ?? products[0]
        : products[0];

  const productSizes = initialProduct ? resolveAdminProductSizes(initialProduct) : [];
  const knownSizeNames = productSizes.map((s) => s.name);

  if (mode === "edit" && initialRecipe) {
    const isKnown =
      initialRecipe.presentation === "*" || knownSizeNames.includes(initialRecipe.presentation);
    return {
      productId: initialRecipe.productId,
      presentation: isKnown ? initialRecipe.presentation : "__custom__",
      customPresentation: isKnown ? "" : initialRecipe.presentation,
      yieldUnits: String(initialRecipe.yieldUnits),
      notes: initialRecipe.notes ?? "",
      active: initialRecipe.active,
      ingredients: initialRecipe.ingredients.map((ing) => ({
        key: makeRowKey("ing"),
        supplyId: ing.supplyId,
        quantity: String(ing.quantity),
        unit: ing.unit,
        bottleVolumeMl: String(ing.bottleVolumeMl ?? 750),
      })),
      addOnIngredients: initialRecipe.addOnIngredients.map((addon) => ({
        key: makeRowKey("addon"),
        addOnName: addon.addOnName,
        supplyId: addon.supplyId,
        quantity: String(addon.quantity),
        unit: addon.unit,
        bottleVolumeMl: String(addon.bottleVolumeMl ?? 750),
      })),
    };
  }

  const requestedPres = initialPresentation?.trim() ?? "";
  const matchedPres = requestedPres
    ? requestedPres === "*"
      ? "*"
      : knownSizeNames.find(
          (name) => normalizePresentationKey(name) === normalizePresentationKey(requestedPres)
        )
    : undefined;

  const presentation = matchedPres
    ? matchedPres
    : requestedPres
      ? "__custom__"
      : knownSizeNames[0] ?? "16 oz";

  const customPresentation = !matchedPres && requestedPres ? requestedPres : "";

  return {
    productId: initialProduct?.id ?? "",
    presentation,
    customPresentation,
    yieldUnits: "1",
    notes: "",
    active: true,
    ingredients: supplies[0] ? [createRowFromSupply(supplies[0])] : [],
    addOnIngredients: [],
  };
}

export function RecipeEditor({
  mode,
  initialRecipe,
  initialProductId,
  initialPresentation,
  products,
  supplies,
  existingRecipes = [],
  onSaved,
  onClose,
}: RecipeEditorProps) {
  const { user } = useAuth();

  const [initialState] = useState<InitialEditorState>(() =>
    buildInitialEditorState({
      mode,
      initialRecipe,
      initialProductId,
      initialPresentation,
      products,
      supplies,
    })
  );

  const [productId, setProductId] = useState(initialState.productId);
  const [presentation, setPresentation] = useState(initialState.presentation);
  const [customPresentation, setCustomPresentation] = useState(initialState.customPresentation);
  const [yieldUnits, setYieldUnits] = useState(initialState.yieldUnits);
  const [notes, setNotes] = useState(initialState.notes);
  const [active, setActive] = useState(initialState.active);
  const [ingredients, setIngredients] = useState<IngredientFormRow[]>(initialState.ingredients);
  const [addOnIngredients, setAddOnIngredients] = useState<IngredientFormRow[]>(
    initialState.addOnIngredients
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const suppliesById = useMemo(
    () => new Map(supplies.map((supply) => [supply.id, supply])),
    [supplies]
  );

  const selectedProduct = productsById.get(productId);
  const sizeOptions = selectedProduct ? resolveAdminProductSizes(selectedProduct) : [];
  const addOnOptions = resolveAdminProductAddOns(selectedProduct);

  const effectivePresentation =
    presentation === "__custom__" ? customPresentation.trim() : presentation;

  const duplicateRecipeConflict =
    productId && effectivePresentation
      ? (existingRecipes.find(
          (recipe) =>
            recipe.id !== initialRecipe?.id &&
            recipe.productId === productId &&
            compactPresentationKey(recipe.presentation) ===
              compactPresentationKey(effectivePresentation)
        ) ?? null)
      : null;

  const supplyCounts = new Map<string, number>();
  for (const row of ingredients) {
    if (!row.supplyId) continue;
    supplyCounts.set(row.supplyId, (supplyCounts.get(row.supplyId) ?? 0) + 1);
  }
  const duplicateSupplyIds = new Set(
    [...supplyCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id)
  );

  const rawYieldUnits = Number(yieldUnits);
  const parsedYieldUnits = Number.isFinite(rawYieldUnits) && rawYieldUnits > 0 ? rawYieldUnits : 1;

  const baseIngredientsParsed = rowsToRecipeIngredients(ingredients, suppliesById);
  const selectedSalePriceCop = resolveCatalogSalePriceCop(selectedProduct, effectivePresentation);

  const basePreview = calculateRecipeCost({
    ingredients: baseIngredientsParsed,
    addOnIngredients: [],
    suppliesById,
    yieldUnits: parsedYieldUnits,
    salePriceCop: selectedSalePriceCop,
  });

  const topCostLine =
    basePreview.lines.length > 0
      ? basePreview.lines.reduce((top, line) => (line.costCop > top.costCop ? line : top))
      : null;

  const suggestedPriceCop =
    basePreview.unitCostCop > 0
      ? calculateSuggestedSalePrice(basePreview.unitCostCop, TARGET_MARGIN_DEFAULT_PCT)
      : null;

  const rowCostBreakdown = new Map<
    string,
    { convertedQty: number; supplyUnit: string; costCop: number; sharePct: number }
  >();
  for (const row of ingredients) {
    const supply = suppliesById.get(row.supplyId);
    const qty = Number(row.quantity);
    const bottleVol = row.unit === "botella" ? Number(row.bottleVolumeMl) : 750;
    if (
      !supply ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !areUnitsCompatible(row.unit, supply.unit) ||
      (row.unit === "botella" && (!Number.isFinite(bottleVol) || bottleVol <= 0))
    ) {
      continue;
    }
    const perDrinkQty = roundSupplyQuantity(qty / parsedYieldUnits);
    const convertedQty = convertRecipeQuantityToSupplyUnit(
      perDrinkQty,
      row.unit,
      supply.unit,
      bottleVol
    );
    const costCop = Math.round(convertedQty * Math.max(0, supply.costPerUnit));
    const sharePct =
      basePreview.unitCostCop > 0
        ? Math.min(100, Number(((costCop / basePreview.unitCostCop) * 100).toFixed(1)))
        : 0;
    rowCostBreakdown.set(row.key, {
      convertedQty,
      supplyUnit: supply.unit,
      costCop,
      sharePct,
    });
  }

  const addOnCostByKey = new Map<string, number>();
  let totalAddOnsCostCop = 0;
  for (const row of addOnIngredients) {
    const supply = suppliesById.get(row.supplyId);
    const qty = Number(row.quantity);
    const bottleVol = row.unit === "botella" ? Number(row.bottleVolumeMl) : 750;
    if (
      !supply ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !areUnitsCompatible(row.unit, supply.unit) ||
      (row.unit === "botella" && (!Number.isFinite(bottleVol) || bottleVol <= 0))
    ) {
      continue;
    }
    const converted = convertRecipeQuantityToSupplyUnit(qty, row.unit, supply.unit, bottleVol);
    const extraCost = Math.round(converted * Math.max(0, supply.costPerUnit));
    addOnCostByKey.set(row.key, extraCost);
    totalAddOnsCostCop += extraCost;
  }

  function handleProductChange(nextProductId: string) {
    setProductId(nextProductId);
    const nextProduct = productsById.get(nextProductId);
    const sizes = nextProduct ? resolveAdminProductSizes(nextProduct) : [];
    setPresentation(sizes[0]?.name ?? "*");
    setCustomPresentation("");
  }

  function updateIngredientRow(
    collection: "ingredients" | "addOnIngredients",
    rowKey: string,
    patch: Partial<IngredientFormRow>
  ) {
    const updater = (prev: IngredientFormRow[]) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row;
        const updated = { ...row, ...patch };
        if (patch.supplyId) {
          const nextSupply = suppliesById.get(patch.supplyId);
          if (nextSupply && !areUnitsCompatible(updated.unit, nextSupply.unit)) {
            updated.unit = nextSupply.unit === "l" ? "ml" : nextSupply.unit;
          }
        }
        return updated;
      });

    if (collection === "ingredients") {
      setIngredients(updater);
    } else {
      setAddOnIngredients(updater);
    }
  }

  function removeIngredientRow(collection: "ingredients" | "addOnIngredients", rowKey: string) {
    if (collection === "ingredients") {
      setIngredients((prev) => prev.filter((row) => row.key !== rowKey));
    } else {
      setAddOnIngredients((prev) => prev.filter((row) => row.key !== rowKey));
    }
  }

  function addIngredientRow(collection: "ingredients" | "addOnIngredients", presetAddOn?: string) {
    if (supplies.length === 0) return;
    if (collection === "ingredients") {
      const usedIds = new Set(ingredients.map((row) => row.supplyId));
      const nextSupply = supplies.find((supply) => !usedIds.has(supply.id)) ?? supplies[0];
      if (!nextSupply) return;
      setIngredients((prev) => [...prev, createRowFromSupply(nextSupply)]);
    } else {
      const defaultSupply = supplies[0];
      if (!defaultSupply) return;
      setAddOnIngredients((prev) => [
        ...prev,
        createRowFromSupply(defaultSupply, presetAddOn ?? ""),
      ]);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setFormError(null);

    if (!productId || !effectivePresentation) {
      setFormError("Selecciona un producto y una presentación válida.");
      return;
    }

    if (duplicateSupplyIds.size > 0) {
      const duplicatedNames = [...duplicateSupplyIds]
        .map((id) => suppliesById.get(id)?.name ?? id)
        .join(", ");
      setFormError(`Tienes insumos duplicados en la receta base (${duplicatedNames}). Combínalos en una sola fila.`);
      return;
    }

    const validIngredients = rowsToRecipeIngredients(ingredients, suppliesById);
    if (validIngredients.length === 0) {
      setFormError("Agrega al menos un insumo válido en la receta base.");
      return;
    }

    const validAddOns = rowsToAddOnIngredients(addOnIngredients, suppliesById);
    const numericYield = Number(yieldUnits);
    if (!Number.isFinite(numericYield) || numericYield <= 0) {
      setFormError("El rendimiento debe ser mayor a 0.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const url =
        mode === "create"
          ? "/api/admin/recetas"
          : `/api/admin/recetas/${encodeURIComponent(initialRecipe?.id ?? "")}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const payload =
        mode === "create"
          ? {
              productId,
              productName: selectedProduct?.name ?? productId,
              presentation: effectivePresentation,
              ingredients: validIngredients,
              addOnIngredients: validAddOns,
              yieldUnits: numericYield,
              notes: notes.trim(),
              active,
            }
          : {
              productName: selectedProduct?.name,
              presentation: effectivePresentation,
              ingredients: validIngredients,
              addOnIngredients: validAddOns,
              yieldUnits: numericYield,
              notes: notes.trim(),
              active,
            };

      const res = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as {
        recipe?: ProductRecipe;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(body.error ?? "No se pudo guardar la receta.");
      }

      if (body.recipe) {
        await onSaved(body.recipe);
      } else {
        onClose();
      }
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : "Error al guardar la receta."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const hasSalePrice = typeof basePreview.salePriceCop === "number";
  const hasMargin = typeof basePreview.grossMarginPct === "number";
  const marginPct = basePreview.grossMarginPct ?? 0;
  const marginMeta = getMarginBadgeMeta(marginPct);
  const isLowMargin = hasMargin && marginPct < LOW_MARGIN_WARNING_PCT;
  const costBarPct =
    hasSalePrice && basePreview.salePriceCop && basePreview.salePriceCop > 0
      ? Math.min(100, Math.max(0, Math.round((basePreview.unitCostCop / basePreview.salePriceCop) * 100)))
      : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-editor-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              <Calculator className="h-5 w-5" />
            </span>
            <div>
              <h2 id="recipe-editor-title" className="text-lg font-extrabold text-white">
                {mode === "create"
                  ? "Nueva Receta y Escandallo"
                  : `Editar Receta — ${selectedProduct?.name ?? initialRecipe?.productName ?? ""}`}
              </h2>
              <p className="text-xs text-slate-400">
                Configura insumos en barra y valida tu margen real al instante.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar formulario de receta"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-700 text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-5">
          {/* Barra en vivo de Escandallo y Rentabilidad */}
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <TrendingUp className="h-4 w-4" />
                Escandallo y Rentabilidad en Vivo
              </span>
              {hasMargin ? (
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${marginMeta.badgeClass}`}
                >
                  {marginMeta.label}
                </span>
              ) : (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                  Sin precio de venta
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Precio Carta
                </span>
                <p className="mt-0.5 text-base font-extrabold text-white">
                  {hasSalePrice && basePreview.salePriceCop !== undefined
                    ? formatCop(basePreview.salePriceCop)
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Costo Real Base
                </span>
                <p className="mt-0.5 text-base font-extrabold text-amber-300">
                  {formatCop(basePreview.unitCostCop)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Utilidad Bruta
                </span>
                <p className="mt-0.5 text-base font-extrabold text-cyan-200">
                  {typeof basePreview.grossProfitCop === "number"
                    ? formatCop(basePreview.grossProfitCop)
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Margen Bruto
                </span>
                <p className={`mt-0.5 text-base font-black ${hasMargin ? marginMeta.textClass : "text-slate-300"}`}>
                  {hasMargin ? `${marginPct}%` : "—"}
                </p>
              </div>
            </div>

            {hasSalePrice && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Costo insumos ({costBarPct}%)</span>
                  <span>Margen ({Math.max(0, 100 - costBarPct)}%)</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-amber-400 transition-all"
                    style={{ width: `${costBarPct}%` }}
                  />
                  <div
                    className={`h-full transition-all ${
                      marginPct < LOW_MARGIN_CRITICAL_PCT
                        ? "bg-rose-500"
                        : marginPct < LOW_MARGIN_WARNING_PCT
                          ? "bg-cyan-400"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.max(0, 100 - costBarPct)}%` }}
                  />
                </div>
              </div>
            )}

            {isLowMargin && (
              <div
                role="status"
                className={`mt-3 flex flex-col gap-1.5 rounded-xl border p-3 text-xs ${
                  marginPct < LOW_MARGIN_CRITICAL_PCT
                    ? "border-rose-500/50 bg-rose-950/60 text-rose-100"
                    : "border-amber-500/50 bg-amber-950/50 text-amber-100"
                }`}
              >
                <p className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {marginPct < LOW_MARGIN_CRITICAL_PCT
                    ? "Alerta crítica de rentabilidad: este cóctel deja menos de 35% de margen."
                    : "Rentabilidad por debajo del 50%: revisa dosificación o precio de carta."}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-200">
                  {topCostLine && (
                    <span>
                      Mayor impacto: <strong>{topCostLine.supplyName}</strong> (
                      {formatCop(topCostLine.costCop)})
                    </span>
                  )}
                  {suggestedPriceCop !== null && suggestedPriceCop > 0 && (
                    <span className="font-semibold text-cyan-200">
                      Precio sugerido (margen {TARGET_MARGIN_DEFAULT_PCT}%):{" "}
                      <strong>{formatCop(suggestedPriceCop)}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/50 bg-rose-950/80 px-4 py-3 text-sm font-medium text-rose-100"
            >
              {formError}
            </div>
          )}

          {duplicateRecipeConflict && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-xs font-medium text-amber-100"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
              <span>
                Ya existe una receta para{" "}
                <strong>{duplicateRecipeConflict.productName}</strong> (
                {duplicateRecipeConflict.presentation}). Puedes editar la existente o usar otra
                presentación.
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="recipe-product"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Producto de carta
              </label>
              <select
                id="recipe-product"
                value={productId}
                disabled={mode === "edit"}
                onChange={(e) => handleProductChange(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none disabled:opacity-60"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="recipe-presentation"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Presentación / Vaso
              </label>
              <select
                id="recipe-presentation"
                value={presentation}
                onChange={(e) => setPresentation(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                {sizeOptions.map((size) => (
                  <option key={size.name} value={size.name}>
                    {size.name} ({size.price > 0 ? formatCop(size.price) : "Sin precio"})
                  </option>
                ))}
                <option value="*">Todas las presentaciones (*)</option>
                <option value="__custom__">Otra presentación...</option>
              </select>
            </div>

            {presentation === "__custom__" && (
              <div className="sm:col-span-2">
                <label
                  htmlFor="recipe-custom-presentation"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Nombre exacto de la presentación
                </label>
                <input
                  id="recipe-custom-presentation"
                  type="text"
                  value={customPresentation}
                  onChange={(e) => setCustomPresentation(e.target.value)}
                  placeholder="Ej: Jarra 32 oz o Copa 12 oz"
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="recipe-yield"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Rendimiento (porciones)
              </label>
              <input
                id="recipe-yield"
                type="number"
                min="0.1"
                step="any"
                value={yieldUnits}
                onChange={(e) => setYieldUnits(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="flex items-end">
              <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                <span className="font-semibold">Receta activa para descuento automático</span>
              </label>
            </div>
          </div>

          {/* Ingredientes base */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-cyan-300">
                  Ingredientes base por preparación
                </h3>
                <p className="text-xs text-slate-400">
                  Usa presets rápidos en barra o ajusta la cantidad exacta por vaso.
                </p>
              </div>
              <button
                type="button"
                onClick={() => addIngredientRow("ingredients")}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3.5 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/25"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar insumo base
              </button>
            </div>

            {duplicateSupplyIds.size > 0 && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/60 px-3.5 py-2.5 text-xs font-semibold text-rose-200"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Hay un insumo repetido en la lista base. Unifica las dosis en una sola fila.
                </span>
              </div>
            )}

            {ingredients.map((row, index) => {
              const supply = suppliesById.get(row.supplyId);
              const compatibleUnits = supply
                ? getCompatibleRecipeUnits(supply.unit)
                : (["ml", "oz", "l", "botella", "g", "kg", "unidad"] as const);
              const presets = UNIT_PRESETS[row.unit] ?? [];
              const breakdown = rowCostBreakdown.get(row.key);
              const isDuplicated = duplicateSupplyIds.has(row.supplyId);

              return (
                <div
                  key={row.key}
                  className={`space-y-2.5 rounded-xl border p-3 ${
                    isDuplicated
                      ? "border-rose-500/60 bg-rose-950/20"
                      : "border-slate-800 bg-slate-950/75"
                  }`}
                >
                  <div className="grid gap-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-5">
                      <label
                        htmlFor={`ing-supply-${row.key}`}
                        className="mb-1 block text-[11px] font-semibold uppercase text-slate-400"
                      >
                        Insumo #{index + 1}
                      </label>
                      <select
                        id={`ing-supply-${row.key}`}
                        value={row.supplyId}
                        onChange={(e) =>
                          updateIngredientRow("ingredients", row.key, {
                            supplyId: e.target.value,
                          })
                        }
                        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                      >
                        {supplies.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.unit} · {formatCop(s.costPerUnit)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`ing-qty-${row.key}`}
                        className="mb-1 block text-[11px] font-semibold uppercase text-slate-400"
                      >
                        Cantidad
                      </label>
                      <input
                        id={`ing-qty-${row.key}`}
                        type="number"
                        min="0.01"
                        step="any"
                        value={row.quantity}
                        onChange={(e) =>
                          updateIngredientRow("ingredients", row.key, {
                            quantity: e.target.value,
                          })
                        }
                        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                      />
                    </div>

                    <div className={row.unit === "botella" ? "sm:col-span-2" : "sm:col-span-4"}>
                      <label
                        htmlFor={`ing-unit-${row.key}`}
                        className="mb-1 block text-[11px] font-semibold uppercase text-slate-400"
                      >
                        Unidad
                      </label>
                      <select
                        id={`ing-unit-${row.key}`}
                        value={row.unit}
                        onChange={(e) =>
                          updateIngredientRow("ingredients", row.key, {
                            unit: e.target.value as RecipeUnit,
                          })
                        }
                        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                      >
                        {compatibleUnits.map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_LABELS[unit]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {row.unit === "botella" && (
                      <div className="sm:col-span-2">
                        <label
                          htmlFor={`ing-ml-${row.key}`}
                          className="mb-1 block text-[11px] font-semibold uppercase text-slate-400"
                        >
                          ml/botella
                        </label>
                        <input
                          id={`ing-ml-${row.key}`}
                          type="number"
                          min="1"
                          step="1"
                          value={row.bottleVolumeMl}
                          onChange={(e) =>
                            updateIngredientRow("ingredients", row.key, {
                              bottleVolumeMl: e.target.value,
                            })
                          }
                          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="flex justify-end sm:col-span-1">
                      <button
                        type="button"
                        aria-label={`Quitar ingrediente ${index + 1}`}
                        onClick={() => removeIngredientRow("ingredients", row.key)}
                        disabled={ingredients.length <= 1}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-950/50 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Presets táctiles + desglose de conversión y peso en costo */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {presets.map((presetVal) => {
                        const isSelected = row.quantity === presetVal;
                        return (
                          <button
                            key={presetVal}
                            type="button"
                            onClick={() =>
                              updateIngredientRow("ingredients", row.key, { quantity: presetVal })
                            }
                            aria-label={`Fijar ${presetVal} ${row.unit} para ingrediente ${index + 1}`}
                            className={`min-h-[44px] min-w-[44px] rounded-lg border px-2.5 text-xs font-bold transition ${
                              isSelected
                                ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white"
                            }`}
                          >
                            {presetVal} {row.unit}
                          </button>
                        );
                      })}
                    </div>

                    {breakdown && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400">
                          Descuenta:{" "}
                          <strong className="text-slate-200">
                            {breakdown.convertedQty} {breakdown.supplyUnit}
                          </strong>
                        </span>
                        <span className="font-bold text-amber-300">
                          {formatCop(breakdown.costCop)}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-300">
                          {breakdown.sharePct}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Adiciones opcionales */}
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-pink-300">
                  Insumos opcionales por adición
                </h3>
                <p className="text-xs text-slate-400">
                  No alteran el margen base del cóctel; se suman solo cuando el cliente pide la adición.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {addOnOptions.map((addon) => (
                  <button
                    key={addon.name}
                    type="button"
                    onClick={() => addIngredientRow("addOnIngredients", addon.name)}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-pink-500/40 bg-pink-500/10 px-3 text-xs font-semibold text-pink-200 hover:bg-pink-500/20"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {addon.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => addIngredientRow("addOnIngredients", "")}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Otra adición
                </button>
              </div>
            </div>

            {addOnIngredients.map((row, index) => {
              const supply = suppliesById.get(row.supplyId);
              const compatibleUnits = supply
                ? getCompatibleRecipeUnits(supply.unit)
                : (["ml", "oz", "l", "botella", "g", "kg", "unidad"] as const);
              const extraCost = addOnCostByKey.get(row.key) ?? 0;

              return (
                <div
                  key={row.key}
                  className="space-y-2 rounded-xl border border-pink-500/30 bg-slate-950/70 p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`addon-name-${row.key}`}
                        className="mb-1 block text-[11px] font-semibold uppercase text-pink-300"
                      >
                        Nombre adición #{index + 1}
                      </label>
                      <input
                        id={`addon-name-${row.key}`}
                        type="text"
                        value={row.addOnName ?? ""}
                        onChange={(e) =>
                          updateIngredientRow("addOnIngredients", row.key, {
                            addOnName: e.target.value,
                          })
                        }
                        placeholder="Ej: Shot extra"
                        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white focus:border-pink-400 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label
                        htmlFor={`addon-supply-${row.key}`}
                        className="mb-1 block text-[11px] font-semibold uppercase text-slate-400"
                      >
                        Insumo
                      </label>
                      <select
                        id={`addon-supply-${row.key}`}
                        value={row.supplyId}
                        onChange={(e) =>
                          updateIngredientRow("addOnIngredients", row.key, {
                            supplyId: e.target.value,
                          })
                        }
                        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white focus:border-pink-400 focus:outline-none"
                      >
                        {supplies.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`addon-qty-${row.key}`}
                        className="mb-1 block text-[11px] font-semibold uppercase text-slate-400"
                      >
                        Cantidad
                      </label>
                      <input
                        id={`addon-qty-${row.key}`}
                        type="number"
                        min="0.01"
                        step="any"
                        value={row.quantity}
                        onChange={(e) =>
                          updateIngredientRow("addOnIngredients", row.key, {
                            quantity: e.target.value,
                          })
                        }
                        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white focus:border-pink-400 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`addon-unit-${row.key}`}
                        className="mb-1 block text-[11px] font-semibold uppercase text-slate-400"
                      >
                        Unidad
                      </label>
                      <select
                        id={`addon-unit-${row.key}`}
                        value={row.unit}
                        onChange={(e) =>
                          updateIngredientRow("addOnIngredients", row.key, {
                            unit: e.target.value as RecipeUnit,
                          })
                        }
                        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white focus:border-pink-400 focus:outline-none"
                      >
                        {compatibleUnits.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-end sm:col-span-1">
                      <button
                        type="button"
                        aria-label={`Quitar adición ${index + 1}`}
                        onClick={() => removeIngredientRow("addOnIngredients", row.key)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-950/50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-pink-200">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" />
                      Costo adicional si el cliente la pide
                    </span>
                    <strong className="font-mono">{formatCop(extraCost)}</strong>
                  </div>
                </div>
              );
            })}

            {addOnIngredients.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-pink-500/20 bg-pink-950/20 px-3.5 py-2 text-xs text-pink-100">
                <span>Costo adicional total de adiciones configuradas</span>
                <strong className="font-mono text-pink-200">{formatCop(totalAddOnsCostCop)}</strong>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="recipe-notes"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
            >
              Notas técnicas de bar (opcional)
            </label>
            <input
              id="recipe-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Servir con hielo frappé y pitillo biodegradable"
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] rounded-xl bg-cyan-500 px-5 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
            >
              {submitting
                ? "Guardando..."
                : mode === "create"
                  ? "Guardar Receta"
                  : "Actualizar Receta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
