import type { PaymentGatewayProvider, PaymentGatewayStatus } from "@/types/orders";

export const ALLOWED_GATEWAY_HOSTS: ReadonlySet<string> = new Set([
  "checkout.wompi.co",
  "checkout.bold.co",
]);

export function isSafeGatewayCheckoutUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && ALLOWED_GATEWAY_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function formatGatewayProviderName(provider: PaymentGatewayProvider): string {
  return provider === "wompi" ? "Wompi" : "Bold";
}

export type PaymentGatewayStatusMeta = {
  label: string;
  badgeClass: string;
};

export const PAYMENT_GATEWAY_STATUS_META: Record<PaymentGatewayStatus, PaymentGatewayStatusMeta> = {
  approved: {
    label: "Pago aprobado",
    badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-950 font-semibold",
  },
  pending: {
    label: "Pago en proceso",
    badgeClass: "border-cyan-300 bg-cyan-50 text-cyan-950 font-semibold",
  },
  declined: {
    label: "Pago rechazado",
    badgeClass: "border-rose-300 bg-rose-50 text-rose-950 font-semibold",
  },
  voided: {
    label: "Pago anulado",
    badgeClass: "border-amber-300 bg-amber-50 text-amber-950 font-semibold",
  },
  error: {
    label: "Error de pago",
    badgeClass: "border-rose-300 bg-rose-50 text-rose-950 font-semibold",
  },
};

export function navigateToExternalUrl(url: string): void {
  if (typeof window !== "undefined") {
    window.location.assign(url);
  }
}
