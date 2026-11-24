"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  Lock,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PaymentProofVerificationControls } from "@/components/admin/PaymentProofVerificationControls";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  EXPENSE_CATEGORY_LABELS,
  sumCashExpenses,
} from "@/lib/cash-register/calculator";
import { formatCop, sanitizeCopAmount } from "@/lib/orders/pos-calculator";
import {
  CASH_EXPENSE_CATEGORIES,
  type CashExpenseCategory,
  type CashShift,
  type CashTransferVerificationItem,
  type PaymentChannelTotals,
} from "@/types/cash-register";
import type { PaymentVerificationStatus } from "@/types/orders";

type CashDashboardResponse = {
  activeShift: CashShift | null;
  liveSales: PaymentChannelTotals | null;
  history: CashShift[];
  transferOrders?: CashTransferVerificationItem[];
  error?: string;
};

const QUICK_BASE_PRESETS = [50_000, 100_000, 150_000, 200_000] as const;

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getReconciliationBadge(status: "cuadrado" | "sobrante" | "faltante") {
  if (status === "cuadrado") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Cuadrado
      </Badge>
    );
  }
  if (status === "sobrante") {
    return (
      <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200">
        Sobrante
      </Badge>
    );
  }
  return (
    <Badge className="bg-rose-100 text-rose-800 border-rose-200">
      <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
      Faltante
    </Badge>
  );
}

export default function CashRegisterPage() {
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [liveSales, setLiveSales] = useState<PaymentChannelTotals | null>(null);
  const [history, setHistory] = useState<CashShift[]>([]);
  const [transferOrders, setTransferOrders] = useState<CashTransferVerificationItem[]>([]);
  const [transferFilter, setTransferFilter] = useState<"pendientes" | "todos">("pendientes");
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);
  const [lastClosedShift, setLastClosedShift] = useState<CashShift | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Open shift form
  const [openingBase, setOpeningBase] = useState("100000");
  const [openingNotes, setOpeningNotes] = useState("");

  // Expense form
  const [expenseCategory, setExpenseCategory] = useState<CashExpenseCategory>("hielo");
  const [expenseConcept, setExpenseConcept] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");

  // Blind close form
  const [showClosePanel, setShowClosePanel] = useState(false);
  const [declaredCash, setDeclaredCash] = useState("");
  const [declaredNequi, setDeclaredNequi] = useState("");
  const [declaredDaviplata, setDeclaredDaviplata] = useState("");
  const [declaredQr, setDeclaredQr] = useState("");
  const [declaredTransferencia, setDeclaredTransferencia] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/caja", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json()) as CashDashboardResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo cargar el estado de caja");
      }
      setActiveShift(body.activeShift ?? null);
      setLiveSales(body.liveSales ?? null);
      setHistory(body.history ?? []);
      setTransferOrders(body.transferOrders ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "No se pudo cargar el módulo de caja.",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function handleOpenShift(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError("");
    setSuccessMessage("");
    setLastClosedShift(null);

    try {
      const response = await fetch("/api/admin/caja", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          action: "open",
          openingBase: sanitizeCopAmount(openingBase),
          openingNotes: openingNotes.trim() || undefined,
        }),
      });
      const body = (await response.json()) as { shift?: CashShift; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo abrir el turno de caja");
      }
      setOpeningNotes("");
      setSuccessMessage("Turno de caja abierto correctamente.");
      await loadDashboard();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Error al abrir el turno de caja.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !activeShift) return;
    setSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/caja", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          action: "expense",
          shiftId: activeShift.id,
          category: expenseCategory,
          concept: expenseConcept.trim(),
          amount: sanitizeCopAmount(expenseAmount),
          notes: expenseNotes.trim() || undefined,
        }),
      });
      const body = (await response.json()) as { shift?: CashShift; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo registrar el gasto de barra");
      }
      setExpenseConcept("");
      setExpenseAmount("");
      setExpenseNotes("");
      setSuccessMessage("Salida de barra registrada.");
      await loadDashboard();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Error al registrar el gasto.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCloseShift(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !activeShift) return;
    if (declaredCash.trim() === "") {
      setError("Debes ingresar el efectivo físico contado en caja para realizar el arqueo.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const countBreakdown: Record<string, number> = {
        declaredCash: sanitizeCopAmount(declaredCash),
      };
      if (declaredNequi.trim() !== "") countBreakdown.declaredNequi = sanitizeCopAmount(declaredNequi);
      if (declaredDaviplata.trim() !== "")
        countBreakdown.declaredDaviplata = sanitizeCopAmount(declaredDaviplata);
      if (declaredQr.trim() !== "") countBreakdown.declaredQr = sanitizeCopAmount(declaredQr);
      if (declaredTransferencia.trim() !== "")
        countBreakdown.declaredTransferencia = sanitizeCopAmount(declaredTransferencia);

      const response = await fetch("/api/admin/caja", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          action: "close",
          shiftId: activeShift.id,
          countBreakdown,
          closingNotes: closingNotes.trim() || undefined,
        }),
      });
      const body = (await response.json()) as { shift?: CashShift; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo cerrar el turno de caja");
      }

      setShowClosePanel(false);
      setDeclaredCash("");
      setDeclaredNequi("");
      setDeclaredDaviplata("");
      setDeclaredQr("");
      setDeclaredTransferencia("");
      setClosingNotes("");
      if (body.shift) {
        setLastClosedShift(body.shift);
      }
      setSuccessMessage("Turno cerrado y arqueo registrado.");
      await loadDashboard();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Error al cerrar el turno de caja.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const totalExpenses = activeShift ? sumCashExpenses(activeShift.expenses) : 0;
  const pendingTransferCount = transferOrders.filter(
    (item) => item.paymentVerificationStatus === "pendiente_verificacion",
  ).length;
  const visibleTransferOrders =
    transferFilter === "pendientes"
      ? transferOrders.filter(
          (item) => item.paymentVerificationStatus === "pendiente_verificacion",
        )
      : transferOrders;

  async function handleVerifyPayment(
    orderId: string,
    status: PaymentVerificationStatus,
    reason?: string,
  ) {
    if (!user) return;
    setVerifyingOrderId(orderId);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/pedidos/${encodeURIComponent(orderId)}/comprobante`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify({
            status,
            ...(reason ? { reason } : {}),
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo actualizar el estado del comprobante");
      }
      setSuccessMessage(
        status === "verificado"
          ? `Pago del pedido #${orderId} aprobado.`
          : status === "rechazado"
            ? `Comprobante del pedido #${orderId} rechazado.`
            : `Estado del comprobante #${orderId} actualizado.`,
      );
      await loadDashboard();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Error al verificar el comprobante.",
      );
    } finally {
      setVerifyingOrderId(null);
    }
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-headline text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Caja y Arqueo por Turno
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Apertura con base en efectivo, conciliación de ventas POS/Web, salidas de barra y arqueo ciego.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="min-h-11 gap-2 self-start sm:self-auto"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Actualizar
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          >
            {successMessage}
          </div>
        )}

        {lastClosedShift?.reconciliation && (
          <Card className="border-2 border-cyan-300 bg-cyan-50/40 shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                  <ShieldCheck className="h-5 w-5 text-cyan-600" aria-hidden="true" />
                  Resultado del Último Arqueo
                </CardTitle>
                {getReconciliationBadge(lastClosedShift.reconciliation.statusLabel)}
              </div>
              <CardDescription className="text-slate-600">
                Cerrado por {lastClosedShift.closedByName ?? "Operador"} el{" "}
                {formatDateTime(lastClosedShift.closedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Base Inicial</p>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {formatCop(lastClosedShift.reconciliation.openingBase)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Ventas Efectivo</p>
                <p className="mt-1 text-base font-bold text-emerald-700">
                  +{formatCop(lastClosedShift.reconciliation.cashSales)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Salidas Barra</p>
                <p className="mt-1 text-base font-bold text-rose-700">
                  -{formatCop(lastClosedShift.reconciliation.totalExpenses)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Efectivo Esperado</p>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {formatCop(lastClosedShift.reconciliation.expectedCash)}
                </p>
              </div>
              <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-3 sm:col-span-1">
                <p className="text-xs text-slate-500">Contado / Diferencia</p>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {formatCop(lastClosedShift.reconciliation.declaredCash)}{" "}
                  <span
                    className={
                      lastClosedShift.reconciliation.cashDifference === 0
                        ? "text-emerald-700"
                        : lastClosedShift.reconciliation.cashDifference > 0
                          ? "text-cyan-700"
                          : "text-rose-700"
                    }
                  >
                    ({lastClosedShift.reconciliation.cashDifference >= 0 ? "+" : "-"}
                    {formatCop(Math.abs(lastClosedShift.reconciliation.cashDifference))})
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && !activeShift && history.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              Cargando estado de caja...
            </CardContent>
          </Card>
        ) : !activeShift ? (
          <PermissionGate permission="pedidos.update">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                  <Wallet className="h-5 w-5 text-[#E5196E]" aria-hidden="true" />
                  Abrir Turno de Caja
                </CardTitle>
                <CardDescription className="text-slate-600">
                  No hay ningún turno abierto actualmente. Ingresa el efectivo base con el que inicia la barra.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void handleOpenShift(e)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="opening-base" className="text-slate-800">
                      Base inicial en efectivo (COP)
                    </Label>
                    <Input
                      id="opening-base"
                      type="number"
                      min={0}
                      step={500}
                      value={openingBase}
                      onChange={(e) => setOpeningBase(e.target.value)}
                      required
                      className="min-h-11 text-lg font-semibold"
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {QUICK_BASE_PRESETS.map((preset) => (
                        <Button
                          key={preset}
                          type="button"
                          variant="outline"
                          onClick={() => setOpeningBase(String(preset))}
                          className="min-h-10 text-xs font-semibold"
                        >
                          {formatCop(preset)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="opening-notes" className="text-slate-800">
                      Notas de apertura (opcional)
                    </Label>
                    <Input
                      id="opening-notes"
                      value={openingNotes}
                      onChange={(e) => setOpeningNotes(e.target.value)}
                      placeholder="Ej. Turno noche viernes, sencillo completo"
                      className="min-h-11"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="min-h-12 w-full bg-[#E5196E] text-base font-semibold text-white hover:bg-[#c8155f] sm:w-auto sm:px-8"
                  >
                    {submitting ? "Abriendo turno..." : "Abrir Turno de Caja"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </PermissionGate>
        ) : (
          <div className="space-y-6">
            {/* Active Shift Header */}
            <Card className="border-slate-800 bg-slate-950 text-white shadow-md">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/40">
                      TURNO ABIERTO
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-slate-300">
                      <Clock className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                      Desde {formatDateTime(activeShift.openedAt)}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-white">
                    Base inicial: <span className="text-cyan-300">{formatCop(activeShift.openingBase)}</span>
                  </p>
                  <p className="text-xs text-slate-300">
                    Responsable apertura: {activeShift.openedByName}
                    {activeShift.openingNotes ? ` · ${activeShift.openingNotes}` : ""}
                  </p>
                </div>

                <PermissionGate permission="pedidos.update">
                  <Button
                    type="button"
                    onClick={() => setShowClosePanel((prev) => !prev)}
                    className="min-h-11 gap-2 bg-[#E5196E] font-semibold text-white hover:bg-[#c8155f]"
                  >
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    {showClosePanel ? "Ocultar Arqueo" : "Realizar Arqueo y Cerrar Caja"}
                  </Button>
                </PermissionGate>
              </CardContent>
            </Card>

            {/* Blind Reconciliation / Close Panel */}
            {showClosePanel && (
              <PermissionGate permission="pedidos.update">
                <Card className="border-2 border-[#E5196E]/40 bg-white shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                      <Lock className="h-5 w-5 text-[#E5196E]" aria-hidden="true" />
                      Arqueo Ciego y Cierre de Turno
                    </CardTitle>
                    <CardDescription className="text-slate-600">
                      Cuenta el efectivo físico en caja e ingrésalo sin ver el esperado. Al confirmar, el sistema calculará automáticamente el sobrante o faltante.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={(e) => void handleCloseShift(e)} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                          <Label htmlFor="declared-cash" className="font-semibold text-slate-900">
                            Efectivo físico contado (COP) *
                          </Label>
                          <Input
                            id="declared-cash"
                            type="number"
                            min={0}
                            step={100}
                            value={declaredCash}
                            onChange={(e) => setDeclaredCash(e.target.value)}
                            placeholder="Ej. 450000"
                            required
                            className="min-h-11 border-slate-300 text-lg font-bold"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="declared-nequi" className="text-slate-700">
                            Nequi verificado (opcional)
                          </Label>
                          <Input
                            id="declared-nequi"
                            type="number"
                            min={0}
                            step={100}
                            value={declaredNequi}
                            onChange={(e) => setDeclaredNequi(e.target.value)}
                            placeholder="Dejar vacío si coincide"
                            className="min-h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="declared-daviplata" className="text-slate-700">
                            Daviplata verificado (opcional)
                          </Label>
                          <Input
                            id="declared-daviplata"
                            type="number"
                            min={0}
                            step={100}
                            value={declaredDaviplata}
                            onChange={(e) => setDeclaredDaviplata(e.target.value)}
                            placeholder="Dejar vacío si coincide"
                            className="min-h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="declared-qr" className="text-slate-700">
                            Código QR verificado (opcional)
                          </Label>
                          <Input
                            id="declared-qr"
                            type="number"
                            min={0}
                            step={100}
                            value={declaredQr}
                            onChange={(e) => setDeclaredQr(e.target.value)}
                            placeholder="Dejar vacío si coincide"
                            className="min-h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="declared-transfer" className="text-slate-700">
                            Transferencia verificada (opcional)
                          </Label>
                          <Input
                            id="declared-transfer"
                            type="number"
                            min={0}
                            step={100}
                            value={declaredTransferencia}
                            onChange={(e) => setDeclaredTransferencia(e.target.value)}
                            placeholder="Dejar vacío si coincide"
                            className="min-h-11"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="closing-notes" className="text-slate-800">
                          Observaciones de cierre (opcional)
                        </Label>
                        <Input
                          id="closing-notes"
                          value={closingNotes}
                          onChange={(e) => setClosingNotes(e.target.value)}
                          placeholder="Ej. Todo cuadrado, sin novedades en datáfono"
                          className="min-h-11"
                        />
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="submit"
                          disabled={submitting}
                          className="min-h-11 bg-[#E5196E] px-6 font-semibold text-white hover:bg-[#c8155f]"
                        >
                          {submitting ? "Cerrando caja..." : "Confirmar Cierre y Calcular Arqueo"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowClosePanel(false)}
                          className="min-h-11"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </PermissionGate>
            )}

            {/* Live Sales Reconciliation */}
            {liveSales && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Card className="col-span-2 border-slate-200 bg-white sm:col-span-1">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-slate-500">Ventas del Turno</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {formatCop(liveSales.totalVentas)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {liveSales.ordersCount} pedidos · {liveSales.cancelledCount} cancelados
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white">
                  <CardContent className="p-4">
                    <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
                      <Banknote className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      Efectivo
                    </p>
                    <p className="mt-1 text-lg font-bold text-emerald-700">
                      {formatCop(liveSales.efectivo)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white">
                  <CardContent className="p-4">
                    <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
                      <Smartphone className="h-3.5 w-3.5 text-[#E5196E]" aria-hidden="true" />
                      Nequi
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCop(liveSales.nequi)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white">
                  <CardContent className="p-4">
                    <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
                      <Smartphone className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
                      Daviplata
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCop(liveSales.daviplata)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-slate-500">Código QR</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCop(liveSales.qr)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-slate-500">Transferencia</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCop(liveSales.transferencia)}
                    </p>
                    {liveSales.sinEspecificar > 0 && (
                      <p className="mt-0.5 text-[11px] text-amber-700">
                        +{formatCop(liveSales.sinEspecificar)} sin canal
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Bar Expenses Section */}
            <div className="grid gap-6 lg:grid-cols-2">
              <PermissionGate permission="pedidos.update">
                <Card className="border-slate-200 bg-white">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                      <MinusCircle className="h-5 w-5 text-rose-600" aria-hidden="true" />
                      Registrar Salida Menor de Barra
                    </CardTitle>
                    <CardDescription className="text-slate-600">
                      Registra pagos menores en efectivo realizados durante el turno (hielo, fruta, domicilios).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={(e) => void handleAddExpense(e)} className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-slate-800">Categoría</Label>
                        <div className="flex flex-wrap gap-2">
                          {CASH_EXPENSE_CATEGORIES.map((category) => {
                            const selected = expenseCategory === category;
                            return (
                              <Button
                                key={category}
                                type="button"
                                variant={selected ? "default" : "outline"}
                                onClick={() => setExpenseCategory(category)}
                                className={`min-h-10 text-xs font-semibold ${
                                  selected ? "bg-slate-900 text-white" : "text-slate-700"
                                }`}
                              >
                                {EXPENSE_CATEGORY_LABELS[category]}
                              </Button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="expense-concept" className="text-slate-800">
                            Concepto *
                          </Label>
                          <Input
                            id="expense-concept"
                            value={expenseConcept}
                            onChange={(e) => setExpenseConcept(e.target.value)}
                            placeholder="Ej. 2 bolsas de hielo"
                            required
                            className="min-h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="expense-amount" className="text-slate-800">
                            Monto (COP) *
                          </Label>
                          <Input
                            id="expense-amount"
                            type="number"
                            min={100}
                            step={100}
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(e.target.value)}
                            placeholder="Ej. 12000"
                            required
                            className="min-h-11"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="expense-notes" className="text-slate-800">
                          Detalle adicional (opcional)
                        </Label>
                        <Input
                          id="expense-notes"
                          value={expenseNotes}
                          onChange={(e) => setExpenseNotes(e.target.value)}
                          placeholder="Ej. Tienda de la esquina"
                          className="min-h-11"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={submitting}
                        className="min-h-11 w-full gap-2 bg-slate-900 text-white hover:bg-slate-800"
                      >
                        <PlusCircle className="h-4 w-4" aria-hidden="true" />
                        {submitting ? "Registrando..." : "Registrar Salida"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </PermissionGate>

              <Card className="border-slate-200 bg-white">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg text-slate-900">
                      Salidas del Turno ({activeShift.expenses.length})
                    </CardTitle>
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 font-bold">
                      Total: -{formatCop(totalExpenses)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeShift.expenses.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">
                      No se han registrado salidas de barra en este turno.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {activeShift.expenses.map((expense) => (
                        <li
                          key={expense.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className="text-[11px]">
                                {EXPENSE_CATEGORY_LABELS[expense.category]}
                              </Badge>
                              <span className="text-sm font-semibold text-slate-900">
                                {expense.concept}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatDateTime(expense.createdAt)} ·{" "}
                              {expense.createdByName ?? expense.createdByUid}
                              {expense.notes ? ` · ${expense.notes}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-rose-700">
                            -{formatCop(expense.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Transfer Proof Verifications */}
        <Card
          data-testid="cash-transfer-verifications-card"
          className="border-slate-200 bg-white shadow-sm"
        >
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                    <Smartphone className="h-5 w-5 text-[#E5196E]" aria-hidden="true" />
                    Verificación de Transferencias
                  </CardTitle>
                  {pendingTransferCount > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-950 font-semibold"
                    >
                      {pendingTransferCount}{" "}
                      {pendingTransferCount === 1 ? "pendiente" : "pendientes"}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-slate-600">
                  Aprueba o rechaza comprobantes de Nequi, Daviplata o Bancolombia en 1 toque.
                </CardDescription>
              </div>

              <div
                className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"
                role="group"
                aria-label="Filtrar transferencias por estado"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={transferFilter === "pendientes" ? "default" : "ghost"}
                  onClick={() => setTransferFilter("pendientes")}
                  className="min-h-10 text-xs font-semibold"
                >
                  Pendientes ({pendingTransferCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={transferFilter === "todos" ? "default" : "ghost"}
                  onClick={() => setTransferFilter("todos")}
                  className="min-h-10 text-xs font-semibold"
                >
                  Todos ({transferOrders.length})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {visibleTransferOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                {transferFilter === "pendientes"
                  ? "No hay transferencias pendientes por verificar."
                  : "Aún no hay pedidos con transferencia registrados."}
              </p>
            ) : (
              <div className="space-y-3">
                {visibleTransferOrders.map((item) => (
                  <div
                    key={item.orderId}
                    data-testid={`cash-transfer-row-${item.orderId}`}
                    className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-950">
                          {item.customerName}{" "}
                          <span className="font-mono text-xs font-medium text-slate-500">
                            #{item.orderId}
                          </span>
                        </p>
                        <p className="text-xs text-slate-600">
                          {item.phone} · {formatDateTime(item.createdAt)} · Pedido{" "}
                          <span className="capitalize font-medium">
                            {item.status.replace("_", " ")}
                          </span>
                        </p>
                      </div>
                      <span className="text-base font-extrabold text-slate-950">
                        {formatCop(item.total)}
                      </span>
                    </div>

                    <PaymentProofVerificationControls
                      orderId={item.orderId}
                      paymentVerificationStatus={item.paymentVerificationStatus}
                      paymentProof={item.paymentProof}
                      paymentVerification={item.paymentVerification}
                      digitalChannel={item.digitalChannel}
                      digitalReference={item.digitalReference}
                      isVerifying={verifyingOrderId === item.orderId}
                      onVerifyPayment={handleVerifyPayment}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Closed Shifts History */}
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Historial de Turnos Cerrados</CardTitle>
            <CardDescription className="text-slate-600">
              Trazabilidad de arqueos y cierres anteriores por cajero.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Aún no hay turnos cerrados registrados.
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((shift) => {
                  const rec = shift.reconciliation;
                  return (
                    <div
                      key={shift.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {formatDateTime(shift.openedAt)} → {formatDateTime(shift.closedAt)}
                          </span>
                          {rec && getReconciliationBadge(rec.statusLabel)}
                        </div>
                        <p className="text-xs text-slate-600">
                          Abrió: {shift.openedByName} · Cerró: {shift.closedByName ?? "—"}
                        </p>
                        {shift.closingNotes && (
                          <p className="text-xs italic text-slate-500">“{shift.closingNotes}”</p>
                        )}
                      </div>

                      {rec && (
                        <div className="grid grid-cols-3 gap-3 text-right sm:flex sm:items-center sm:gap-5">
                          <div>
                            <p className="text-[11px] text-slate-500">Ventas</p>
                            <p className="text-sm font-bold text-slate-900">
                              {formatCop(shift.salesSnapshot?.totalVentas ?? 0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500">Esperado / Contado</p>
                            <p className="text-sm font-semibold text-slate-800">
                              {formatCop(rec.expectedCash)} / {formatCop(rec.declaredCash)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500">Diferencia</p>
                            <p
                              className={`text-sm font-bold ${
                                rec.cashDifference === 0
                                  ? "text-emerald-700"
                                  : rec.cashDifference > 0
                                    ? "text-cyan-700"
                                    : "text-rose-700"
                              }`}
                            >
                              {rec.cashDifference >= 0 ? "+" : "-"}
                              {formatCop(Math.abs(rec.cashDifference))}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
