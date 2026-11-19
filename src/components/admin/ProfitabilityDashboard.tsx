"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  FlaskConical,
  Plus,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/reports/export-report";
import {
  LOW_MARGIN_CRITICAL_PCT,
  LOW_MARGIN_WARNING_PCT,
  TARGET_MARGIN_DEFAULT_PCT,
  type CatalogProfitabilityReport,
  type MarginHealthStatus,
  type OrderProfitabilitySummary,
} from "@/types/recipes";

export type ProfitabilityDashboardProps = {
  orderProfitability?: OrderProfitabilitySummary;
  catalogProfitability?: CatalogProfitabilityReport | null;
};

type HealthFilter = "all" | "alerts" | "critico" | "saludable";

function getHealthBadgeMeta(health: MarginHealthStatus): {
  label: string;
  badgeClass: string;
  barClass: string;
  textClass: string;
} {
  if (health === "critico") {
    return {
      label: `Crítico (<${LOW_MARGIN_CRITICAL_PCT}%)`,
      badgeClass: "border-rose-300 bg-rose-100 text-rose-900",
      barClass: "bg-rose-500",
      textClass: "text-rose-700",
    };
  }
  if (health === "bajo") {
    return {
      label: `Margen bajo (<${LOW_MARGIN_WARNING_PCT}%)`,
      badgeClass: "border-amber-300 bg-amber-100 text-amber-900",
      barClass: "bg-amber-500",
      textClass: "text-amber-800",
    };
  }
  return {
    label: "Saludable",
    badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-900",
    barClass: "bg-emerald-500",
    textClass: "text-emerald-700",
  };
}

function matchesHealthFilter(health: MarginHealthStatus, filter: HealthFilter): boolean {
  if (filter === "all") return true;
  if (filter === "alerts") return health !== "saludable";
  return health === filter;
}

export function ProfitabilityDashboard({
  orderProfitability,
  catalogProfitability,
}: ProfitabilityDashboardProps) {
  const hasOrderData = Boolean(orderProfitability && orderProfitability.cocktails.length > 0);
  const hasCatalogData = Boolean(
    catalogProfitability &&
      (catalogProfitability.items.length > 0 ||
        catalogProfitability.uncoveredPresentations.length > 0)
  );

  const [selectedView, setSelectedView] = useState<"catalog" | "period">(
    hasCatalogData ? "catalog" : "period"
  );
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");

  const activeView: "catalog" | "period" =
    selectedView === "period" && hasOrderData
      ? "period"
      : hasCatalogData
        ? "catalog"
        : "period";

  const filteredCatalogItems = useMemo(() => {
    if (!catalogProfitability) return [];
    return catalogProfitability.items.filter(
      (item) => item.active && matchesHealthFilter(item.health, healthFilter)
    );
  }, [catalogProfitability, healthFilter]);

  const filteredPeriodItems = useMemo(() => {
    if (!orderProfitability) return [];
    return orderProfitability.cocktails.filter((item) =>
      matchesHealthFilter(item.health, healthFilter)
    );
  }, [orderProfitability, healthFilter]);

  if (!hasOrderData && !hasCatalogData) {
    return (
      <section id="rentabilidad" aria-label="Dashboard de Rentabilidad por Cóctel">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                <FlaskConical className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">
                  Rentabilidad por Cóctel y Escandallo
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Configura las recetas de tus cócteles para visualizar margen bruto, costo real por
                  vaso y alertas de baja rentabilidad.
                </p>
              </div>
            </div>
            <Link
              href="/admin/inventario?tab=escandallo"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Configurar Recetas
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  const catalogAlerts = catalogProfitability?.lowMarginAlerts ?? [];
  const periodAlerts = orderProfitability?.lowMarginAlerts ?? [];
  const showCatalogAlerts = activeView === "catalog" || (catalogAlerts.length > 0 && periodAlerts.length === 0);
  const activeAlertsCount = showCatalogAlerts ? catalogAlerts.length : periodAlerts.length;
  const hasCriticalAlert = showCatalogAlerts
    ? catalogAlerts.some((a) => a.health === "critico")
    : periodAlerts.some((a) => a.health === "critico");

  return (
    <section
      id="rentabilidad"
      aria-label="Dashboard de Rentabilidad por Cóctel"
      className="space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-pink-800">
              <TrendingUp className="h-3.5 w-3.5" />
              Escandallo &amp; Rentabilidad
            </span>
          </div>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">
            Rentabilidad por Cóctel
          </h2>
          <p className="text-sm text-slate-600">
            Control de márgenes reales por presentación, detección de cócteles poco rentables y
            cobertura de carta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasCatalogData && hasOrderData && (
            <div
              role="group"
              aria-label="Modo de análisis de rentabilidad"
              className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
            >
              <button
                type="button"
                onClick={() => setSelectedView("catalog")}
                className={`min-h-[40px] rounded-lg px-3 text-xs font-bold transition ${
                  activeView === "catalog"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                Rentabilidad de Carta
              </button>
              <button
                type="button"
                onClick={() => setSelectedView("period")}
                className={`min-h-[40px] rounded-lg px-3 text-xs font-bold transition ${
                  activeView === "period"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                Ventas del Período
              </button>
            </div>
          )}

          <Link
            href="/admin/inventario?tab=escandallo"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
          >
            <FlaskConical className="h-4 w-4 text-cyan-700" />
            Gestionar Recetas
          </Link>
        </div>
      </div>

      {/* Banner de Alertas de Baja Rentabilidad */}
      {activeAlertsCount > 0 && (
        <div
          role="region"
          aria-label="Alertas de baja rentabilidad"
          className={`rounded-2xl border p-4 shadow-sm ${
            hasCriticalAlert
              ? "border-rose-300 bg-rose-50 text-rose-950"
              : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className={`mt-0.5 h-5 w-5 shrink-0 ${
                hasCriticalAlert ? "text-rose-700" : "text-amber-700"
              }`}
            />
            <div className="flex-1 space-y-2.5">
              <div>
                <h3 className="text-sm font-extrabold">
                  Alertas de Baja Rentabilidad ({activeAlertsCount} por debajo del{" "}
                  {LOW_MARGIN_WARNING_PCT}%)
                </h3>
                <p className="text-xs opacity-90">
                  Ajusta dosificación o actualiza precio en carta para proteger tu margen bruto.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {showCatalogAlerts
                  ? catalogAlerts.map((alert) => {
                      const meta = getHealthBadgeMeta(alert.health);
                      return (
                        <div
                          key={alert.recipeId}
                          className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-slate-950">
                                {alert.productName}{" "}
                                <span className="text-xs font-semibold text-cyan-800">
                                  ({alert.presentation})
                                </span>
                              </p>
                              <p className="mt-0.5 text-xs text-slate-600">
                                Costo: <strong>{formatCurrency(alert.unitCostCop)}</strong>
                                {alert.salePriceCop !== null && (
                                  <> · Carta: {formatCurrency(alert.salePriceCop)}</>
                                )}
                              </p>
                              {alert.topCostSupplyName && (
                                <p className="mt-0.5 text-xs text-slate-600">
                                  Insumo clave: <strong>{alert.topCostSupplyName}</strong>
                                </p>
                              )}
                              {alert.suggestedPriceCop !== null && alert.suggestedPriceCop > 0 && (
                                <p className="mt-0.5 text-xs font-semibold text-cyan-800">
                                  Sugerido ({TARGET_MARGIN_DEFAULT_PCT}%):{" "}
                                  {formatCurrency(alert.suggestedPriceCop)}
                                </p>
                              )}
                            </div>
                            <Badge className={`shrink-0 border ${meta.badgeClass}`}>
                              {alert.grossMarginPct}%
                            </Badge>
                          </div>

                          <Link
                            href={`/admin/inventario?tab=escandallo&recipeId=${encodeURIComponent(
                              alert.recipeId
                            )}`}
                            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800"
                          >
                            Ajustar receta
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      );
                    })
                  : periodAlerts.map((alert) => {
                      const meta = getHealthBadgeMeta(alert.health);
                      const editHref = alert.recipeId
                        ? `/admin/inventario?tab=escandallo&recipeId=${encodeURIComponent(alert.recipeId)}`
                        : `/admin/inventario?tab=escandallo&productId=${encodeURIComponent(alert.productId)}`;
                      return (
                        <div
                          key={`${alert.productId}-${alert.presentation}`}
                          className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-slate-950">
                                {alert.productName}{" "}
                                <span className="text-xs font-semibold text-cyan-800">
                                  ({alert.presentation})
                                </span>
                              </p>
                              <p className="mt-0.5 text-xs text-slate-600">
                                {alert.unitsSold} und · Costo:{" "}
                                <strong>{formatCurrency(alert.totalCostCop)}</strong> · Ventas:{" "}
                                {formatCurrency(alert.revenueCop)}
                              </p>
                            </div>
                            <Badge className={`shrink-0 border ${meta.badgeClass}`}>
                              {alert.grossMarginPct}%
                            </Badge>
                          </div>
                          <Link
                            href={editHref}
                            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800"
                          >
                            Ajustar receta
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      );
                    })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4 KPIs de Rentabilidad */}
      {activeView === "period" && orderProfitability ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Margen Bruto Real
              </p>
              <p className="mt-1.5 text-2xl font-black text-slate-950">
                {orderProfitability.grossMarginPct}%
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {orderProfitability.coveredOrderCount} de{" "}
                {orderProfitability.totalEligibleOrderCount} pedidos con escandallo
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Costo Real Insumos
              </p>
              <p className="mt-1.5 text-2xl font-black text-amber-700">
                {formatCurrency(orderProfitability.totalCostCop)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Sobre ventas de {formatCurrency(orderProfitability.revenueCop)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Utilidad Bruta
              </p>
              <p className="mt-1.5 text-2xl font-black text-emerald-700">
                {formatCurrency(orderProfitability.grossProfitCop)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">Después de costo de insumos</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Alertas Rentabilidad
              </p>
              <p
                className={`mt-1.5 text-2xl font-black ${
                  orderProfitability.lowMarginAlerts.length > 0
                    ? "text-rose-700"
                    : "text-emerald-700"
                }`}
              >
                {orderProfitability.lowMarginAlerts.length}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Cócteles vendidos con margen &lt;{LOW_MARGIN_WARNING_PCT}%
              </p>
            </CardContent>
          </Card>
        </div>
      ) : catalogProfitability ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Margen Bruto Promedio
              </p>
              <p className="mt-1.5 text-2xl font-black text-slate-950">
                {catalogProfitability.summary.averageMarginPct}%
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Objetivo sugerido: {catalogProfitability.summary.targetMarginPct}%
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Costo Promedio Carta
              </p>
              <p className="mt-1.5 text-2xl font-black text-amber-700">
                {formatCurrency(catalogProfitability.summary.averageCostCop)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {catalogProfitability.summary.activeRecipeCount} recetas activas
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Cobertura de Carta
              </p>
              <p className="mt-1.5 text-2xl font-black text-cyan-800">
                {catalogProfitability.summary.coveragePct}%
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {catalogProfitability.summary.coveredProductCount} de{" "}
                {catalogProfitability.summary.totalActiveProducts} productos
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Alertas (&lt;{LOW_MARGIN_WARNING_PCT}%)
              </p>
              <p
                className={`mt-1.5 text-2xl font-black ${
                  catalogProfitability.summary.lowMarginCount > 0
                    ? "text-rose-700"
                    : "text-emerald-700"
                }`}
              >
                {catalogProfitability.summary.lowMarginCount}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {catalogProfitability.summary.criticalMarginCount} en nivel crítico (&lt;
                {LOW_MARGIN_CRITICAL_PCT}%)
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Tabla / Tarjetas de Rentabilidad por Cóctel */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-950">
                {activeView === "catalog"
                  ? "Desglose de Rentabilidad en Carta"
                  : "Rentabilidad Real de Ventas del Período"}
              </CardTitle>
              <CardDescription className="text-xs text-slate-600">
                Ordenado de menor a mayor margen para priorizar ajustes de costos o precios.
              </CardDescription>
            </div>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Filtrar cócteles por margen"
            >
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "alerts", label: "Alertas <50%" },
                  { id: "critico", label: "Críticos <35%" },
                  { id: "saludable", label: "Saludables ≥50%" },
                ] as const
              ).map((filterOption) => (
                <button
                  key={filterOption.id}
                  type="button"
                  onClick={() => setHealthFilter(filterOption.id)}
                  className={`min-h-[44px] rounded-lg border px-3 text-xs font-semibold transition ${
                    healthFilter === filterOption.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {filterOption.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeView === "catalog" ? (
            filteredCatalogItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-600">
                No hay recetas en este filtro de rentabilidad.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredCatalogItems.map((item) => {
                  const meta = getHealthBadgeMeta(item.health);
                  const marginVal = item.grossMarginPct ?? 0;
                  const barWidth = Math.min(100, Math.max(0, Math.round(marginVal)));
                  return (
                    <div
                      key={item.recipeId}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-950">{item.productName}</h3>
                          <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-900">
                            {item.presentation === "*" ? "Todas (*)" : item.presentation}
                          </Badge>
                          {item.grossMarginPct !== null && (
                            <Badge className={`border ${meta.badgeClass}`}>{meta.label}</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                          <span>
                            Carta:{" "}
                            <strong className="text-slate-950">
                              {item.salePriceCop !== null ? formatCurrency(item.salePriceCop) : "—"}
                            </strong>
                          </span>
                          <span>
                            Costo:{" "}
                            <strong className="text-amber-800">
                              {formatCurrency(item.unitCostCop)}
                            </strong>
                          </span>
                          <span>
                            Utilidad:{" "}
                            <strong className="text-emerald-800">
                              {item.grossProfitCop !== null
                                ? formatCurrency(item.grossProfitCop)
                                : "—"}
                            </strong>
                          </span>
                          {item.topCostSupplyName && (
                            <span>
                              Insumo clave: <strong>{item.topCostSupplyName}</strong>
                            </span>
                          )}
                          {item.health !== "saludable" &&
                            item.suggestedPriceCop !== null &&
                            item.suggestedPriceCop > 0 && (
                              <span className="font-semibold text-cyan-800">
                                Sugerido ({TARGET_MARGIN_DEFAULT_PCT}%):{" "}
                                {formatCurrency(item.suggestedPriceCop)}
                              </span>
                            )}
                        </div>

                        {item.grossMarginPct !== null && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${meta.barClass}`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <span className={`w-14 text-right font-mono text-xs font-extrabold ${meta.textClass}`}>
                              {item.grossMarginPct}%
                            </span>
                          </div>
                        )}
                      </div>

                      <Link
                        href={`/admin/inventario?tab=escandallo&recipeId=${encodeURIComponent(
                          item.recipeId
                        )}`}
                        className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
                      >
                        Editar
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredPeriodItems.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-600">
              No hay cócteles vendidos con escandallo en este filtro.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredPeriodItems.map((item) => {
                const meta = getHealthBadgeMeta(item.health);
                const barWidth = Math.min(100, Math.max(0, Math.round(item.grossMarginPct)));
                const editHref = item.recipeId
                  ? `/admin/inventario?tab=escandallo&recipeId=${encodeURIComponent(item.recipeId)}`
                  : `/admin/inventario?tab=escandallo&productId=${encodeURIComponent(item.productId)}`;

                return (
                  <div
                    key={`${item.productId}-${item.presentation}`}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-950">{item.productName}</h3>
                        <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-900">
                          {item.presentation}
                        </Badge>
                        <span className="text-xs font-semibold text-slate-600">
                          {item.unitsSold} und
                        </span>
                        <Badge className={`border ${meta.badgeClass}`}>{meta.label}</Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                        <span>
                          Ventas: <strong className="text-slate-950">{formatCurrency(item.revenueCop)}</strong>
                        </span>
                        <span>
                          Costo: <strong className="text-amber-800">{formatCurrency(item.totalCostCop)}</strong>
                        </span>
                        <span>
                          Utilidad:{" "}
                          <strong className="text-emerald-800">
                            {formatCurrency(item.grossProfitCop)}
                          </strong>
                        </span>
                        <span>
                          Costo unit.: <strong>{formatCurrency(item.unitCostCop)}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-0.5">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${meta.barClass}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className={`w-14 text-right font-mono text-xs font-extrabold ${meta.textClass}`}>
                          {item.grossMarginPct}%
                        </span>
                      </div>
                    </div>

                    <Link
                      href={editHref}
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
                    >
                      Editar
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brechas de Cobertura */}
      {catalogProfitability && catalogProfitability.uncoveredPresentations.length > 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-950">
              Presentaciones activas sin escandallo ({catalogProfitability.uncoveredPresentations.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-600">
              Asigna su receta para descontar stock automáticamente y conocer su rentabilidad real.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {catalogProfitability.uncoveredPresentations.slice(0, 12).map((item) => (
              <Link
                key={`${item.productId}-${item.presentation}`}
                href={`/admin/inventario?tab=escandallo&productId=${encodeURIComponent(
                  item.productId
                )}&presentation=${encodeURIComponent(item.presentation)}`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan-300 bg-cyan-50 px-3 text-xs font-bold text-cyan-950 transition hover:bg-cyan-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear receta: {item.productName} ({item.presentation})
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : catalogProfitability && catalogProfitability.summary.activeRecipeCount > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
          Toda la carta activa tiene cobertura de escandallo configurada.
        </div>
      ) : null}
    </section>
  );
}
