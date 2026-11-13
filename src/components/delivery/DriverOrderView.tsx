"use client";

import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Flame,
  MapPin,
  MessageCircle,
  MessageSquareWarning,
  Navigation,
  PackageCheck,
  Phone,
  Smartphone,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderSlaStatus, type SlaLevel } from "@/lib/orders/kds-sla";
import type { Order } from "@/types/orders";

export type PaymentMethod = "efectivo" | "transferencia" | "datafono";

export type DriverDeliveryConfirmation = {
  paymentCollected: boolean;
  paymentMethod: PaymentMethod;
  notes?: string;
};

export type DriverOrderViewProps = {
  order: Order;
  nowMs?: number;
  updating?: boolean;
  error?: string;
  onConfirmDelivery: (confirmation: DriverDeliveryConfirmation) => void | Promise<void>;
  onStartRoute?: () => void | Promise<void>;
};

const SLA_BADGE_STYLES: Record<SlaLevel, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  critical: "border-red-500/50 bg-red-500/20 text-red-200 font-bold",
  completed: "border-slate-600 bg-slate-800 text-slate-300",
};

const PAYMENT_METHODS: ReadonlyArray<{
  id: PaymentMethod;
  label: string;
  description: string;
  icon: typeof Banknote;
}> = [
  { id: "efectivo", label: "Efectivo", description: "Pago contraentrega", icon: Banknote },
  { id: "transferencia", label: "Transferencia", description: "Nequi / Bancolombia", icon: Smartphone },
  { id: "datafono", label: "Datáfono", description: "Tarjeta débito/crédito", icon: CreditCard },
];

function appendMedellinContext(address: string): string {
  const trimmed = address.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes("medellin") || lower.includes("medellín") || lower.includes("colombia")) {
    return trimmed;
  }
  return `${trimmed}, Medellín, Colombia`;
}

/** Normaliza un teléfono de contacto para enlazar directamente al marcador del dispositivo. */
export function buildDriverCallHref(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return `tel:${hasPlus ? `+${digits}` : digits}`;
}

/** Construye un enlace de WhatsApp con mensaje prellenado para avisar al cliente que el domiciliario va en ruta. */
export function buildDriverWhatsAppHref(
  order: Pick<Order, "id" | "customerName" | "address" | "total">,
  phone: string,
): string {
  const digits = phone.replace(/\D/g, "");
  const normalizedPhone = digits.length === 10 && digits.startsWith("3") ? `57${digits}` : digits;
  const shortId = order.id.slice(0, 8);
  const formattedTotal = order.total.toLocaleString("es-CO");
  const message = `¡Hola ${order.customerName}! 🛵 Soy el repartidor de Coctels OPS con tu pedido #${shortId} por $${formattedTotal} COP hacia ${order.address}. ¡Ya voy en camino!`;

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

/** Genera la URL de navegación en Google Maps asegurando contexto geográfico de Medellín. */
export function buildGoogleMapsHref(address: string): string {
  const query = appendMedellinContext(address);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Genera el deep link de navegación turn-by-turn en Waze asegurando contexto de Medellín. */
export function buildWazeHref(address: string): string {
  const query = appendMedellinContext(address);
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

/**
 * Vista móvil operativa para el repartidor en ruta.
 * Diseñada para interacción rápida con una sola mano y botones táctiles >= 48px.
 */
export function DriverOrderView({
  order,
  nowMs = Date.now(),
  updating = false,
  error,
  onConfirmDelivery,
  onStartRoute,
}: DriverOrderViewProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [paymentCollected, setPaymentCollected] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const sla = getOrderSlaStatus(order.createdAt, order.status, nowMs);
  const totalCups = order.items.reduce((acc, item) => acc + item.quantity, 0);
  const formattedTotal = order.total.toLocaleString("es-CO");
  const isDelivered = order.status === "entregado";
  const isCanceled = order.status === "cancelado";
  const isActive = !isDelivered && !isCanceled;

  async function handleCopyAddress() {
    try {
      await navigator.clipboard?.writeText(order.address);
      setCopiedAddress(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedAddress(false);
      }, 2000);
    } catch {
      // Clipboard API may be unavailable in restricted contexts.
    }
  }

  return (
    <div
      data-testid="driver-order-view"
      className="mx-auto w-full max-w-xl space-y-4 rounded-2xl bg-slate-950 p-4 text-slate-50 shadow-2xl ring-1 ring-white/10 sm:p-6"
    >
      {/* Cabecera del Pedido */}
      <Card className="border-white/10 bg-slate-900/90 text-slate-50 backdrop-blur-xl">
        <CardHeader className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge className="border border-[#E5196E]/50 bg-[#E5196E]/20 px-2.5 py-1 text-xs font-extrabold tracking-wider text-pink-200 uppercase">
              🛵 MODO REPARTIDOR
            </Badge>
            <Badge
              variant="outline"
              data-testid="driver-order-sla"
              className={`inline-flex items-center gap-1.5 text-xs ${SLA_BADGE_STYLES[sla.level]}`}
            >
              {sla.level === "critical" ? (
                <Flame className="h-3.5 w-3.5 text-red-400" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {sla.label}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-cyan-400 uppercase">
                Pedido #{order.id}
              </p>
              <CardTitle className="mt-0.5 font-headline text-2xl font-black tracking-tight text-white">
                {order.customerName}
              </CardTitle>
              <p className="mt-0.5 text-sm font-medium text-slate-300">{order.phone}</p>
            </div>
            <Badge
              variant="outline"
              data-testid="driver-order-status"
              className="border-cyan-400/40 bg-cyan-500/15 px-3 py-1 text-xs font-bold text-cyan-200 uppercase"
            >
              {order.status.replace("_", " ")}
            </Badge>
          </div>

          {/* Acciones de Contacto 1-Tap */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Button
              asChild
              className="min-h-12 w-full bg-cyan-500 font-bold text-slate-950 transition-all hover:bg-cyan-400 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <a data-testid="btn-driver-call" href={buildDriverCallHref(order.phone)}>
                <Phone className="h-4 w-4" /> Llamar Cliente
              </a>
            </Button>

            <Button
              asChild
              className="min-h-12 w-full bg-emerald-500 font-bold text-slate-950 transition-all hover:bg-emerald-400 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <a
                data-testid="btn-driver-whatsapp"
                href={buildDriverWhatsAppHref(order, order.phone)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp Cliente
              </a>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Tarjeta de Destino y Navegación GPS */}
      <Card className="border-white/10 bg-slate-900/90 text-slate-50 backdrop-blur-xl">
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold tracking-wide text-cyan-300 uppercase">
              <MapPin className="h-4 w-4 text-[#00BCD4]" /> Destino de Entrega
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="btn-copy-address"
              onClick={() => void handleCopyAddress()}
              className="min-h-11 border-white/15 bg-slate-800/80 text-xs font-semibold text-slate-100 hover:bg-slate-700 hover:text-white active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              {copiedAddress ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> ¡Dirección copiada!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copiar dirección
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-2 sm:p-5 sm:pt-2">
          <p
            data-testid="driver-delivery-address"
            className="rounded-xl border border-white/10 bg-black/50 p-3.5 text-base font-bold leading-snug text-white"
          >
            {order.address}
          </p>

          {order.notes && (
            <div
              data-testid="driver-delivery-notes"
              className="flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-500/15 p-3 text-sm text-amber-100"
            >
              <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-extrabold tracking-wide text-amber-300 uppercase">
                  Notas del cliente
                </p>
                <p className="mt-0.5 leading-snug">{order.notes}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Button
              asChild
              variant="outline"
              className="min-h-12 w-full border-cyan-400/40 bg-cyan-950/50 font-bold text-cyan-200 transition-all hover:bg-cyan-900/70 hover:text-white active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <a
                data-testid="btn-gps-waze"
                href={buildWazeHref(order.address)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation className="h-4 w-4" /> Abrir en Waze
              </a>
            </Button>

            <Button
              asChild
              variant="outline"
              className="min-h-12 w-full border-purple-400/40 bg-purple-950/50 font-bold text-purple-200 transition-all hover:bg-purple-900/70 hover:text-white active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <a
                data-testid="btn-gps-gmaps"
                href={buildGoogleMapsHref(order.address)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-4 w-4" /> Google Maps
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumen de Paquete / Verificación de Bebidas */}
      <Card className="border-white/10 bg-slate-900/90 text-slate-50 backdrop-blur-xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold tracking-wide text-pink-300 uppercase">
            <PackageCheck className="h-4 w-4 text-[#E5196E]" /> Verificación de Bebidas
          </CardTitle>
          <Badge className="border border-white/15 bg-slate-800 text-xs font-bold text-white">
            {totalCups} {totalCups === 1 ? "vaso" : "vasos"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2.5 p-4 pt-2 sm:p-5 sm:pt-2">
          {order.items.map((item, idx) => (
            <div
              key={`${item.productId}-${idx}`}
              className="rounded-xl border border-white/10 bg-black/40 p-3 text-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-white">
                  {item.quantity}x {item.name}
                </span>
                <span className="rounded-md border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 text-xs font-bold text-cyan-200">
                  {item.customization.size}
                </span>
              </div>
              {item.customization.flavors.length > 0 && (
                <p className="mt-1 text-xs text-slate-300">
                  <strong className="text-slate-100">Sabores:</strong>{" "}
                  {item.customization.flavors.join(", ")}
                </p>
              )}
              {item.customization.addOns.length > 0 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-pink-300">
                  <Sparkles className="h-3 w-3 shrink-0 text-[#E5196E]" />
                  <span>
                    <strong>Adiciones:</strong> {item.customization.addOns.join(", ")}
                  </span>
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Confirmación de Cobro y Entrega */}
      <Card className="border-[#E5196E]/30 bg-slate-900/95 text-slate-50 shadow-[0_0_25px_rgba(229,25,110,0.12)] backdrop-blur-xl">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              Total a cobrar
            </span>
            <span
              data-testid="driver-order-total"
              className="font-headline text-2xl font-black tracking-tight text-[#00BCD4]"
            >
              ${formattedTotal} COP
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/40 bg-red-950/70 p-3 text-sm font-medium text-red-200"
            >
              {error}
            </div>
          )}

          {isDelivered && (
            <div
              data-testid="driver-delivered-banner"
              className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-emerald-200"
            >
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
              <div>
                <p className="font-bold text-white">¡Pedido Entregado Exitosamente!</p>
                <p className="text-xs text-emerald-200/90">
                  El cobro y la entrega quedaron registrados en el sistema.
                </p>
              </div>
            </div>
          )}

          {isCanceled && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-950/50 p-4 text-red-200">
              <XCircle className="h-6 w-6 shrink-0 text-red-400" />
              <p className="text-sm font-semibold">Este pedido fue cancelado y no requiere entrega.</p>
            </div>
          )}

          {isActive && (
            <div className="space-y-4">
              {order.status !== "en_camino" && onStartRoute && (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="btn-start-route"
                  disabled={updating}
                  onClick={() => void onStartRoute()}
                  className="min-h-12 w-full border-cyan-400/50 bg-cyan-500/15 font-bold text-cyan-200 transition-all hover:bg-cyan-500/25 hover:text-white active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  🛵 Marcar En Camino
                </Button>
              )}

              <div className="space-y-2">
                <p className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                  Método de cobro recibido
                </p>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Método de pago">
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = method.icon;
                    const selected = paymentMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        data-testid={`payment-method-${method.id}`}
                        aria-pressed={selected}
                        onClick={() => setPaymentMethod(method.id)}
                        className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center transition-all active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                          selected
                            ? "border-[#E5196E] bg-[#E5196E]/20 text-white shadow-[0_0_15px_rgba(229,25,110,0.35)]"
                            : "border-white/10 bg-slate-800/60 text-slate-300 hover:border-white/25 hover:text-white"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${selected ? "text-[#E5196E]" : "text-slate-400"}`} />
                        <span className="text-xs font-bold">{method.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-white/15 bg-black/50 p-3.5 transition-colors hover:border-cyan-400/40">
                <input
                  type="checkbox"
                  data-testid="checkbox-payment-collected"
                  checked={paymentCollected}
                  onChange={(event) => setPaymentCollected(event.target.checked)}
                  className="h-5 w-5 shrink-0 rounded border-slate-500 accent-[#E5196E]"
                />
                <span className="text-sm font-medium text-slate-100">
                  Confirmo haber recibido el cobro completo de{" "}
                  <strong className="text-white">${formattedTotal} COP</strong>
                </span>
              </label>

              <Button
                type="button"
                data-testid="btn-confirm-delivery"
                disabled={!paymentCollected || updating}
                onClick={() =>
                  void onConfirmDelivery({
                    paymentCollected: true,
                    paymentMethod,
                  })
                }
                className="min-h-14 w-full bg-[#E5196E] text-base font-black tracking-wide text-white uppercase shadow-[0_0_24px_rgba(229,25,110,0.45)] transition-all hover:bg-[#d11563] active:scale-95 disabled:opacity-45 disabled:shadow-none motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <CheckCircle2 className="h-5 w-5" />
                {updating ? "Confirmando entrega..." : "Confirmar Cobro y Entregado"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
