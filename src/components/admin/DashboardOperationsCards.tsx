import Link from "next/link";
import { ArrowRight, Receipt, UtensilsCrossed, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { sumCashExpenses } from "@/lib/cash-register/calculator";
import type {
  CashShift,
  CashTransferVerificationItem,
  PaymentChannelTotals,
} from "@/types/cash-register";
import type { BarTab } from "@/types/tabs";

export type DashboardCashSummary = {
  activeShift: CashShift | null;
  liveSales: PaymentChannelTotals | null;
  transferOrders: CashTransferVerificationItem[];
};

export type DashboardOperationsCardsProps = {
  cash: DashboardCashSummary | null;
  tabs: BarTab[] | null;
  loading: boolean;
};

function formatCop(amount: number): string {
  return `$${Math.max(0, Math.round(amount)).toLocaleString("es-CO")}`;
}

export function DashboardOperationsCards({
  cash,
  tabs,
  loading,
}: DashboardOperationsCardsProps) {
  if (loading) {
    return (
      <section
        aria-label="Operación de caja y mesas en vivo"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-6 w-48 motion-reduce:animate-none" />
            <div className="grid grid-cols-3 gap-2.5">
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
            </div>
            <Skeleton className="h-11 w-32 motion-reduce:animate-none" />
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-6 w-48 motion-reduce:animate-none" />
            <div className="grid grid-cols-3 gap-2.5">
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
            </div>
            <Skeleton className="h-11 w-32 motion-reduce:animate-none" />
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!cash && !tabs) {
    return null;
  }

  const activeShift = cash?.activeShift ?? null;
  const liveSales = cash?.liveSales ?? null;
  const pendingTransfersCount = (cash?.transferOrders ?? []).filter(
    (item) => item.paymentVerificationStatus === "pendiente_verificacion",
  ).length;
  const expensesTotal = activeShift ? sumCashExpenses(activeShift.expenses) : 0;
  const expectedCash = activeShift
    ? activeShift.openingBase + (liveSales?.efectivo ?? 0) - expensesTotal
    : 0;

  const openTabs = (tabs ?? []).filter((tab) => tab.status === "abierta");
  const openTotal = openTabs.reduce((sum, tab) => sum + tab.total, 0);
  const totalGuests = openTabs.reduce((sum, tab) => sum + tab.guestCount, 0);
  const totalRounds = openTabs.reduce((sum, tab) => sum + tab.rounds.length, 0);
  const billRequestsCount = openTabs.filter((tab) => Boolean(tab.billRequest)).length;

  return (
    <section
      aria-label="Operación de caja y mesas en vivo"
      className="grid grid-cols-1 gap-4 lg:grid-cols-2"
    >
      {cash && (
        <Card
          data-testid="dashboard-cash-kpi"
          className="flex flex-col justify-between border-slate-200 bg-white shadow-sm"
        >
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Wallet className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Caja y Turno en vivo
                </CardTitle>
                <p className="text-xs text-slate-500">
                  {activeShift
                    ? `Cajero: ${activeShift.openedByName}`
                    : "Sin turno abierto en barra"}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                activeShift
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              }
            >
              {activeShift ? "Turno abierto" : "Turno cerrado"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Ventas turno
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                  {formatCop(liveSales?.totalVentas ?? 0)}
                </p>
                <p className="text-xs text-slate-500">
                  {activeShift
                    ? `${liveSales?.ordersCount ?? 0} pedidos`
                    : "Abre un turno"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Efectivo esperado
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                  {formatCop(expectedCash)}
                </p>
                <p className="text-xs text-slate-500">
                  Base {formatCop(activeShift?.openingBase ?? 0)}
                </p>
              </div>

              <div
                className={`rounded-xl border p-3 ${
                  pendingTransfersCount > 0
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-slate-200 bg-slate-50 text-slate-900"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                  Por verificar
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums">
                  {pendingTransfersCount}
                </p>
                <p className="text-xs opacity-75">transferencias</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-600">
                {activeShift
                  ? `Gastos registrados: ${formatCop(expensesTotal)}`
                  : "Inicia el turno para conciliar efectivo y comprobantes."}
              </p>
              <Link
                href="/admin/caja"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-cyan-400 hover:bg-cyan-50/60"
              >
                Ir a Caja <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {tabs && (
        <Card
          data-testid="dashboard-tabs-kpi"
          className="flex flex-col justify-between border-slate-200 bg-white shadow-sm"
        >
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-800">
                <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Mesas y Cuentas en vivo
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Consumo activo por QR y barra
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                openTabs.length > 0
                  ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              }
            >
              {openTabs.length > 0 ? `${openTabs.length} abiertas` : "Sin mesas abiertas"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Mesas abiertas
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                  {openTabs.length}
                </p>
                <p className="text-xs text-slate-500">{totalGuests} comensales</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Saldo acumulado
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                  {formatCop(openTotal)}
                </p>
                <p className="text-xs text-slate-500">{totalRounds} rondas</p>
              </div>

              <div
                className={`rounded-xl border p-3 ${
                  billRequestsCount > 0
                    ? "border-pink-200 bg-pink-50 text-pink-950"
                    : "border-slate-200 bg-slate-50 text-slate-900"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                  Piden cuenta
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums">
                  {billRequestsCount}
                </p>
                <p className="text-xs opacity-75">solicitudes QR</p>
              </div>
            </div>

            {openTabs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {openTabs.slice(0, 3).map((tab) => (
                  <span
                    key={tab.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800"
                  >
                    <span>{tab.tableNumber}</span>
                    <span className="font-bold tabular-nums">{formatCop(tab.total)}</span>
                    {tab.billRequest && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold text-pink-800">
                        <Receipt className="h-3 w-3" aria-hidden="true" />
                        Cuenta
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-600">
                {openTabs.length > 0
                  ? `${tabs?.filter((tab) => tab.status === "cerrada").length ?? 0} cuentas cerradas registradas`
                  : "Las mesas abiertas desde QR o barra aparecerán aquí."}
              </p>
              <Link
                href="/admin/mesas"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-cyan-400 hover:bg-cyan-50/60"
              >
                Ir a Mesas <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
