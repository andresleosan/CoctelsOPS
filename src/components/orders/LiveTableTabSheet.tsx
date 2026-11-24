"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Layers,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  Split,
  Trash2,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { useOptionalAuthContext } from "@/components/auth/AuthProvider";
import {
  OPEN_LIVE_TABLE_TAB_EVENT,
  SERVICE_MESA_STORAGE_KEY,
  SERVICE_NEGOCIO_ID_STORAGE_KEY,
  SERVICE_STORE_NAME_STORAGE_KEY,
  SERVICE_TENANT_SLUG_STORAGE_KEY,
  SERVICE_TYPE_STORAGE_KEY,
  TABLE_SERVICE_CHANGE_EVENT,
} from "@/components/products/TableServiceBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCart } from "@/context/cart-context";
import { formatCop, POS_PAYMENT_METHOD_LABELS } from "@/lib/orders/pos-calculator";
import {
  calculateEqualSplitShares,
  canonicalizeTableNumber,
  isPickupTableIdentifier,
} from "@/lib/tabs/calculator";
import type { OrderStatus, PosPaymentMethod } from "@/types/orders";
import type { PublicTableTab } from "@/types/tabs";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

export type LiveTableTabSheetProps = {
  initialMesa?: string;
  negocioId?: string;
  tenantSlug?: string;
  storeName?: string;
};

const PREFERRED_METHODS: ReadonlyArray<{ id: PosPaymentMethod; label: string }> = [
  { id: "efectivo", label: "Efectivo" },
  { id: "nequi", label: "Nequi" },
  { id: "daviplata", label: "Daviplata" },
  { id: "qr", label: "QR" },
  { id: "mixto", label: "Mixto" },
];

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Recibida",
  confirmado: "Confirmada",
  preparando: "Preparando en barra",
  en_camino: "En camino a tu mesa",
  entregado: "Entregada",
  cancelado: "Cancelada",
};

const ORDER_STATUS_BADGE_STYLES: Record<OrderStatus, string> = {
  pendiente: "border-pink-500/40 bg-pink-500/15 text-pink-200",
  confirmado: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
  preparando: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  en_camino: "border-violet-500/40 bg-violet-500/15 text-violet-200",
  entregado: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  cancelado: "border-rose-500/40 bg-rose-500/15 text-rose-200",
};

function formatTimeShort(iso?: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

type StoredTenantContext = {
  negocioId?: string;
  tenantSlug?: string;
  storeName?: string;
};

function readMesaFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const storedType = window.sessionStorage.getItem(SERVICE_TYPE_STORAGE_KEY);
    const storedMesa = window.sessionStorage.getItem(SERVICE_MESA_STORAGE_KEY);
    if (storedType === "pickup" || !storedMesa || isPickupTableIdentifier(storedMesa)) {
      return null;
    }
    const canonical = canonicalizeTableNumber(storedMesa);
    return canonical || null;
  } catch {
    return null;
  }
}

function readTenantFromStorage(): StoredTenantContext {
  if (typeof window === "undefined") return {};
  try {
    const storedNegocioId = window.sessionStorage.getItem(SERVICE_NEGOCIO_ID_STORAGE_KEY)?.trim();
    const storedTenantSlug = window.sessionStorage.getItem(SERVICE_TENANT_SLUG_STORAGE_KEY)?.trim();
    const storedStoreName = window.sessionStorage.getItem(SERVICE_STORE_NAME_STORAGE_KEY)?.trim();
    return {
      ...(storedNegocioId ? { negocioId: storedNegocioId } : {}),
      ...(storedTenantSlug ? { tenantSlug: storedTenantSlug } : {}),
      ...(storedStoreName ? { storeName: storedStoreName } : {}),
    };
  } catch {
    return {};
  }
}

export function LiveTableTabSheet({
  initialMesa,
  negocioId,
  tenantSlug,
  storeName,
}: LiveTableTabSheetProps) {
  const { items, totalItems, totalPrice, updateQuantity, removeItem, clearCart, getCheckoutItems } =
    useCart();
  const auth = useOptionalAuthContext();

  const [activeMesa, setActiveMesa] = useState<string | null>(null);
  const [storedTenant, setStoredTenant] = useState<StoredTenantContext>({});
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<PublicTableTab | null>(null);
  const [loadingTab, setLoadingTab] = useState(false);
  const [submittingRound, setSubmittingRound] = useState(false);
  const [submittingBill, setSubmittingBill] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [roundNotes, setRoundNotes] = useState("");
  const [billSplitMode, setBillSplitMode] = useState<"single" | "equal">("single");
  const [billGuests, setBillGuests] = useState(2);
  const [preferredMethod, setPreferredMethod] = useState<PosPaymentMethod>("efectivo");

  const idempotencyKeyRef = useRef<string | null>(null);

  const effectiveNegocioId = negocioId?.trim() || storedTenant.negocioId || DEFAULT_TENANT_ID;
  const effectiveTenantSlug = tenantSlug?.trim() || storedTenant.tenantSlug;
  const effectiveStoreName = storeName?.trim() || storedTenant.storeName || "Coctels OPS";

  // Resolver mesa activa desde prop o sessionStorage y escuchar cambios de TableServiceBanner
  useEffect(() => {
    const rawInitial = initialMesa?.trim();
    if (rawInitial) {
      if (isPickupTableIdentifier(rawInitial)) {
        setActiveMesa(null);
      } else {
        const canonical = canonicalizeTableNumber(rawInitial);
        setActiveMesa(canonical || null);
      }
    } else {
      setActiveMesa(readMesaFromStorage());
    }
    setStoredTenant(readTenantFromStorage());

    const handleServiceChange = () => {
      setActiveMesa(readMesaFromStorage());
      setStoredTenant(readTenantFromStorage());
    };

    window.addEventListener(TABLE_SERVICE_CHANGE_EVENT, handleServiceChange);
    window.addEventListener("storage", handleServiceChange);
    return () => {
      window.removeEventListener(TABLE_SERVICE_CHANGE_EVENT, handleServiceChange);
      window.removeEventListener("storage", handleServiceChange);
    };
  }, [initialMesa]);

  // Sugerir nombre si el usuario tiene sesión activa
  useEffect(() => {
    const displayName = auth?.user?.displayName?.trim();
    if (displayName && !customerName) {
      setCustomerName(displayName);
    }
  }, [auth?.user?.displayName, customerName]);

  // Reiniciar idempotency key al variar la ronda en carrito o la mesa activa
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [items, activeMesa, roundNotes]);

  const buildApiUrl = useCallback(
    (mesa: string) => {
      const params = new URLSearchParams();
      if (effectiveNegocioId) {
        params.set("negocioId", effectiveNegocioId);
      }
      if (effectiveTenantSlug) {
        params.set("slug", effectiveTenantSlug);
      }
      const query = params.toString();
      return `/api/mesas/${encodeURIComponent(mesa)}${query ? `?${query}` : ""}`;
    },
    [effectiveNegocioId, effectiveTenantSlug],
  );

  const fetchTableTab = useCallback(
    async (silent = false) => {
      if (!activeMesa) return;
      if (!silent) setLoadingTab(true);
      try {
        const res = await fetch(buildApiUrl(activeMesa), { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          tab?: PublicTableTab | null;
          error?: string;
        };
        if (!res.ok) {
          if (!silent) {
            setFeedback({
              type: "err",
              message: data.error ?? "No se pudo consultar la cuenta de la mesa.",
            });
          }
          return;
        }
        setTab(data.tab ?? null);
        if (data.tab?.billRequest) {
          setBillSplitMode(data.tab.billRequest.splitMode);
          if (data.tab.billRequest.splitMode === "equal") {
            setBillGuests(Math.max(2, data.tab.billRequest.guestCount));
          }
          if (data.tab.billRequest.preferredMethod) {
            setPreferredMethod(data.tab.billRequest.preferredMethod);
          }
        }
      } catch {
        if (!silent) {
          setFeedback({
            type: "err",
            message: "Error de conexión al consultar tu cuenta en vivo.",
          });
        }
      } finally {
        if (!silent) setLoadingTab(false);
      }
    },
    [activeMesa, buildApiUrl],
  );

  useEffect(() => {
    if (!activeMesa) {
      setTab(null);
      setIsOpen(false);
      return;
    }
    void fetchTableTab(true);
  }, [activeMesa, fetchTableTab]);

  // Permitir apertura bajo demanda desde otros componentes (ej. /cart)
  useEffect(() => {
    if (!activeMesa) return;

    const handleOpenSheet = () => {
      setIsOpen(true);
      void fetchTableTab(false);
    };

    window.addEventListener(OPEN_LIVE_TABLE_TAB_EVENT, handleOpenSheet);
    return () => {
      window.removeEventListener(OPEN_LIVE_TABLE_TAB_EVENT, handleOpenSheet);
    };
  }, [activeMesa, fetchTableTab]);

  // Refresco periódico cada 15s mientras la hoja esté abierta y visible
  useEffect(() => {
    if (!activeMesa || !isOpen) return;

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void fetchTableTab(true);
    }, 15_000);

    return () => clearInterval(timer);
  }, [activeMesa, fetchTableTab, isOpen]);

  const equalShareAmount = useMemo(() => {
    if (!tab || tab.total <= 0) return 0;
    return calculateEqualSplitShares(tab.total, billGuests)[0] ?? 0;
  }, [billGuests, tab]);

  if (!activeMesa) {
    return null;
  }

  async function buildOptionalAuthHeader(): Promise<Record<string, string>> {
    const user = auth?.user;
    if (!user || typeof user.getIdToken !== "function") return {};
    try {
      const token = await user.getIdToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  async function handleSendRound() {
    if (!activeMesa || items.length === 0 || submittingRound) return;

    setSubmittingRound(true);
    setFeedback(null);

    try {
      idempotencyKeyRef.current ??=
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `qr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const authHeader = await buildOptionalAuthHeader();
      const res = await fetch(buildApiUrl(activeMesa), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKeyRef.current,
          ...authHeader,
        },
        body: JSON.stringify({
          action: "add_round",
          negocioId: effectiveNegocioId,
          ...(effectiveTenantSlug ? { slug: effectiveTenantSlug } : {}),
          items: getCheckoutItems(),
          ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
          ...(roundNotes.trim() ? { notes: roundNotes.trim() } : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        tab?: PublicTableTab;
        round?: { roundNumber: number };
        error?: string;
      };

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          idempotencyKeyRef.current = null;
        }
        setFeedback({
          type: "err",
          message: data.error ?? "No se pudo enviar tu ronda a la barra.",
        });
        return;
      }

      if (data.tab) {
        setTab(data.tab);
      }
      idempotencyKeyRef.current = null;
      setRoundNotes("");
      clearCart();
      setFeedback({
        type: "ok",
        message: `¡Ronda #${data.round?.roundNumber ?? 1} enviada a la barra! En minutos la preparamos.`,
      });
    } catch {
      setFeedback({
        type: "err",
        message: "No pudimos conectar con la barra. Toca de nuevo para reintentar.",
      });
    } finally {
      setSubmittingRound(false);
    }
  }

  async function handleRequestBill() {
    if (!activeMesa || !tab || tab.rounds.length === 0 || submittingBill) return;

    setSubmittingBill(true);
    setFeedback(null);

    try {
      const authHeader = await buildOptionalAuthHeader();
      const res = await fetch(buildApiUrl(activeMesa), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          action: "request_bill",
          negocioId: effectiveNegocioId,
          ...(effectiveTenantSlug ? { slug: effectiveTenantSlug } : {}),
          splitMode: billSplitMode,
          guestCount: billSplitMode === "equal" ? billGuests : Math.max(1, tab.guestCount),
          preferredMethod,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        tab?: PublicTableTab;
        error?: string;
      };

      if (!res.ok) {
        setFeedback({
          type: "err",
          message: data.error ?? "No se pudo solicitar la cuenta.",
        });
        return;
      }

      if (data.tab) {
        setTab(data.tab);
      }
      setFeedback({
        type: "ok",
        message:
          billSplitMode === "equal"
            ? `Cuenta solicitada dividida entre ${billGuests} personas (${formatCop(equalShareAmount)} c/u).`
            : "Cuenta solicitada. Nuestro equipo ya va hacia tu mesa.",
      });
    } catch {
      setFeedback({
        type: "err",
        message: "Error de conexión al solicitar la cuenta.",
      });
    } finally {
      setSubmittingBill(false);
    }
  }

  const barSummaryText = (() => {
    if (totalItems > 0 && tab) {
      return `${totalItems} por enviar · Cuenta: ${formatCop(tab.total)}`;
    }
    if (totalItems > 0) {
      return `${totalItems} ${totalItems === 1 ? "bebida" : "bebidas"} lista${totalItems === 1 ? "" : "s"} para pedir`;
    }
    if (tab?.billRequest) {
      return `Cuenta solicitada · ${formatCop(tab.total)}`;
    }
    if (tab) {
      return `${tab.rounds.length} ${tab.rounds.length === 1 ? "ronda" : "rondas"} · ${formatCop(tab.total)}`;
    }
    return "Toca para ver tu cuenta o pedir ronda";
  })();

  const statusBadge = tab?.billRequest
    ? { label: "Cuenta solicitada", className: "border-amber-400/50 bg-amber-500/20 text-amber-200" }
    : tab
    ? { label: "Cuenta abierta", className: "border-emerald-400/50 bg-emerald-500/20 text-emerald-200" }
    : { label: "Lista para pedir", className: "border-cyan-400/50 bg-cyan-500/20 text-cyan-200" };

  return (
    <>
      {/* Barra Flotante Sticky Mobile-First (sin colisionar con OpsyChat FAB a la derecha) */}
      <div
        data-testid="live-table-tab-bar"
        className="fixed bottom-5 left-4 right-24 sm:left-6 sm:right-auto sm:max-w-md z-40"
      >
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            void fetchTableTab(false);
          }}
          aria-label={`Abrir cuenta en vivo de ${activeMesa}`}
          className="w-full min-h-[52px] rounded-2xl border border-primary/45 bg-slate-950/90 px-4 py-2.5 text-left text-white backdrop-blur-xl shadow-[0_0_25px_rgba(229,25,110,0.3)] hover:border-primary/80 transition-all active:scale-[0.99] flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 border border-primary/40 text-primary">
              <UtensilsCrossed className="h-4 w-4" />
              <span
                aria-hidden="true"
                className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${
                  totalItems > 0 ? "bg-pink-500 motion-safe:animate-pulse" : "bg-emerald-400"
                }`}
              />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-white truncate">
                {tab?.tableNumber ?? activeMesa}
              </p>
              <p className="text-[11px] text-slate-300 truncate">{barSummaryText}</p>
            </div>
          </div>

          <span className="shrink-0 rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs font-extrabold text-pink-200">
            {totalItems > 0 ? "Pedir ronda" : tab ? formatCop(tab.total) : "Mi cuenta"}
          </span>
        </button>
      </div>

      {/* Sheet Inferior: Autopedido QR en Mesa + Cuenta en Vivo */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="bottom"
          aria-label={`Cuenta en vivo de ${tab?.tableNumber ?? activeMesa}`}
          className="bg-slate-950/95 border-t border-primary/30 text-white rounded-t-3xl max-h-[88vh] overflow-y-auto p-5 sm:p-6 backdrop-blur-xl"
        >
          <div className="mx-auto max-w-2xl space-y-5">
            <SheetHeader className="text-left pr-10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle className="text-xl font-headline font-black uppercase tracking-tight text-white">
                      {tab?.tableNumber ?? activeMesa}
                    </SheetTitle>
                    <Badge variant="outline" className={statusBadge.className}>
                      {statusBadge.label}
                    </Badge>
                  </div>
                  <SheetDescription className="text-xs text-slate-300">
                    {effectiveStoreName} · Autopedido directo a barra sin esperas
                  </SheetDescription>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void fetchTableTab(false)}
                  disabled={loadingTab}
                  aria-label="Actualizar cuenta de mesa"
                  className="min-h-[44px] min-w-[44px] rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingTab ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </SheetHeader>

            {feedback ? (
              <div
                role={feedback.type === "err" ? "alert" : "status"}
                className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
                  feedback.type === "ok"
                    ? "border-emerald-500/40 bg-emerald-950/70 text-emerald-200"
                    : "border-rose-500/40 bg-rose-950/70 text-rose-200"
                }`}
              >
                {feedback.message}
              </div>
            ) : null}

            {/* Sección 1: Ronda por Enviar desde el Carrito */}
            {items.length > 0 ? (
              <section
                aria-label="Ronda por enviar a barra"
                className="rounded-2xl border border-primary/40 bg-card/60 p-4 space-y-3 shadow-[0_0_24px_rgba(229,25,110,0.16)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Ronda por enviar ({totalItems})
                  </h3>
                  <span className="text-sm font-black text-white">{formatCop(totalPrice)}</span>
                </div>

                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{item.name}</p>
                        <p className="text-xs text-slate-300">
                          {item.customization.size}
                          {item.customization.flavors.length > 0
                            ? ` · ${item.customization.flavors.join(", ")}`
                            : ""}
                          {item.customization.addOns.length > 0
                            ? ` · +${item.customization.addOns.join(", ")}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2">
                        <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 p-0.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            aria-label={`Disminuir cantidad de ${item.name}`}
                            className="min-h-[44px] min-w-[44px] rounded-full text-white hover:bg-white/10"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="min-w-[24px] text-center text-xs font-bold">
                            {item.quantity}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            aria-label={`Aumentar cantidad de ${item.name}`}
                            className="min-h-[44px] min-w-[44px] rounded-full text-white hover:bg-white/10"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <span className="min-w-[72px] text-right text-xs font-extrabold text-pink-300">
                          {formatCop(item.price * item.quantity)}
                        </span>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Quitar ${item.name} de la ronda`}
                          className="min-h-[44px] min-w-[44px] rounded-full text-rose-300 hover:bg-rose-500/15"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {!tab?.customerName ? (
                    <div className="space-y-1">
                      <Label htmlFor="live-tab-customer-name" className="text-[11px] text-slate-300">
                        Tu nombre o grupo (opcional)
                      </Label>
                      <Input
                        id="live-tab-customer-name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej: Mesa de Laura"
                        maxLength={80}
                        className="min-h-[44px] bg-slate-900 border-white/15 text-white placeholder:text-slate-400"
                      />
                    </div>
                  ) : null}

                  <div className={`space-y-1 ${tab?.customerName ? "sm:col-span-2" : ""}`}>
                    <Label htmlFor="live-tab-round-notes" className="text-[11px] text-slate-300">
                      Nota para barra (opcional)
                    </Label>
                    <Input
                      id="live-tab-round-notes"
                      value={roundNotes}
                      onChange={(e) => setRoundNotes(e.target.value)}
                      placeholder="Ej: Sin pitillo, poco hielo"
                      maxLength={240}
                      className="min-h-[44px] bg-slate-900 border-white/15 text-white placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  disabled={submittingRound}
                  onClick={() => void handleSendRound()}
                  className="min-h-[48px] w-full rounded-full bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-wider text-xs sm:text-sm neon-shadow-magenta active:scale-95 transition-all"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {submittingRound
                    ? "Enviando ronda a barra..."
                    : `Enviar ronda a barra · ${formatCop(totalPrice)}`}
                </Button>
              </section>
            ) : null}

            {/* Sección 2: Cuenta Acumulada en Vivo */}
            <section aria-label="Cuenta acumulada de la mesa" className="space-y-3">
              <div className="grid grid-cols-3 gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Acumulado</p>
                  <p className="text-lg sm:text-xl font-black text-white">
                    {formatCop(tab?.total ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Rondas</p>
                  <p className="text-lg sm:text-xl font-black text-cyan-300">
                    {tab?.rounds.length ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Bebidas</p>
                  <p className="text-lg sm:text-xl font-black text-pink-300">
                    {tab?.itemsCount ?? 0}
                  </p>
                </div>
              </div>

              {!tab || tab.rounds.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-center text-xs text-slate-300">
                  Aún no hay rondas enviadas en {activeMesa}. Agrega bebidas de la carta y envíalas
                  directo a la barra sin hacer fila ni verificar correo.
                </div>
              ) : (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-cyan-400" />
                    Historial de rondas en vivo
                  </h3>

                  <div className="space-y-2.5">
                    {tab.rounds.map((round) => {
                      const status = round.orderStatus ?? "pendiente";
                      return (
                        <div
                          key={`${tab.id}-round-${round.roundNumber}`}
                          className="rounded-xl border border-white/10 bg-black/50 p-3.5 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-white">
                              <span>Ronda #{round.roundNumber}</span>
                              <span className="inline-flex items-center gap-1 text-slate-400 font-normal">
                                <Clock className="h-3 w-3" />
                                {formatTimeShort(round.createdAt)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={ORDER_STATUS_BADGE_STYLES[status]}
                              >
                                {ORDER_STATUS_LABELS[status]}
                              </Badge>
                              <span className="text-xs font-extrabold text-white">
                                {formatCop(round.subtotal)}
                              </span>
                            </div>
                          </div>

                          <ul className="space-y-1 text-xs text-slate-300">
                            {round.items.map((item, idx) => (
                              <li key={`${round.orderId}-item-${idx}`} className="flex justify-between gap-2">
                                <span>
                                  {item.quantity}x {item.name} ({item.customization.size})
                                </span>
                                <span className="text-slate-400">{formatCop(item.subtotal)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Sección 3: Pedir la Cuenta o Dividir en 1 Tap */}
            {tab && tab.rounds.length > 0 && tab.total > 0 ? (
              <section
                aria-label="Solicitar cuenta o dividir"
                className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Pedir la cuenta
                  </h3>
                  {tab.billRequest ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Solicitada {formatTimeShort(tab.billRequest.requestedAt)}
                    </span>
                  ) : null}
                </div>

                {tab.billRequest ? (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2.5 text-xs text-amber-100">
                    {tab.billRequest.splitMode === "equal"
                      ? `División solicitada entre ${tab.billRequest.guestCount} personas (${formatCop(
                          tab.billRequest.perPersonAmount ?? equalShareAmount,
                        )} c/u)`
                      : `Pago completo solicitado (${formatCop(tab.total)})`}
                    {tab.billRequest.preferredMethod
                      ? ` · Medio: ${POS_PAYMENT_METHOD_LABELS[tab.billRequest.preferredMethod]}`
                      : ""}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={billSplitMode === "single" ? "default" : "outline"}
                    onClick={() => setBillSplitMode("single")}
                    className={`min-h-[44px] text-xs font-bold ${
                      billSplitMode === "single"
                        ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                        : "border-white/15 bg-black/40 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    Pagar todo junto
                  </Button>
                  <Button
                    type="button"
                    variant={billSplitMode === "equal" ? "default" : "outline"}
                    onClick={() => {
                      setBillSplitMode("equal");
                      setBillGuests((prev) => Math.max(2, prev));
                    }}
                    className={`min-h-[44px] text-xs font-bold ${
                      billSplitMode === "equal"
                        ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                        : "border-white/15 bg-black/40 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <Split className="mr-1.5 h-3.5 w-3.5" />
                    Dividir cuenta
                  </Button>
                </div>

                {billSplitMode === "equal" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-200">
                      <Users className="h-4 w-4 text-cyan-300" />
                      <span>Dividir entre:</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setBillGuests((prev) => Math.max(2, prev - 1))}
                        aria-label="Disminuir personas"
                        className="min-h-[44px] min-w-[44px] rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="min-w-[84px] text-center text-xs font-bold text-white">
                        {billGuests} personas
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setBillGuests((prev) => Math.min(20, prev + 1))}
                        aria-label="Aumentar personas"
                        className="min-h-[44px] min-w-[44px] rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <p className="w-full text-xs font-bold text-cyan-200">
                      Total por persona: {formatCop(equalShareAmount)}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    Medio de pago preferido
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PREFERRED_METHODS.map((method) => (
                      <Button
                        key={method.id}
                        type="button"
                        size="sm"
                        variant={preferredMethod === method.id ? "default" : "outline"}
                        onClick={() => setPreferredMethod(method.id)}
                        className={`min-h-[44px] rounded-full px-3.5 text-xs font-bold ${
                          preferredMethod === method.id
                            ? "bg-primary text-white"
                            : "border-white/15 bg-black/40 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        {method.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  disabled={submittingBill}
                  onClick={() => void handleRequestBill()}
                  className="min-h-[48px] w-full rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold uppercase tracking-wider text-xs sm:text-sm active:scale-95 transition-all"
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  {submittingBill
                    ? "Notificando a barra..."
                    : tab.billRequest
                    ? "Actualizar solicitud de cuenta"
                    : "Solicitar cuenta a la mesa"}
                </Button>
              </section>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default LiveTableTabSheet;
