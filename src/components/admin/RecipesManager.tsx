"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Check,
  FlaskConical,
  Layers,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { PermissionGate } from "@/components/admin/PermissionGate";
import { useAuth } from "@/hooks/use-auth";
import { getProductSizes } from "@/lib/catalog/presentations";
import {
  areUnitsCompatible,
  calculateRecipeCost,
  getCompatibleRecipeUnits,
  normalizePresentationKey,
} from "@/lib/recipes/escandallo";
import type { Product } from "@/types/catalog";
import type {
  AddOnRecipeIngredient,
  ProductRecipe,
  RecipeIngredient,
  RecipeUnit,
} from "@/types/recipes";
import type { SupplyItem } from "@/types/supplies";

type IngredientFormRow = {
  key: string;
  supplyId: string;
  quantity: string;
  unit: RecipeUnit;
  bottleVolumeMl: string;
  addOnName?: string;
};

type RecipeModalState = {
  mode: "create" | "edit";
  recipeId?: string;
  productId: string;
  presentation: string;
  customPresentation: string;
  yieldUnits: string;
  notes: string;
  active: boolean;
  ingredients: IngredientFormRow[];
  addOnIngredients: IngredientFormRow[];
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

function formatCop(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

function makeRowKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveSalePriceCop(product: Product | undefined, presentation: string): number | undefined {
  if (!product) return undefined;
  const targetKey = normalizePresentationKey(presentation);
  const sizes = getProductSizes(product);
  const exactSize = sizes.find((size) => normalizePresentationKey(size.name) === targetKey);
  if (exactSize) return exactSize.price;
  if (targetKey === "*" && sizes.length > 0) return sizes[0]?.price;
  return product.price;
}

function createRowFromSupply(supply: SupplyItem, addOnName?: string): IngredientFormRow {
  const defaultUnit: RecipeUnit = supply.unit === "l" ? "ml" : supply.unit;
  return {
    key: makeRowKey(addOnName ? "addon" : "ing"),
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

function getMarginToneClass(marginPct: number): string {
  if (marginPct >= 55) return "text-emerald-300";
  if (marginPct >= 35) return "text-amber-300";
  return "text-rose-300";
}

export function RecipesManager() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalState, setModalState] = useState<RecipeModalState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const suppliesById = useMemo(
    () => new Map(supplies.map((supply) => [supply.id, supply])),
    [supplies]
  );

  const activeSupplies = supplies;

  async function loadData() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [recipesRes, productsRes, suppliesRes] = await Promise.all([
        fetch("/api/admin/recetas", { headers }),
        fetch("/api/admin/productos", { headers }),
        fetch("/api/admin/insumos", { headers }),
      ]);

      const [recipesBody, productsBody, suppliesBody] = await Promise.all([
        recipesRes.json().catch(() => ({})) as Promise<{ recipes?: ProductRecipe[]; error?: string }>,
        productsRes.json().catch(() => ({})) as Promise<{ products?: Product[]; error?: string }>,
        suppliesRes.json().catch(() => ({})) as Promise<{ supplies?: SupplyItem[]; error?: string }>,
      ]);

      if (!recipesRes.ok) {
        throw new Error(recipesBody.error ?? "No se pudieron cargar las recetas.");
      }

      setRecipes(Array.isArray(recipesBody.recipes) ? recipesBody.recipes : []);
      if (productsRes.ok && Array.isArray(productsBody.products)) {
        setProducts(productsBody.products);
      }
      if (suppliesRes.ok && Array.isArray(suppliesBody.supplies)) {
        setSupplies(suppliesBody.supplies);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error cargando escandallos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [user]);

  const recipePreviews = useMemo(() => {
    return recipes.map((recipe) => {
      const product = productsById.get(recipe.productId);
      const salePriceCop = resolveSalePriceCop(product, recipe.presentation);
      const preview = calculateRecipeCost({
        ingredients: recipe.ingredients,
        addOnIngredients: recipe.addOnIngredients,
        suppliesById,
        yieldUnits: recipe.yieldUnits,
        salePriceCop,
      });
      return { recipe, product, preview };
    });
  }, [recipes, productsById, suppliesById]);

  const filteredPreviews = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("es-CO");
    if (!query) return recipePreviews;
    return recipePreviews.filter(({ recipe }) => {
      const haystack = [
        recipe.productName,
        recipe.presentation,
        ...recipe.ingredients.map((i) => i.supplyName),
        ...recipe.addOnIngredients.map((a) => `${a.addOnName} ${a.supplyName}`),
      ]
        .join(" ")
        .toLocaleLowerCase("es-CO");
      return haystack.includes(query);
    });
  }, [recipePreviews, searchQuery]);

  const kpis = useMemo(() => {
    const activeEntries = recipePreviews.filter(({ recipe }) => recipe.active);
    const activeCount = activeEntries.length;
    const uniqueCoveredProducts = new Set(activeEntries.map(({ recipe }) => recipe.productId)).size;
    const avgCostCop =
      activeCount > 0
        ? Math.round(
            activeEntries.reduce((sum, entry) => sum + entry.preview.unitCostCop, 0) / activeCount
          )
        : 0;
    const withMargin = activeEntries.filter(
      (entry) => typeof entry.preview.grossMarginPct === "number"
    );
    const avgMarginPct =
      withMargin.length > 0
        ? Number(
            (
              withMargin.reduce((sum, entry) => sum + (entry.preview.grossMarginPct ?? 0), 0) /
              withMargin.length
            ).toFixed(1)
          )
        : 0;

    return {
      activeCount,
      uniqueCoveredProducts,
      totalActiveProducts: products.filter((p) => p.active).length,
      avgCostCop,
      avgMarginPct,
    };
  }, [recipePreviews, products]);

  function openCreateModal() {
    const firstProduct = products[0];
    const firstSizes = firstProduct ? getProductSizes(firstProduct) : [];
    const defaultPresentation = firstSizes[0]?.name ?? "16 oz";
    const defaultSupply = activeSupplies[0];

    setModalError(null);
    setModalState({
      mode: "create",
      productId: firstProduct?.id ?? "",
      presentation: defaultPresentation,
      customPresentation: "",
      yieldUnits: "1",
      notes: "",
      active: true,
      ingredients: defaultSupply ? [createRowFromSupply(defaultSupply)] : [],
      addOnIngredients: [],
    });
  }

  function openEditModal(recipe: ProductRecipe) {
    const product = productsById.get(recipe.productId);
    const knownSizes = product ? getProductSizes(product).map((s) => s.name) : [];
    const isStandardOption =
      recipe.presentation === "*" || knownSizes.includes(recipe.presentation);

    setModalError(null);
    setModalState({
      mode: "edit",
      recipeId: recipe.id,
      productId: recipe.productId,
      presentation: isStandardOption ? recipe.presentation : "__custom__",
      customPresentation: isStandardOption ? "" : recipe.presentation,
      yieldUnits: String(recipe.yieldUnits),
      notes: recipe.notes ?? "",
      active: recipe.active,
      ingredients: recipe.ingredients.map((ing) => ({
        key: makeRowKey("ing"),
        supplyId: ing.supplyId,
        quantity: String(ing.quantity),
        unit: ing.unit,
        bottleVolumeMl: String(ing.bottleVolumeMl ?? 750),
      })),
      addOnIngredients: recipe.addOnIngredients.map((addon) => ({
        key: makeRowKey("addon"),
        addOnName: addon.addOnName,
        supplyId: addon.supplyId,
        quantity: String(addon.quantity),
        unit: addon.unit,
        bottleVolumeMl: String(addon.bottleVolumeMl ?? 750),
      })),
    });
  }

  const modalSelectedProduct = modalState ? productsById.get(modalState.productId) : undefined;
  const modalEffectivePresentation = modalState
    ? modalState.presentation === "__custom__"
      ? modalState.customPresentation.trim()
      : modalState.presentation
    : "";

  const modalLivePreview = useMemo(() => {
    if (!modalState) return null;
    const ingList = rowsToRecipeIngredients(modalState.ingredients, suppliesById);
    const addOnList = rowsToAddOnIngredients(modalState.addOnIngredients, suppliesById);
    const yieldNum = Number(modalState.yieldUnits);
    const salePriceCop = resolveSalePriceCop(modalSelectedProduct, modalEffectivePresentation);
    return calculateRecipeCost({
      ingredients: ingList,
      addOnIngredients: addOnList,
      suppliesById,
      selectedAddOns: addOnList.map((a) => a.addOnName),
      yieldUnits: Number.isFinite(yieldNum) && yieldNum > 0 ? yieldNum : 1,
      salePriceCop,
    });
  }, [modalState, modalSelectedProduct, modalEffectivePresentation, suppliesById]);

  function updateModalProduct(productId: string) {
    const product = productsById.get(productId);
    const sizes = product ? getProductSizes(product) : [];
    setModalState((prev) =>
      prev
        ? {
            ...prev,
            productId,
            presentation: sizes[0]?.name ?? "*",
            customPresentation: "",
          }
        : null
    );
  }

  function updateIngredientRow(
    collection: "ingredients" | "addOnIngredients",
    rowKey: string,
    patch: Partial<IngredientFormRow>
  ) {
    setModalState((prev) => {
      if (!prev) return null;
      const nextRows = prev[collection].map((row) => {
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
      return { ...prev, [collection]: nextRows };
    });
  }

  function removeIngredientRow(collection: "ingredients" | "addOnIngredients", rowKey: string) {
    setModalState((prev) =>
      prev
        ? {
            ...prev,
            [collection]: prev[collection].filter((row) => row.key !== rowKey),
          }
        : null
    );
  }

  function addIngredientRow(collection: "ingredients" | "addOnIngredients", presetAddOn?: string) {
    const defaultSupply = activeSupplies[0] ?? supplies[0];
    if (!defaultSupply) return;
    setModalState((prev) =>
      prev
        ? {
            ...prev,
            [collection]: [
              ...prev[collection],
              createRowFromSupply(
                defaultSupply,
                collection === "addOnIngredients" ? presetAddOn ?? "" : undefined
              ),
            ],
          }
        : null
    );
  }

  async function handleSaveRecipe(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !modalState) return;
    setModalError(null);

    const presentation = modalEffectivePresentation;
    if (!modalState.productId || !presentation) {
      setModalError("Selecciona un producto y una presentación válida.");
      return;
    }

    const ingredients = rowsToRecipeIngredients(modalState.ingredients, suppliesById);
    if (ingredients.length === 0) {
      setModalError("Agrega al menos un insumo válido en la receta base.");
      return;
    }

    const addOnIngredients = rowsToAddOnIngredients(modalState.addOnIngredients, suppliesById);
    const yieldUnits = Number(modalState.yieldUnits);
    if (!Number.isFinite(yieldUnits) || yieldUnits <= 0) {
      setModalError("El rendimiento debe ser mayor a 0.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const product = productsById.get(modalState.productId);
      const url =
        modalState.mode === "create"
          ? "/api/admin/recetas"
          : `/api/admin/recetas/${encodeURIComponent(modalState.recipeId ?? "")}`;
      const method = modalState.mode === "create" ? "POST" : "PATCH";

      const payload =
        modalState.mode === "create"
          ? {
              productId: modalState.productId,
              productName: product?.name ?? modalState.productId,
              presentation,
              ingredients,
              addOnIngredients,
              yieldUnits,
              notes: modalState.notes.trim(),
              active: modalState.active,
            }
          : {
              productName: product?.name,
              presentation,
              ingredients,
              addOnIngredients,
              yieldUnits,
              notes: modalState.notes.trim(),
              active: modalState.active,
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

      setModalState(null);
      await loadData();
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : "Error al guardar la receta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRecipe(id: string) {
    if (!user) return;
    setDeletingId(id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/recetas/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "No se pudo eliminar la receta.");
      }
      setConfirmDeleteId(null);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Error eliminando receta.");
    } finally {
      setDeletingId(null);
    }
  }

  const modalSizeOptions = modalSelectedProduct ? getProductSizes(modalSelectedProduct) : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Recetas Activas
          </p>
          <p className="mt-1 text-2xl font-black text-cyan-300">{kpis.activeCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Cobertura Carta
          </p>
          <p className="mt-1 text-2xl font-black text-white">
            {kpis.uniqueCoveredProducts}{" "}
            <span className="text-sm font-semibold text-slate-400">
              / {kpis.totalActiveProducts} prod.
            </span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Costo Promedio
          </p>
          <p className="mt-1 text-2xl font-black text-amber-300">{formatCop(kpis.avgCostCop)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Margen Bruto Prom.
          </p>
          <p className={`mt-1 text-2xl font-black ${getMarginToneClass(kpis.avgMarginPct)}`}>
            {kpis.avgMarginPct}%
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por producto, presentación o insumo..."
            aria-label="Buscar recetas y escandallos"
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
          />
        </div>
        <PermissionGate permission="inventario.write">
          <button
            type="button"
            onClick={openCreateModal}
            disabled={products.length === 0 || activeSupplies.length === 0}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Nueva Receta
          </button>
        </PermissionGate>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/70 px-4 py-3 text-sm text-rose-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadData()}
            className="min-h-[44px] rounded-lg border border-rose-400/40 px-3 text-xs font-bold text-white hover:bg-rose-900"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && activeSupplies.length === 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/50 p-4 text-sm text-amber-200">
          Para crear recetas estándar necesitas tener al menos un insumo activo registrado en la pestaña
          <span className="font-bold text-white"> Insumos de Barra</span>.
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2].map((skeleton) => (
            <div
              key={skeleton}
              className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : filteredPreviews.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-white">
          <FlaskConical className="mx-auto h-8 w-8 text-cyan-400" />
          <p className="mt-3 text-base font-bold">No hay recetas configuradas</p>
          <p className="mt-1 text-sm text-slate-300">
            Vincula presentaciones de tus cócteles con insumos de barra para automatizar el descuento y el costo real.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredPreviews.map(({ recipe, preview }) => (
            <article
              key={recipe.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white shadow-sm"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-extrabold text-white">{recipe.productName}</h3>
                      <span className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-0.5 text-xs font-bold text-cyan-200">
                        {recipe.presentation === "*" ? "Todas (*)" : recipe.presentation}
                      </span>
                      {recipe.yieldUnits > 1 && (
                        <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">
                          Rinde {recipe.yieldUnits} u.
                        </span>
                      )}
                    </div>
                    {recipe.notes && <p className="mt-1 text-xs text-slate-300">{recipe.notes}</p>}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      recipe.active
                        ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-300 border border-slate-700"
                    }`}
                  >
                    {recipe.active ? "Activa" : "Inactiva"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-center">
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-400">Carta</p>
                    <p className="mt-0.5 text-sm font-bold text-white">
                      {typeof preview.salePriceCop === "number"
                        ? formatCop(preview.salePriceCop)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-400">Costo Real</p>
                    <p className="mt-0.5 text-sm font-bold text-amber-300">
                      {formatCop(preview.unitCostCop)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-400">Margen</p>
                    <p
                      className={`mt-0.5 text-sm font-extrabold ${
                        typeof preview.grossMarginPct === "number"
                          ? getMarginToneClass(preview.grossMarginPct)
                          : "text-slate-400"
                      }`}
                    >
                      {typeof preview.grossMarginPct === "number"
                        ? `${preview.grossMarginPct}%`
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Layers className="h-3.5 w-3.5 text-cyan-400" />
                    Insumos base ({recipe.ingredients.length})
                  </p>
                  <ul className="space-y-1.5 text-xs">
                    {preview.lines
                      .filter((line) => !line.addOnName)
                      .map((line, idx) => (
                        <li
                          key={`${line.supplyId}-${idx}`}
                          className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-1.5 text-slate-200"
                        >
                          <span>
                            <strong className="text-white">{line.supplyName}</strong>{" "}
                            <span className="text-slate-400">
                              ({line.recipeQuantity} {line.recipeUnit})
                            </span>
                          </span>
                          <span className="font-semibold text-cyan-200">
                            {formatCop(line.costCop)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>

                {recipe.addOnIngredients.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-pink-300">
                      <Sparkles className="h-3.5 w-3.5" />
                      Insumos por adición ({recipe.addOnIngredients.length})
                    </p>
                    <ul className="space-y-1 text-xs">
                      {recipe.addOnIngredients.map((addon, idx) => (
                        <li
                          key={`${addon.addOnName}-${addon.supplyId}-${idx}`}
                          className="flex items-center justify-between rounded-lg border border-pink-500/20 bg-pink-950/20 px-3 py-1.5 text-pink-100"
                        >
                          <span>
                            +{addon.addOnName}: <strong>{addon.supplyName}</strong>
                          </span>
                          <span>
                            {addon.quantity} {addon.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <PermissionGate permission="inventario.write">
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
                  <button
                    type="button"
                    onClick={() => openEditModal(recipe)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-white transition hover:border-cyan-400 hover:text-cyan-300"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                  {confirmDeleteId === recipe.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDeleteRecipe(recipe.id)}
                        disabled={deletingId === recipe.id}
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(recipe.id)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3.5 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-900/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  )}
                </div>
              </PermissionGate>
            </article>
          ))}
        </div>
      )}

      {modalState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipe-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Calculator className="h-5 w-5 text-cyan-400" />
                <h2 id="recipe-modal-title" className="text-lg font-extrabold text-white">
                  {modalState.mode === "create"
                    ? "Nueva Receta y Escandallo"
                    : `Editar Receta — ${modalSelectedProduct?.name ?? ""}`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Cerrar formulario de receta"
                onClick={() => setModalState(null)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveRecipe(e)} className="mt-5 space-y-5">
              {modalError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/70 px-4 py-3 text-sm text-rose-200">
                  {modalError}
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
                    value={modalState.productId}
                    disabled={modalState.mode === "edit"}
                    onChange={(e) => updateModalProduct(e.target.value)}
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
                    value={modalState.presentation}
                    onChange={(e) =>
                      setModalState((prev) =>
                        prev ? { ...prev, presentation: e.target.value } : null
                      )
                    }
                    className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  >
                    {modalSizeOptions.map((size) => (
                      <option key={size.name} value={size.name}>
                        {size.name} ({formatCop(size.price)})
                      </option>
                    ))}
                    <option value="*">Todas las presentaciones (*)</option>
                    <option value="__custom__">Otra presentación...</option>
                  </select>
                </div>

                {modalState.presentation === "__custom__" && (
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
                      value={modalState.customPresentation}
                      onChange={(e) =>
                        setModalState((prev) =>
                          prev ? { ...prev, customPresentation: e.target.value } : null
                        )
                      }
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
                    value={modalState.yieldUnits}
                    onChange={(e) =>
                      setModalState((prev) =>
                        prev ? { ...prev, yieldUnits: e.target.value } : null
                      )
                    }
                    className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={modalState.active}
                      onChange={(e) =>
                        setModalState((prev) =>
                          prev ? { ...prev, active: e.target.checked } : null
                        )
                      }
                      className="h-4 w-4 accent-cyan-400"
                    />
                    <span className="font-semibold">Receta activa para descuento automático</span>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold text-cyan-300">
                    Ingredientes base por preparación
                  </h3>
                  <button
                    type="button"
                    onClick={() => addIngredientRow("ingredients")}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar insumo base
                  </button>
                </div>

                {modalState.ingredients.map((row, index) => {
                  const supply = suppliesById.get(row.supplyId);
                  const compatibleUnits = supply
                    ? getCompatibleRecipeUnits(supply.unit)
                    : (["ml", "oz", "l", "botella", "g", "kg", "unidad"] as const);
                  return (
                    <div
                      key={row.key}
                      className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:grid-cols-12 sm:items-end"
                    >
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
                          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white"
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
                          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white"
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
                          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white"
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
                            className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white"
                          />
                        </div>
                      )}

                      <div className="flex justify-end sm:col-span-1">
                        <button
                          type="button"
                          aria-label={`Quitar ingrediente ${index + 1}`}
                          onClick={() => removeIngredientRow("ingredients", row.key)}
                          disabled={modalState.ingredients.length <= 1}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-950/50 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 border-t border-slate-800 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-pink-300">
                      Insumos opcionales por adición
                    </h3>
                    <p className="text-xs text-slate-400">
                      Solo se descuentan si el cliente elige esa adición en la comanda.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(modalSelectedProduct?.availableAddOns ?? []).map((addon) => (
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

                {modalState.addOnIngredients.map((row, index) => {
                  const supply = suppliesById.get(row.supplyId);
                  const compatibleUnits = supply
                    ? getCompatibleRecipeUnits(supply.unit)
                    : (["ml", "oz", "l", "botella", "g", "kg", "unidad"] as const);
                  return (
                    <div
                      key={row.key}
                      className="grid gap-2 rounded-xl border border-pink-500/30 bg-slate-950/70 p-3 sm:grid-cols-12 sm:items-end"
                    >
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
                          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white"
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
                          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white"
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
                          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white"
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
                          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-sm text-white"
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
                  );
                })}
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
                  value={modalState.notes}
                  onChange={(e) =>
                    setModalState((prev) => (prev ? { ...prev, notes: e.target.value } : null))
                  }
                  placeholder="Ej: Servir con hielo frappé y pitillo biodegradable"
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {modalLivePreview && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Vista previa escandallo por unidad
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-slate-400">Costo estimado</span>
                      <p className="font-extrabold text-amber-300">
                        {formatCop(modalLivePreview.unitCostCop)}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Precio venta</span>
                      <p className="font-bold text-white">
                        {typeof modalLivePreview.salePriceCop === "number"
                          ? formatCop(modalLivePreview.salePriceCop)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Margen estimado</span>
                      <p
                        className={`font-extrabold ${
                          typeof modalLivePreview.grossMarginPct === "number"
                            ? getMarginToneClass(modalLivePreview.grossMarginPct)
                            : "text-slate-300"
                        }`}
                      >
                        {typeof modalLivePreview.grossMarginPct === "number"
                          ? `${modalLivePreview.grossMarginPct}%`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setModalState(null)}
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
                    : modalState.mode === "create"
                      ? "Guardar Receta"
                      : "Actualizar Receta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
