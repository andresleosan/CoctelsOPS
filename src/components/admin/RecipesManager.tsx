"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  FlaskConical,
  Layers,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import { PermissionGate } from "@/components/admin/PermissionGate";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { useAuth } from "@/hooks/use-auth";
import { calculateRecipeCost } from "@/lib/recipes/escandallo";
import {
  buildCatalogProfitabilityReport,
  type RecipeCatalogProduct,
} from "@/lib/recipes/profitability";
import {
  LOW_MARGIN_WARNING_PCT,
  TARGET_MARGIN_DEFAULT_PCT,
  type CocktailProfitabilityItem,
  type ProductRecipe,
} from "@/types/recipes";
import type { SupplyItem } from "@/types/supplies";

export type RecipesManagerProps = {
  initialProductId?: string;
  initialPresentation?: string;
  initialRecipeId?: string;
};

type EditorState =
  | {
      mode: "create";
      productId?: string;
      presentation?: string;
    }
  | {
      mode: "edit";
      recipe: ProductRecipe;
    };

type RecipeFilterMode = "all" | "low_margin" | "active" | "inactive";

function formatCop(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

function getMarginToneClass(marginPct: number): string {
  if (marginPct >= LOW_MARGIN_WARNING_PCT) return "text-emerald-300";
  if (marginPct >= 35) return "text-amber-300";
  return "text-rose-300";
}

function getHealthBadge(item: CocktailProfitabilityItem | undefined): {
  label: string;
  className: string;
} | null {
  if (!item || item.grossMarginPct === null) return null;
  if (item.health === "critico") {
    return {
      label: "Crítico (<35%)",
      className: "border-rose-500/40 bg-rose-500/20 text-rose-200",
    };
  }
  if (item.health === "bajo") {
    return {
      label: "Margen bajo (<50%)",
      className: "border-amber-500/40 bg-amber-500/20 text-amber-200",
    };
  }
  return {
    label: "Saludable",
    className: "border-emerald-500/40 bg-emerald-500/20 text-emerald-200",
  };
}

export function RecipesManager({
  initialProductId,
  initialPresentation,
  initialRecipeId,
}: RecipesManagerProps = {}) {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [products, setProducts] = useState<RecipeCatalogProduct[]>([]);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<RecipeFilterMode>("all");
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deepLinkAppliedRef = useRef(false);

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
        productsRes.json().catch(() => ({})) as Promise<{
          products?: RecipeCatalogProduct[];
          error?: string;
        }>,
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

  const authKey = user?.uid ?? (user ? "authenticated" : null);

  useEffect(() => {
    if (authKey) {
      void loadData();
    }
  }, [authKey]);

  useEffect(() => {
    if (loading || deepLinkAppliedRef.current) return;
    if (!initialRecipeId && !initialProductId) return;

    if (initialRecipeId) {
      const targetRecipe = recipes.find((r) => r.id === initialRecipeId);
      if (targetRecipe) {
        deepLinkAppliedRef.current = true;
        setEditorState({ mode: "edit", recipe: targetRecipe });
        return;
      }
    }

    if (initialProductId && products.length > 0 && supplies.length > 0) {
      deepLinkAppliedRef.current = true;
      setEditorState({
        mode: "create",
        productId: initialProductId,
        presentation: initialPresentation,
      });
    }
  }, [loading, recipes, products, supplies, initialRecipeId, initialProductId, initialPresentation]);

  const profitabilityReport = useMemo(
    () =>
      buildCatalogProfitabilityReport({
        recipes,
        products,
        supplies,
      }),
    [recipes, products, supplies]
  );

  const profitabilityByRecipeId = useMemo(
    () => new Map(profitabilityReport.items.map((item) => [item.recipeId, item])),
    [profitabilityReport.items]
  );

  const recipeEntries = useMemo(() => {
    return recipes.map((recipe) => {
      const profitability = profitabilityByRecipeId.get(recipe.id);
      const preview = calculateRecipeCost({
        ingredients: recipe.ingredients,
        addOnIngredients: recipe.addOnIngredients,
        suppliesById,
        yieldUnits: recipe.yieldUnits,
        salePriceCop:
          typeof profitability?.salePriceCop === "number" ? profitability.salePriceCop : undefined,
      });
      return { recipe, profitability, preview };
    });
  }, [recipes, profitabilityByRecipeId, suppliesById]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("es-CO");
    return recipeEntries.filter(({ recipe, profitability }) => {
      if (filterMode === "low_margin") {
        const isLow =
          recipe.active &&
          profitability?.grossMarginPct !== null &&
          profitability?.grossMarginPct !== undefined &&
          profitability.grossMarginPct < LOW_MARGIN_WARNING_PCT;
        if (!isLow) return false;
      } else if (filterMode === "active" && !recipe.active) {
        return false;
      } else if (filterMode === "inactive" && recipe.active) {
        return false;
      }

      if (!query) return true;
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
  }, [recipeEntries, searchQuery, filterMode]);

  function openCreateModal(productId?: string, presentation?: string) {
    setEditorState({
      mode: "create",
      productId,
      presentation,
    });
  }

  function openEditModal(recipe: ProductRecipe) {
    setEditorState({
      mode: "edit",
      recipe,
    });
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

  const { summary, lowMarginAlerts, uncoveredPresentations } = profitabilityReport;

  return (
    <div className="space-y-6">
      {/* KPIs de Escandallo y Rentabilidad */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Recetas Activas
          </p>
          <p className="mt-1 text-2xl font-black text-cyan-300">{summary.activeRecipeCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Cobertura Carta
          </p>
          <p className="mt-1 text-2xl font-black text-white">
            {summary.coveredProductCount}{" "}
            <span className="text-sm font-semibold text-slate-400">
              / {summary.totalActiveProducts} prod.
            </span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Costo Promedio
          </p>
          <p className="mt-1 text-2xl font-black text-amber-300">
            {formatCop(summary.averageCostCop)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Margen Bruto Prom.
          </p>
          <p className={`mt-1 text-2xl font-black ${getMarginToneClass(summary.averageMarginPct)}`}>
            {summary.averageMarginPct}%
          </p>
        </div>
        <div className="col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Alertas Margen &lt;50%
          </p>
          <p
            className={`mt-1 text-2xl font-black ${
              summary.lowMarginCount > 0 ? "text-rose-300" : "text-emerald-300"
            }`}
          >
            {summary.lowMarginCount}
          </p>
        </div>
      </div>

      {/* Alerta rápida de baja rentabilidad */}
      {!loading && lowMarginAlerts.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4 text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="font-bold text-white">
                {lowMarginAlerts.length}{" "}
                {lowMarginAlerts.length === 1
                  ? "receta tiene baja rentabilidad (<50%)"
                  : "recetas tienen baja rentabilidad (<50%)"}
              </p>
              <p className="text-xs text-amber-200">
                Peor margen actual:{" "}
                <strong>
                  {lowMarginAlerts[0]?.productName} ({lowMarginAlerts[0]?.presentation})
                </strong>{" "}
                con {lowMarginAlerts[0]?.grossMarginPct}% de margen bruto.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterMode("low_margin")}
              className="min-h-[44px] rounded-xl border border-amber-400/50 bg-amber-500/20 px-3.5 text-xs font-bold text-amber-100 hover:bg-amber-500/30"
            >
              Filtrar alertas
            </button>
            <Link
              href="/admin/reportes#rentabilidad"
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-slate-900 px-3.5 text-xs font-bold text-cyan-300 hover:bg-slate-800"
            >
              Ver Dashboard de Rentabilidad
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Presentaciones sin receta */}
      {!loading && uncoveredPresentations.length > 0 && activeSupplies.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-cyan-300">
                Presentaciones sin receta ({uncoveredPresentations.length})
              </h3>
              <p className="text-xs text-slate-400">
                Crea el escandallo en 1 toque para activar descuento automático de barra y costo real.
              </p>
            </div>
            <Link
              href="/admin/reportes#rentabilidad"
              className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
            >
              Ver Dashboard de Rentabilidad
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {uncoveredPresentations.slice(0, 8).map((item) => (
              <PermissionGate key={`${item.productId}-${item.presentation}`} permission="inventario.write">
                <button
                  type="button"
                  onClick={() => openCreateModal(item.productId, item.presentation)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Crear {item.productName} ({item.presentation})
                </button>
              </PermissionGate>
            ))}
          </div>
        </div>
      )}

      {/* Buscador, filtros y CTA Nueva Receta */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              onClick={() => openCreateModal()}
              disabled={products.length === 0 || activeSupplies.length === 0}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Nueva Receta
            </button>
          </PermissionGate>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros de recetas">
          {(
            [
              { id: "all", label: `Todas (${recipes.length})` },
              { id: "low_margin", label: `Baja rentabilidad (${lowMarginAlerts.length})` },
              {
                id: "active",
                label: `Activas (${recipes.filter((r) => r.active).length})`,
              },
              {
                id: "inactive",
                label: `Inactivas (${recipes.filter((r) => !r.active).length})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`min-h-[44px] rounded-xl border px-3.5 text-xs font-bold transition ${
                filterMode === tab.id
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                  : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/70 px-4 py-3 text-sm text-rose-200"
        >
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
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-white">
          <FlaskConical className="mx-auto h-8 w-8 text-cyan-400" />
          <p className="mt-3 text-base font-bold">
            {recipes.length === 0
              ? "No hay recetas configuradas"
              : "Ninguna receta coincide con el filtro actual"}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Vincula presentaciones de tus cócteles con insumos de barra para automatizar el descuento y el costo real.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredEntries.map(({ recipe, profitability, preview }) => {
            const healthBadge = getHealthBadge(profitability);
            const showLowSuggestion =
              profitability &&
              profitability.grossMarginPct !== null &&
              profitability.grossMarginPct < LOW_MARGIN_WARNING_PCT &&
              profitability.suggestedPriceCop !== null &&
              profitability.suggestedPriceCop > 0;

            return (
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      {healthBadge && (
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${healthBadge.className}`}
                        >
                          {healthBadge.label}
                        </span>
                      )}
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                          recipe.active
                            ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-200"
                            : "border-slate-700 bg-slate-800 text-slate-300"
                        }`}
                      >
                        {recipe.active ? "Activa" : "Inactiva"}
                      </span>
                    </div>
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

                  {profitability?.topCostSupplyName && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                      <span>
                        Insumo principal:{" "}
                        <strong className="text-white">{profitability.topCostSupplyName}</strong>{" "}
                        {typeof profitability.topCostSharePct === "number" && (
                          <span className="text-cyan-300">({profitability.topCostSharePct}%)</span>
                        )}
                      </span>
                      {showLowSuggestion && profitability.suggestedPriceCop && (
                        <span className="font-semibold text-amber-200">
                          Sugerido ({TARGET_MARGIN_DEFAULT_PCT}%):{" "}
                          <strong>{formatCop(profitability.suggestedPriceCop)}</strong>
                        </span>
                      )}
                    </div>
                  )}

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
            );
          })}
        </div>
      )}

      {editorState && (
        <RecipeEditor
          mode={editorState.mode}
          initialRecipe={editorState.mode === "edit" ? editorState.recipe : null}
          initialProductId={editorState.mode === "create" ? editorState.productId : undefined}
          initialPresentation={
            editorState.mode === "create" ? editorState.presentation : undefined
          }
          products={products}
          supplies={supplies}
          existingRecipes={recipes}
          onClose={() => setEditorState(null)}
          onSaved={async () => {
            setEditorState(null);
            await loadData();
          }}
        />
      )}
    </div>
  );
}
