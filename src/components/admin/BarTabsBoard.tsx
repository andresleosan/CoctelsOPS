"use client";

import {
  CheckCircle2,
  Clock,
  Layers,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Split,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { getProductSizes } from "@/lib/catalog/presentations";
import {
  buildPosLineKey,
  calculatePosUnitPrice,
  formatCop,
  getPosProductDefaultSize,
  POS_PAYMENT_METHOD_LABELS,
  sanitizeCopAmount,
  type PosCartItem,
} from "@/lib/orders/pos-calculator";
import {
  calculateEqualSplitShares,
  validateBarTabPayments,
} from "@/lib/tabs/calculator";
import type { Product } from "@/types/catalog";
import type { OrderCustomization, PosPaymentMethod } from "@/types/orders";
import type {
  BarTab,
  BarTabPaymentInput,
  BarTabSplitMode,
} from "@/types/tabs";

type SingleMethod = Exclude<PosPaymentMethod, "mixto">;

const SINGLE_METHODS: SingleMethod[] = ["efectivo", "nequi", "daviplata", "qr", "transferencia"];
const QUICK_TABLE_PRESETS = [
  "Mesa 1",
  "Mesa 2",
  "Mesa 3",
  "Mesa 4",
  "Mesa 5",
  "Mesa 6",
  "Barra 1",
  "Barra 2",
];

function formatTimeShort(iso?: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

export function BarTabsBoard() {
  const { user } = useAuth();
  const [tabs, setTabs] = useState<BarTab[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  // Abrir mesa
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [guestCount, setGuestCount] = useState("2");

  // Modal Agregar Ronda al KDS
  const [roundTab, setRoundTab] = useState<BarTab | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [draftSize, setDraftSize] = useState("");
  const [draftFlavors, setDraftFlavors] = useState<string[]>([]);
  const [draftAddOns, setDraftAddOns] = useState<string[]>([]);
  const [draftQty, setDraftQty] = useState(1);
  const [roundCart, setRoundCart] = useState<PosCartItem[]>([]);
  const [roundNotes, setRoundNotes] = useState("");

  // Modal Dividir / Cerrar Cuenta
  const [closeTab, setCloseTab] = useState<BarTab | null>(null);
  const [splitMode, setSplitMode] = useState<BarTabSplitMode>("single");
  const [splitGuests, setSplitGuests] = useState(2);
  const [singleMethod, setSingleMethod] = useState<SingleMethod>("efectivo");
  const [singleReference, setSingleReference] = useState("");
  const [equalMethods, setEqualMethods] = useState<SingleMethod[]>(["efectivo", "efectivo"]);
  const [customPayments, setCustomPayments] = useState<BarTabPaymentInput[]>([
    { label: "Pago 1", method: "efectivo", amount: 0 },
  ]);
  const [closingNotes, setClosingNotes] = useState("");

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const [tabsRes, productsRes] = await Promise.all([
        fetch("/api/admin/mesas", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/productos", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const tabsData = (await tabsRes.json().catch(() => ({}))) as { tabs?: BarTab[]; error?: string };
      if (!tabsRes.ok) {
        throw new Error(tabsData.error ?? "No se pudieron cargar las mesas");
      }
      setTabs(tabsData.tabs ?? []);

      if (productsRes.ok) {
        const productsData = (await productsRes.json().catch(() => ({}))) as { products?: Product[] };
        setProducts((productsData.products ?? []).filter((p) => p.active && p.stock > 0));
      }
    } catch (error) {
      setFeedback({
        type: "err",
        message: error instanceof Error ? error.message : "Error cargando mesas",
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openTabs = useMemo(() => tabs.filter((tab) => tab.status === "abierta"), [tabs]);
  const closedTabs = useMemo(() => tabs.filter((tab) => tab.status !== "abierta").slice(0, 10), [tabs]);

  const totalOpenAmount = useMemo(
    () => openTabs.reduce((sum, tab) => sum + tab.total, 0),
    [openTabs],
  );
  const totalOpenRounds = useMemo(
    () => openTabs.reduce((sum, tab) => sum + tab.rounds.length, 0),
    [openTabs],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 24);
    return products
      .filter(
        (product) =>
          product.name.toLowerCase().includes(q) || product.category.toLowerCase().includes(q),
      )
      .slice(0, 24);
  }, [products, productSearch]);

  async function handleOpenTab(presetTable?: string) {
    if (!user) return;
    const targetTable = (presetTable ?? tableNumber).trim();
    if (!targetTable) {
      setFeedback({ type: "err", message: "Ingresa o selecciona un número de mesa." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/mesas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "open",
          tableNumber: targetTable,
          customerName: customerName.trim() || undefined,
          guestCount: Math.max(1, Math.min(30, Number(guestCount) || 1)),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { tab?: BarTab; error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo abrir la mesa");

      setTableNumber("");
      setCustomerName("");
      setGuestCount("2");
      setFeedback({ type: "ok", message: `Cuenta abierta para ${data.tab?.tableNumber ?? targetTable}.` });
      await loadData();
    } catch (error) {
      setFeedback({
        type: "err",
        message: error instanceof Error ? error.message : "Error abriendo mesa",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function openRoundDialog(tab: BarTab) {
    setRoundTab(tab);
    setRoundCart([]);
    setRoundNotes("");
    setProductSearch("");
    setSelectedProduct(null);
  }

  function selectProductForRound(product: Product) {
    const defaultSize = getPosProductDefaultSize(product);
    setSelectedProduct(product);
    setDraftSize(defaultSize.name);
    setDraftFlavors(product.availableFlavors.slice(0, 1));
    setDraftAddOns([]);
    setDraftQty(1);
  }

  function addSelectedProductToRound() {
    if (!selectedProduct) return;
    const customization: OrderCustomization = {
      size: draftSize || getPosProductDefaultSize(selectedProduct).name,
      flavors: draftFlavors,
      addOns: draftAddOns,
    };
    const unitPrice = calculatePosUnitPrice(selectedProduct, customization);
    const lineKey = buildPosLineKey(selectedProduct.id, customization);

    setRoundCart((prev) => {
      const existing = prev.find((item) => item.lineKey === lineKey);
      if (existing) {
        return prev.map((item) =>
          item.lineKey === lineKey
            ? {
                ...item,
                quantity: item.quantity + draftQty,
                subtotal: (item.quantity + draftQty) * item.unitPrice,
              }
            : item,
        );
      }
      return [
        ...prev,
        {
          lineKey,
          productId: selectedProduct.id,
          name: selectedProduct.name,
          quantity: draftQty,
          unitPrice,
          subtotal: unitPrice * draftQty,
          customization,
        },
      ];
    });
    setSelectedProduct(null);
  }

  async function handleSendRoundToKds() {
    if (!user || !roundTab || roundCart.length === 0) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/mesas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "add_round",
          tabId: roundTab.id,
          items: roundCart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            customization: item.customization,
          })),
          notes: roundNotes.trim() || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        orderId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar la ronda al KDS");

      setRoundTab(null);
      setRoundCart([]);
      setFeedback({
        type: "ok",
        message: `Ronda enviada al KDS para ${roundTab.tableNumber} (Pedido #${data.orderId?.slice(0, 8) ?? ""}).`,
      });
      await loadData();
    } catch (error) {
      setFeedback({
        type: "err",
        message: error instanceof Error ? error.message : "Error enviando ronda",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function openCloseDialog(tab: BarTab) {
    const guests = Math.max(2, tab.guestCount || 2);
    setCloseTab(tab);
    setSplitMode("single");
    setSplitGuests(guests);
    setSingleMethod("efectivo");
    setSingleReference("");
    setEqualMethods(Array.from({ length: guests }, () => "efectivo"));
    setCustomPayments([
      { label: "Pago 1 (Efectivo)", method: "efectivo", amount: Math.floor(tab.total / 2) },
      { label: "Pago 2 (Nequi)", method: "nequi", amount: tab.total - Math.floor(tab.total / 2) },
    ]);
    setClosingNotes("");
  }

  const equalShares = useMemo(() => {
    if (!closeTab) return [];
    return calculateEqualSplitShares(closeTab.total, splitGuests);
  }, [closeTab, splitGuests]);

  const resolvedPayments = useMemo<BarTabPaymentInput[]>(() => {
    if (!closeTab) return [];
    if (splitMode === "single") {
      return [
        {
          label: "Pago completo",
          method: singleMethod,
          amount: closeTab.total,
          reference: singleReference.trim() || undefined,
        },
      ];
    }
    if (splitMode === "equal") {
      return equalShares.map((share, idx) => ({
        label: `Comensal ${idx + 1}`,
        method: equalMethods[idx] ?? "efectivo",
        amount: share,
      }));
    }
    return customPayments.filter((p) => sanitizeCopAmount(p.amount) > 0);
  }, [closeTab, splitMode, singleMethod, singleReference, equalShares, equalMethods, customPayments]);

  const paymentValidation = useMemo(() => {
    if (!closeTab) return null;
    return validateBarTabPayments(closeTab.total, resolvedPayments);
  }, [closeTab, resolvedPayments]);

  async function handleConfirmCloseTab() {
    if (!user || !closeTab || !paymentValidation?.isCovered) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/mesas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "close",
          tabId: closeTab.id,
          splitMode,
          guestCount: splitMode === "equal" ? splitGuests : closeTab.guestCount,
          payments: resolvedPayments.map((p) => ({
            ...p,
            amount: sanitizeCopAmount(p.amount),
          })),
          closingNotes: closingNotes.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo cerrar la cuenta");

      setCloseTab(null);
      setFeedback({
        type: "ok",
        message: `Cuenta de ${closeTab.tableNumber} cerrada por ${formatCop(closeTab.total)}.`,
      });
      await loadData();
    } catch (error) {
      setFeedback({
        type: "err",
        message: error instanceof Error ? error.message : "Error cerrando la cuenta",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelEmptyTab(tab: BarTab) {
    if (!user || tab.rounds.length > 0) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/mesas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "cancel",
          tabId: tab.id,
          reason: "Mesa liberada sin consumo",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo cancelar la mesa");

      setFeedback({ type: "ok", message: `Mesa ${tab.tableNumber} liberada.` });
      await loadData();
    } catch (error) {
      setFeedback({
        type: "err",
        message: error instanceof Error ? error.message : "Error cancelando mesa",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const activeTableNames = useMemo(
    () => new Set(openTabs.map((t) => t.tableNumber.trim().toLowerCase())),
    [openTabs],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Cuentas Abiertas por Mesa (Bar Tabs)
          </h1>
          <p className="text-sm text-slate-600">
            Acumula rondas en vivo hacia el KDS y cierra cuentas con pago único, dividido o mixto.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadData()}
          disabled={loading}
          className="min-h-11 border-slate-300 text-slate-800"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {feedback ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">Mesas Abiertas</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">{openTabs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">Saldo Abierto en Sala</CardDescription>
            <CardTitle className="text-2xl font-bold text-pink-600">
              {formatCop(totalOpenAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-500">Rondas Activas en KDS</CardDescription>
            <CardTitle className="text-2xl font-bold text-cyan-700">{totalOpenRounds}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Abrir Nueva Mesa */}
      <PermissionGate permission="pedidos.update">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <UtensilsCrossed className="h-5 w-5 text-pink-600" />
              Abrir Cuenta en Mesa o Barra
            </CardTitle>
            <CardDescription className="text-slate-600">
              Toca un acceso rápido o escribe el identificador de la mesa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {QUICK_TABLE_PRESETS.map((preset) => {
                const isBusy = activeTableNames.has(preset.toLowerCase());
                return (
                  <Button
                    key={preset}
                    type="button"
                    variant={isBusy ? "secondary" : "outline"}
                    disabled={isBusy || submitting}
                    onClick={() => void handleOpenTab(preset)}
                    className="min-h-11 border-slate-300 text-slate-800"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {preset} {isBusy ? "(Ocupada)" : ""}
                  </Button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="tab-table" className="text-slate-700">
                  Mesa / Barra
                </Label>
                <Input
                  id="tab-table"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Ej: Mesa 9 o VIP"
                  className="min-h-11 bg-white text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tab-customer" className="text-slate-700">
                  Cliente / Grupo (opcional)
                </Label>
                <Input
                  id="tab-customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej: Cumpleaños Laura"
                  className="min-h-11 bg-white text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tab-guests" className="text-slate-700">
                  Comensales
                </Label>
                <Input
                  id="tab-guests"
                  type="number"
                  min={1}
                  max={30}
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                  className="min-h-11 bg-white text-slate-900"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  disabled={submitting || !tableNumber.trim()}
                  onClick={() => void handleOpenTab()}
                  className="min-h-11 w-full bg-pink-600 text-white hover:bg-pink-700"
                >
                  Abrir Cuenta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </PermissionGate>

      {/* Mesas Abiertas */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Cuentas Abiertas ({openTabs.length})
        </h2>

        {openTabs.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="py-10 text-center text-sm text-slate-500">
              No hay cuentas abiertas en este momento. Abre una mesa arriba para comenzar a cargar rondas.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {openTabs.map((tab) => (
              <Card key={tab.id} className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                        {tab.tableNumber}
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                          Abierta
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        {tab.customerName ? <span>{tab.customerName}</span> : null}
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {tab.guestCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {formatElapsed(tab.openedAt)} (
                          {formatTimeShort(tab.openedAt)})
                        </span>
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium uppercase text-slate-500">Total acumulado</p>
                      <p className="text-2xl font-bold text-slate-900">{formatCop(tab.total)}</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Rondas */}
                  {tab.rounds.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                      Sin rondas enviadas aún. Agrega la primera ronda para despachar al KDS.
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {tab.rounds.map((round) => (
                        <div
                          key={`${tab.id}-r-${round.roundNumber}`}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-800">
                            <span className="inline-flex items-center gap-1.5">
                              <Layers className="h-3.5 w-3.5 text-cyan-700" />
                              Ronda #{round.roundNumber} · {formatTimeShort(round.createdAt)}
                            </span>
                            <div className="flex items-center gap-2">
                              <span>{formatCop(round.subtotal)}</span>
                              {round.orderId ? (
                                <Link
                                  href={`/admin/pedidos/${round.orderId}`}
                                  className="text-cyan-700 underline hover:text-cyan-900"
                                >
                                  Ver KDS
                                </Link>
                              ) : null}
                            </div>
                          </div>
                          <ul className="mt-1 space-y-0.5 text-slate-600">
                            {round.items.map((item, idx) => (
                              <li key={`${round.orderId}-${idx}`}>
                                {item.quantity}x {item.name} ({item.customization.size}) —{" "}
                                {formatCop(item.subtotal)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Acciones */}
                  <PermissionGate permission="pedidos.update">
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        onClick={() => openRoundDialog(tab)}
                        className="min-h-11 flex-1 bg-cyan-600 text-white hover:bg-cyan-700"
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        Ronda al KDS
                      </Button>
                      {tab.rounds.length > 0 ? (
                        <Button
                          type="button"
                          onClick={() => openCloseDialog(tab)}
                          className="min-h-11 flex-1 bg-slate-900 text-white hover:bg-slate-800"
                        >
                          <Split className="mr-1.5 h-4 w-4" />
                          Dividir / Cerrar
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => void handleCancelEmptyTab(tab)}
                          className="min-h-11 border-rose-300 text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Liberar
                        </Button>
                      )}
                    </div>
                  </PermissionGate>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Historial Reciente */}
      {closedTabs.length > 0 ? (
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-900">
              <Receipt className="h-4 w-4 text-slate-600" />
              Cuentas Cerradas Recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {closedTabs.map((tab) => (
              <div
                key={tab.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-semibold text-slate-900">{tab.tableNumber}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {tab.rounds.length} rondas · Cerrada {formatTimeShort(tab.closedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      tab.status === "cerrada"
                        ? "bg-slate-100 text-slate-800 border-slate-300"
                        : "bg-rose-100 text-rose-800 border-rose-200"
                    }
                  >
                    {tab.status === "cerrada" ? "Cerrada" : "Cancelada"}
                  </Badge>
                  <span className="font-bold text-slate-900">{formatCop(tab.total)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Dialog: Agregar Ronda al KDS */}
      <Dialog open={Boolean(roundTab)} onOpenChange={(open) => !open && setRoundTab(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white text-slate-900 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              Nueva Ronda al KDS — {roundTab?.tableNumber}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Selecciona los productos de esta ronda; se enviarán directo a la barra/KDS.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar granizado o cóctel..."
                className="min-h-11 bg-white pl-9 text-slate-900"
              />
            </div>

            {selectedProduct ? (
              <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{selectedProduct.name}</p>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setSelectedProduct(null)}
                    aria-label="Cerrar personalización"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-700">Presentación</p>
                  <div className="flex flex-wrap gap-1.5">
                    {getProductSizes(selectedProduct).map((size) => (
                      <Button
                        key={size.name}
                        type="button"
                        size="sm"
                        variant={draftSize === size.name ? "default" : "outline"}
                        onClick={() => setDraftSize(size.name)}
                        className="min-h-9"
                      >
                        {size.name} · {formatCop(size.price)}
                      </Button>
                    ))}
                  </div>
                </div>

                {selectedProduct.availableFlavors.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-700">Sabores</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProduct.availableFlavors.map((flavor) => {
                        const active = draftFlavors.includes(flavor);
                        return (
                          <Button
                            key={flavor}
                            type="button"
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={() =>
                              setDraftFlavors((prev) =>
                                active ? prev.filter((f) => f !== flavor) : [...prev, flavor],
                              )
                            }
                            className="min-h-9"
                          >
                            {flavor}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {selectedProduct.availableAddOns.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-700">Adiciones</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProduct.availableAddOns.map((addOn) => {
                        const active = draftAddOns.includes(addOn.name);
                        return (
                          <Button
                            key={addOn.name}
                            type="button"
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={() =>
                              setDraftAddOns((prev) =>
                                active
                                  ? prev.filter((a) => a !== addOn.name)
                                  : [...prev, addOn.name],
                              )
                            }
                            className="min-h-9"
                          >
                            {addOn.name} (+{formatCop(addOn.price)})
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftQty((q) => Math.max(1, q - 1))}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center font-semibold">{draftQty}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftQty((q) => Math.min(20, q + 1))}
                    >
                      +
                    </Button>
                  </div>
                  <Button
                    type="button"
                    onClick={addSelectedProductToRound}
                    className="min-h-10 bg-cyan-600 text-white hover:bg-cyan-700"
                  >
                    Agregar a la ronda
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectProductForRound(product)}
                    className="flex min-h-12 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:border-cyan-400 hover:bg-cyan-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.category}</p>
                    </div>
                    <span className="font-semibold text-slate-800">
                      {formatCop(getPosProductDefaultSize(product).price)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Resumen de la ronda */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">
                Ítems de esta ronda ({roundCart.reduce((s, i) => s + i.quantity, 0)})
              </p>
              {roundCart.length === 0 ? (
                <p className="text-xs text-slate-500">Selecciona productos arriba para armar la ronda.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {roundCart.map((item) => (
                    <li key={item.lineKey} className="flex items-center justify-between">
                      <span>
                        {item.quantity}x {item.name} ({item.customization.size})
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{formatCop(item.subtotal)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setRoundCart((prev) => prev.filter((c) => c.lineKey !== item.lineKey))
                          }
                          className="text-rose-600 hover:text-rose-800"
                          aria-label="Quitar ítem"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Input
                value={roundNotes}
                onChange={(e) => setRoundNotes(e.target.value)}
                placeholder="Nota para barra/KDS (ej: Sin pitillo, poco hielo)"
                className="min-h-10 bg-white text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRoundTab(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={submitting || roundCart.length === 0}
                onClick={() => void handleSendRoundToKds()}
                className="min-h-11 bg-pink-600 text-white hover:bg-pink-700"
              >
                <Send className="mr-2 h-4 w-4" />
                Enviar Ronda al KDS (
                {formatCop(roundCart.reduce((s, item) => s + item.subtotal, 0))})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Dividir / Cerrar Cuenta */}
      <Dialog open={Boolean(closeTab)} onOpenChange={(open) => !open && setCloseTab(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white text-slate-900 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              Cerrar Cuenta — {closeTab?.tableNumber}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Total a cobrar:{" "}
              <strong className="text-slate-900">{formatCop(closeTab?.total ?? 0)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Selector de modo */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={splitMode === "single" ? "default" : "outline"}
                onClick={() => setSplitMode("single")}
                className="min-h-11"
              >
                1 Pago
              </Button>
              <Button
                type="button"
                variant={splitMode === "equal" ? "default" : "outline"}
                onClick={() => setSplitMode("equal")}
                className="min-h-11"
              >
                Dividir Equitativo
              </Button>
              <Button
                type="button"
                variant={splitMode === "custom" ? "default" : "outline"}
                onClick={() => setSplitMode("custom")}
                className="min-h-11"
              >
                Mixto / Partes
              </Button>
            </div>

            {splitMode === "single" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <Label className="text-slate-700">Método de pago</Label>
                <div className="flex flex-wrap gap-2">
                  {SINGLE_METHODS.map((method) => (
                    <Button
                      key={method}
                      type="button"
                      size="sm"
                      variant={singleMethod === method ? "default" : "outline"}
                      onClick={() => setSingleMethod(method)}
                      className="min-h-10"
                    >
                      {POS_PAYMENT_METHOD_LABELS[method]}
                    </Button>
                  ))}
                </div>
                {singleMethod !== "efectivo" ? (
                  <Input
                    value={singleReference}
                    onChange={(e) => setSingleReference(e.target.value)}
                    placeholder="Referencia / últimos 4 dígitos (opcional)"
                    className="min-h-10 bg-white text-slate-900"
                  />
                ) : null}
              </div>
            ) : null}

            {splitMode === "equal" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-700">Número de comensales</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const next = Math.max(2, splitGuests - 1);
                        setSplitGuests(next);
                        setEqualMethods((prev) => prev.slice(0, next));
                      }}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center font-bold">{splitGuests}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const next = Math.min(20, splitGuests + 1);
                        setSplitGuests(next);
                        setEqualMethods((prev) => [...prev, "efectivo"]);
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {equalShares.map((share, idx) => (
                    <div
                      key={`guest-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-800">
                        Comensal {idx + 1}: <strong>{formatCop(share)}</strong>
                      </span>
                      <select
                        aria-label={`Método de pago comensal ${idx + 1}`}
                        value={equalMethods[idx] ?? "efectivo"}
                        onChange={(e) => {
                          const val = e.target.value as SingleMethod;
                          setEqualMethods((prev) => {
                            const copy = [...prev];
                            copy[idx] = val;
                            return copy;
                          });
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                      >
                        {SINGLE_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {POS_PAYMENT_METHOD_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {splitMode === "custom" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                {customPayments.map((payment, idx) => (
                  <div key={`custom-${idx}`} className="grid grid-cols-12 items-center gap-2">
                    <select
                      aria-label={`Método pago ${idx + 1}`}
                      value={payment.method}
                      onChange={(e) => {
                        const method = e.target.value as SingleMethod;
                        setCustomPayments((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, method } : item)),
                        );
                      }}
                      className="col-span-5 min-h-10 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900"
                    >
                      {SINGLE_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {POS_PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={0}
                      value={payment.amount}
                      onChange={(e) => {
                        const amount = sanitizeCopAmount(e.target.value);
                        setCustomPayments((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, amount } : item)),
                        );
                      }}
                      className="col-span-5 min-h-10 bg-white text-slate-900"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={customPayments.length <= 1}
                      onClick={() =>
                        setCustomPayments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="col-span-2 text-rose-600"
                      aria-label="Eliminar línea de pago"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCustomPayments((prev) => [
                      ...prev,
                      {
                        label: `Pago ${prev.length + 1}`,
                        method: "nequi",
                        amount: paymentValidation?.shortfall ?? 0,
                      },
                    ])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Agregar otro pago
                </Button>
              </div>
            ) : null}

            {paymentValidation ? (
              <div
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  paymentValidation.isCovered
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {paymentValidation.isCovered ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Cubierto ({formatCop(paymentValidation.totalPaid)})
                    {paymentValidation.changeAmount > 0
                      ? ` · Cambio: ${formatCop(paymentValidation.changeAmount)}`
                      : ""}
                  </span>
                ) : (
                  <span>Faltante por cubrir: {formatCop(paymentValidation.shortfall)}</span>
                )}
              </div>
            ) : null}

            <Input
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Notas de cierre (opcional)"
              className="min-h-10 bg-white text-slate-900"
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCloseTab(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={submitting || !paymentValidation?.isCovered}
                onClick={() => void handleConfirmCloseTab()}
                className="min-h-11 bg-slate-900 text-white hover:bg-slate-800"
              >
                Confirmar y Cerrar Cuenta
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
