"use client";

import {
  BarChart3,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  MessageCircle,
  Receipt,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  buildShiftClosingWhatsAppMessage,
  buildShiftClosingWhatsAppUrl,
  calculateAverageTicket,
  downloadCsv,
  formatCurrency,
  generateOrderReportCsv,
  getPresetDateRange,
  type PresetRange,
} from "@/lib/reports/export-report";
import type { OrderReport } from "@/types/operations";

export default function ReportsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(() => getPresetDateRange("today").from);
  const [to, setTo] = useState(() => getPresetDateRange("today").to);
  const [activePreset, setActivePreset] = useState<PresetRange | "custom">("today");
  const [report, setReport] = useState<OrderReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    async (fromDate: string = from, toDate: string = to) => {
      if (!user) return;
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (fromDate) params.set("from", `${fromDate}T00:00:00.000Z`);
        if (toDate) params.set("to", `${toDate}T23:59:59.999Z`);

        const token = await user.getIdToken();
        const response = await fetch(`/api/admin/reports/orders?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const body = (await response.json()) as { report?: OrderReport; error?: string };
        if (!response.ok) throw new Error(body.error || "Error al cargar reporte.");
        setReport(body.report ?? null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo generar el reporte.");
      } finally {
        setLoading(false);
      }
    },
    [user, from, to]
  );

  // Load on mount when user is authenticated
  useEffect(() => {
    if (user) {
      void load();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyPreset = (preset: PresetRange) => {
    setActivePreset(preset);
    const range = getPresetDateRange(preset);
    setFrom(range.from);
    setTo(range.to);
    void load(range.from, range.to);
  };

  const handleCustomFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setActivePreset("custom");
    void load(from, to);
  };

  const averageTicket = calculateAverageTicket(report);

  const handleDownloadCsv = () => {
    if (!report) return;
    const csvContent = generateOrderReportCsv(report, {
      from,
      to,
      storeName: "Coctels OPS",
      generatedAt: new Date().toLocaleString("es-CO"),
    });
    const filename = `cierre-caja-coctels-ops-${from || "inicio"}-${to || "hoy"}.csv`;
    downloadCsv(filename, csvContent);
  };

  const handleCopyWhatsApp = async () => {
    if (!report) return;
    const msg = buildShiftClosingWhatsAppMessage(report, {
      from,
      to,
      storeName: "Coctels OPS",
      generatedAt: new Date().toLocaleString("es-CO"),
    });

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(msg);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback if clipboard API is blocked
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!report) return;
    const msg = buildShiftClosingWhatsAppMessage(report, {
      from,
      to,
      storeName: "Coctels OPS",
      generatedAt: new Date().toLocaleString("es-CO"),
    });
    const url = buildShiftClosingWhatsAppUrl(undefined, msg);
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const maxProductRevenue =
    report && report.topProducts.length > 0
      ? Math.max(...report.topProducts.map((p) => p.revenue))
      : 1;

  return (
    <AdminGuard permission="reportes.read">
      <div className="space-y-6">
        {/* Header Section */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-cyan-800">
                Inteligencia de Barra
              </span>
              <span className="text-xs font-semibold text-slate-500">v1.1</span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              Cierre de Caja & Reportes
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Control financiero por turnos, métricas en tiempo real, ticket promedio y exportación ejecutiva.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(from, to)}
              disabled={loading}
              className="min-h-[44px] gap-2 border-slate-300 font-medium text-slate-800 hover:bg-slate-100"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-cyan-600" : ""}`} />
              Actualizar
            </Button>
          </div>
        </header>

        {/* Date Filter & Turno Presets */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Filtros Rápidos de Turno
              </span>

              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtros rápidos de turno">
                <Button
                  type="button"
                  size="sm"
                  variant={activePreset === "today" ? "default" : "outline"}
                  onClick={() => handleApplyPreset("today")}
                  className={`min-h-[36px] text-xs font-semibold ${
                    activePreset === "today"
                      ? "bg-cyan-600 text-white hover:bg-cyan-700"
                      : "border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Hoy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activePreset === "last7days" ? "default" : "outline"}
                  onClick={() => handleApplyPreset("last7days")}
                  className={`min-h-[36px] text-xs font-semibold ${
                    activePreset === "last7days"
                      ? "bg-cyan-600 text-white hover:bg-cyan-700"
                      : "border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Últimos 7 días
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activePreset === "thisMonth" ? "default" : "outline"}
                  onClick={() => handleApplyPreset("thisMonth")}
                  className={`min-h-[36px] text-xs font-semibold ${
                    activePreset === "thisMonth"
                      ? "bg-cyan-600 text-white hover:bg-cyan-700"
                      : "border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Este Mes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activePreset === "all" ? "default" : "outline"}
                  onClick={() => handleApplyPreset("all")}
                  className={`min-h-[36px] text-xs font-semibold ${
                    activePreset === "all"
                      ? "bg-cyan-600 text-white hover:bg-cyan-700"
                      : "border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Histórico
                </Button>
              </div>
            </div>

            <form onSubmit={handleCustomFilter} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="reportFrom" className="text-xs font-semibold text-slate-700">
                  Fecha Inicial
                </Label>
                <Input
                  id="reportFrom"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="mt-1 min-h-[44px] border-slate-300 font-mono text-sm"
                />
              </div>

              <div className="flex-1">
                <Label htmlFor="reportTo" className="text-xs font-semibold text-slate-700">
                  Fecha Final
                </Label>
                <Input
                  id="reportTo"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1 min-h-[44px] border-slate-300 font-mono text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="min-h-[44px] gap-2 bg-slate-900 px-6 font-semibold text-white hover:bg-slate-800"
              >
                <BarChart3 className="h-4 w-4" />
                Generar
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 shadow-sm"
          >
            {error}
          </p>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-xl bg-white shadow-sm" />
          </div>
        ) : !report ? (
          <Card className="border-dashed border-slate-300 bg-white shadow-sm">
            <CardContent className="p-12 text-center text-slate-500">
              <Receipt className="mx-auto mb-3 h-10 w-10 text-slate-400" />
              <p className="text-base font-medium text-slate-700">No hay datos para el período seleccionado.</p>
              <p className="mt-1 text-xs text-slate-500">
                Prueba seleccionando otro rango de fechas o presiona &ldquo;Histórico&rdquo;.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 5 Main KPIs Cards */}
            <section aria-label="Métricas Principales" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {/* Total Revenue */}
              <Card className="relative overflow-hidden border-slate-200 shadow-sm transition-all hover:border-cyan-300">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ingresos Totales</p>
                    <span className="rounded-md bg-emerald-50 p-1.5 text-emerald-600">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
                    {formatCurrency(report.totalRevenue)}
                  </p>
                  <p className="mt-1 text-[11px] text-emerald-600 font-medium">Facturación bruta en COP</p>
                </CardContent>
              </Card>

              {/* Total Orders */}
              <Card className="border-slate-200 shadow-sm transition-all hover:border-cyan-300">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Pedidos</p>
                    <span className="rounded-md bg-cyan-50 p-1.5 text-cyan-600">
                      <Receipt className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
                    {report.orderCount}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">Órdenes procesadas</p>
                </CardContent>
              </Card>

              {/* Ticket Promedio (AOV) */}
              <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50/50 to-white shadow-sm ring-1 ring-cyan-200 transition-all hover:shadow">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-cyan-900">Ticket Promedio</p>
                    <Badge variant="secondary" className="bg-cyan-100 text-[10px] font-bold text-cyan-800">
                      KPI
                    </Badge>
                  </div>
                  <p className="mt-2 text-xl font-black tracking-tight text-cyan-950 sm:text-2xl">
                    {formatCurrency(averageTicket)}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-cyan-700">Por orden completada</p>
                </CardContent>
              </Card>

              {/* Cancellations */}
              <Card className="border-slate-200 shadow-sm transition-all hover:border-red-300">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cancelaciones</p>
                    <span className="rounded-md bg-red-50 p-1.5 text-red-600">
                      <BarChart3 className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
                    {report.cancellationCount}
                  </p>
                  <p className="mt-1 text-[11px] text-red-600 font-medium">Pedidos anulados</p>
                </CardContent>
              </Card>

              {/* Unique Customers */}
              <Card className="col-span-2 border-slate-200 shadow-sm sm:col-span-1 transition-all hover:border-slate-300">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clientes</p>
                    <span className="rounded-md bg-indigo-50 p-1.5 text-indigo-600">
                      <Users className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
                    {report.topCustomers.length}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">Registrados en turno</p>
                </CardContent>
              </Card>
            </section>

            {/* Shift Closing Actions Card */}
            <Card className="border-slate-200 bg-slate-900 text-white shadow-md">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-cyan-400" />
                      Cierre Operativo y Exportación
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Descarga el reporte compatible con Excel o comparte el informe oficial del turno por WhatsApp.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="min-h-[44px] gap-2 bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    <Download className="h-4 w-4" />
                    Descargar CSV (Excel)
                  </Button>

                  <Button
                    type="button"
                    onClick={handleOpenWhatsApp}
                    variant="outline"
                    className="min-h-[44px] gap-2 border-emerald-500 bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Compartir WhatsApp
                  </Button>

                  <Button
                    type="button"
                    onClick={() => void handleCopyWhatsApp()}
                    variant="outline"
                    className="min-h-[44px] gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    {copied ? "¡Copiado!" : "Copiar Resumen"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Analytics Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top Products */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-950">
                        Productos Más Vendidos
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Ordenados por volumen de ingresos en el período
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="border-slate-300 font-mono text-xs">
                      Top {report.topProducts.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {report.topProducts.length === 0 ? (
                    <p className="text-sm text-slate-500">Sin productos en este período.</p>
                  ) : (
                    <ul className="space-y-4">
                      {report.topProducts.slice(0, 10).map((item, index) => {
                        const percent = Math.round((item.revenue / maxProductRevenue) * 100);
                        return (
                          <li key={item.name} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-slate-900">
                                <span className="mr-2 inline-block w-5 text-xs font-bold text-slate-400">
                                  #{index + 1}
                                </span>
                                {item.name}
                                <span className="ml-2 text-xs font-normal text-slate-500">
                                  ({item.quantity} und)
                                </span>
                              </span>
                              <strong className="font-mono text-slate-950">
                                {formatCurrency(item.revenue)}
                              </strong>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-cyan-600 transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Revenue by Status */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-slate-950">
                    Ingresos por Estado de Pedido
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Distribución de ventas según estado operativo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {Object.entries(report.revenueByStatus).map(([status, revenue]) => {
                      const isDelivered = status === "entregado";
                      const isCancelled = status === "cancelado";

                      return (
                        <li
                          key={status}
                          className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                isDelivered
                                  ? "bg-emerald-500"
                                  : isCancelled
                                  ? "bg-red-500"
                                  : "bg-amber-500"
                              }`}
                            />
                            <span className="font-medium capitalize text-slate-800">
                              {status.replace(/_/g, " ")}
                            </span>
                          </div>
                          <strong className="font-mono text-slate-950">
                            {formatCurrency(revenue)}
                          </strong>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Top Customer Buckets */}
                  {report.topCustomers.length > 0 && (
                    <div className="mt-6 border-t border-slate-100 pt-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                        Actividad de Clientes en Turno
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {report.topCustomers.slice(0, 5).map((cust) => (
                          <div
                            key={cust.customerBucket}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                          >
                            <span className="font-semibold text-slate-800">{cust.customerBucket}</span>
                            <span className="ml-1 text-slate-500">· {cust.orders} pedidos</span>
                            <span className="ml-1 font-mono font-bold text-cyan-700">
                              ({formatCurrency(cust.revenue)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AdminGuard>
  );
}
