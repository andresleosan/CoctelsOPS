"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getEffectivePaymentVerificationStatus } from "@/lib/orders/payment-verification";
import {
  PAYMENT_GATEWAY_STATUS_META,
  formatGatewayProviderName,
  isSafeGatewayCheckoutUrl,
  navigateToExternalUrl,
} from "@/lib/payments/client";
import type {
  OnlinePaymentGatewayOption,
  Order,
  PaymentCheckoutSession,
  PaymentGatewayProvider,
} from "@/types/orders";

export type OnlinePaymentGatewayCardProps = {
  order: Pick<
    Order,
    | "id"
    | "total"
    | "status"
    | "paymentVerificationStatus"
    | "paymentVerification"
    | "paymentGateway"
  >;
  gateways: OnlinePaymentGatewayOption[];
  getIdToken: () => Promise<string>;
  paymentReturnProvider?: PaymentGatewayProvider | null;
  paymentInitError?: boolean;
  isRefreshingStatus?: boolean;
  onRefreshStatus?: () => void | Promise<void>;
  onRedirect?: (url: string) => void;
};

export function OnlinePaymentGatewayCard({
  order,
  gateways,
  getIdToken,
  paymentReturnProvider = null,
  paymentInitError = false,
  isRefreshingStatus = false,
  onRefreshStatus,
  onRedirect,
}: OnlinePaymentGatewayCardProps) {
  const [selectedProvider, setSelectedProvider] = useState<PaymentGatewayProvider>(
    () => gateways[0]?.provider ?? order.paymentGateway?.provider ?? "wompi",
  );
  const [initiating, setInitiating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (gateways.length === 0) return;
    if (!gateways.some((gateway) => gateway.provider === selectedProvider)) {
      setSelectedProvider(gateways[0].provider);
    }
  }, [gateways, selectedProvider]);

  const verificationStatus = getEffectivePaymentVerificationStatus(order);
  const isTerminalOrder = order.status === "cancelado" || order.status === "entregado";
  const canPayOnline =
    !isTerminalOrder && verificationStatus !== "verificado" && gateways.length > 0;

  const returnProviderLabel = paymentReturnProvider
    ? formatGatewayProviderName(paymentReturnProvider)
    : null;
  const gatewayMeta = order.paymentGateway
    ? PAYMENT_GATEWAY_STATUS_META[order.paymentGateway.status]
    : null;
  const activeGatewayOption =
    gateways.find((gateway) => gateway.provider === selectedProvider) ?? gateways[0];

  const handleStartOnlinePayment = async () => {
    if (!activeGatewayOption || initiating) return;
    setInitiating(true);
    setErrorMessage("");

    try {
      const token = await getIdToken();
      const response = await fetch("/api/payments/checkout-session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderId: order.id,
          provider: activeGatewayOption.provider,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        session?: PaymentCheckoutSession;
        error?: string;
      };

      if (!response.ok || !data.session?.checkoutUrl) {
        throw new Error(
          data.error ?? "No pudimos iniciar la sesión con la pasarela de pagos.",
        );
      }

      if (!isSafeGatewayCheckoutUrl(data.session.checkoutUrl)) {
        throw new Error(
          "La URL de pago recibida no pertenece a una pasarela autorizada.",
        );
      }

      if (onRedirect) {
        onRedirect(data.session.checkoutUrl);
      } else {
        navigateToExternalUrl(data.session.checkoutUrl);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error de conexión al iniciar el pago online.",
      );
    } finally {
      setInitiating(false);
    }
  };

  return (
    <Card
      data-testid="online-payment-gateway-card"
      className="overflow-hidden border border-slate-200 bg-white text-left shadow-lg"
    >
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
            Pago Online Instantáneo
          </h3>

          {order.paymentGateway && gatewayMeta ? (
            <Badge variant="outline" className={gatewayMeta.badgeClass}>
              {formatGatewayProviderName(order.paymentGateway.provider)} · {gatewayMeta.label}
            </Badge>
          ) : activeGatewayOption?.mode === "test" ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-950 font-semibold"
            >
              Modo pruebas
            </Badge>
          ) : null}
        </div>

        {paymentReturnProvider && verificationStatus === "verificado" && (
          <div
            role="status"
            data-testid="gateway-return-verified"
            className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-950"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>
              ¡Pago confirmado por {returnProviderLabel}! Tu pedido ya quedó verificado en barra.
            </span>
          </div>
        )}

        {paymentReturnProvider && verificationStatus === "rechazado" && (
          <div
            role="alert"
            data-testid="gateway-return-rejected"
            className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-950"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
            <span>
              {returnProviderLabel} reportó que el pago no fue aprobado. Puedes intentar de nuevo o subir un comprobante manual.
            </span>
          </div>
        )}

        {paymentReturnProvider &&
          verificationStatus !== "verificado" &&
          verificationStatus !== "rechazado" && (
            <div
              role="status"
              data-testid="gateway-return-pending"
              className="space-y-2.5 rounded-xl border border-cyan-300 bg-cyan-50 p-3.5 text-xs text-cyan-950"
            >
              <p className="font-semibold">
                Volviste desde {returnProviderLabel}. Estamos esperando la confirmación automática del pago (puede tardar unos segundos).
              </p>
              {onRefreshStatus && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRefreshingStatus}
                  onClick={() => void onRefreshStatus()}
                  className="min-h-[44px] gap-1.5 border-cyan-600 bg-white px-3.5 text-xs font-bold text-cyan-950 hover:bg-cyan-100"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isRefreshingStatus ? "animate-spin motion-reduce:animate-none" : ""}`}
                    aria-hidden="true"
                  />
                  {isRefreshingStatus ? "Consultando..." : "Verificar estado ahora"}
                </Button>
              )}
            </div>
          )}

        {paymentInitError && verificationStatus !== "verificado" && (
          <div
            role="alert"
            data-testid="gateway-init-error-banner"
            className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <span>
              Tu pedido quedó guardado, pero no pudimos abrir la pasarela automáticamente. Puedes reintentar aquí en 1 tap.
            </span>
          </div>
        )}

        {errorMessage && (
          <p role="alert" className="text-xs font-semibold text-rose-700">
            {errorMessage}
          </p>
        )}

        {canPayOnline && activeGatewayOption && (
          <div className="space-y-3">
            {gateways.length > 1 && (
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label="Seleccionar pasarela de pago online"
              >
                {gateways.map((gateway) => {
                  const selected = gateway.provider === activeGatewayOption.provider;
                  return (
                    <button
                      key={gateway.provider}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedProvider(gateway.provider);
                        setErrorMessage("");
                      }}
                      className={`min-h-[48px] rounded-xl border px-3 py-2 text-left transition-all active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                        selected
                          ? "border-primary bg-primary/10 text-slate-950 font-bold"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className="block text-xs font-bold">{gateway.label}</span>
                      <span className="block text-[11px] text-slate-600">{gateway.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <Button
              type="button"
              data-testid="btn-pay-online-gateway"
              disabled={initiating}
              onClick={() => void handleStartOnlinePayment()}
              className="min-h-[48px] w-full gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-md transition-all hover:bg-primary/90 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {initiating
                ? `Abriendo ${activeGatewayOption.label}...`
                : verificationStatus === "rechazado"
                  ? `Reintentar pago ($${Math.round(order.total).toLocaleString("es-CO")}) con ${activeGatewayOption.label}`
                  : `Pagar $${Math.round(order.total).toLocaleString("es-CO")} con ${activeGatewayOption.label}`}
            </Button>

            <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
              Monto verificado y firmado en servidor. Confirmación automática al completar el pago.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
