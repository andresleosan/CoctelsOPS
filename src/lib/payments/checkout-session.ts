import "server-only";

import { createHash } from "node:crypto";

import { createAuditEntry } from "@/lib/firestore/audit";
import { getOrderForOnlinePayment } from "@/lib/firestore/orders";
import { getEffectivePaymentVerificationStatus } from "@/lib/orders/payment-verification";
import type { VerifiedUser } from "@/types/auth";
import type {
  OnlinePaymentGatewayOption,
  Order,
  PaymentCheckoutSession,
  PaymentGatewayProvider,
} from "@/types/orders";

export class PaymentCheckoutSessionError extends Error {
  readonly status: 409 | 422 | 503;

  constructor(status: 409 | 422 | 503, message: string) {
    super(message);
    this.name = "PaymentCheckoutSessionError";
    this.status = status;
  }
}

type WompiCredentials = {
  provider: "wompi";
  publicKey: string;
  integritySecret: string;
  mode: "test" | "live";
};

type BoldCredentials = {
  provider: "bold";
  apiKey: string;
  secretKey: string;
  mode: "test" | "live";
};

const SAFE_ORDER_ID_REGEX = /^[A-Za-z0-9_-]{1,100}$/;

function resolveWompiCredentials(): WompiCredentials | null {
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim() ?? "";
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim() ?? "";
  if (!publicKey || !integritySecret) return null;
  const mode: "test" | "live" = publicKey.startsWith("pub_test_") ? "test" : "live";
  return { provider: "wompi", publicKey, integritySecret, mode };
}

function resolveBoldCredentials(): BoldCredentials | null {
  const apiKey = process.env.BOLD_API_KEY?.trim() ?? "";
  const secretKey = process.env.BOLD_SECRET_KEY?.trim() ?? "";
  if (!apiKey || !secretKey) return null;
  const mode: "test" | "live" =
    apiKey.toLowerCase().startsWith("test_") || process.env.BOLD_SANDBOX?.trim() === "true"
      ? "test"
      : "live";
  return { provider: "bold", apiKey, secretKey, mode };
}

export function getConfiguredPaymentGateways(): OnlinePaymentGatewayOption[] {
  const options: OnlinePaymentGatewayOption[] = [];
  const wompi = resolveWompiCredentials();
  if (wompi) {
    options.push({
      provider: "wompi",
      label: "Wompi",
      subtitle: "Tarjeta, PSE, Nequi o Bancolombia",
      mode: wompi.mode,
    });
  }
  const bold = resolveBoldCredentials();
  if (bold) {
    options.push({
      provider: "bold",
      label: "Bold",
      subtitle: "Tarjeta, PSE o botón Bancolombia",
      mode: bold.mode,
    });
  }
  return options;
}

export function buildOrderPaymentReference(orderId: string): string {
  const cleanId = orderId.trim();
  if (!SAFE_ORDER_ID_REGEX.test(cleanId)) {
    throw new PaymentCheckoutSessionError(422, "El identificador del pedido no es válido");
  }
  return `COCTELS:${cleanId}`;
}

export function computeWompiIntegritySignature(input: {
  reference: string;
  amountInCents: number;
  currency: "COP";
  integritySecret: string;
}): string {
  const raw = `${input.reference}${input.amountInCents}${input.currency}${input.integritySecret}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function computeBoldIntegritySignature(input: {
  reference: string;
  amountCop: number;
  currency: "COP";
  secretKey: string;
}): string {
  const raw = `${input.reference}${input.amountCop}${input.currency}${input.secretKey}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function isLoopbackHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1";
}

export function resolveSafeRedirectOrigin(request: Request): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) {
    try {
      const parsed = new URL(configuredAppUrl);
      if (parsed.protocol === "https:" || (parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname))) {
        return parsed.origin;
      }
    } catch {
      // Fallback a request.url
    }
  }

  try {
    const parsedRequest = new URL(request.url);
    if (
      parsedRequest.protocol === "https:" ||
      (parsedRequest.protocol === "http:" && isLoopbackHostname(parsedRequest.hostname))
    ) {
      return parsedRequest.origin;
    }
  } catch {
    // Fallback controlado abajo
  }

  throw new PaymentCheckoutSessionError(
    503,
    "No fue posible determinar una URL de retorno segura para la pasarela",
  );
}

function sanitizeDescription(order: Order): string {
  const shortId = order.id.slice(0, 8);
  const itemsCount = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0)
    : 0;
  const base =
    itemsCount > 0
      ? `Pedido Coctels OPS #${shortId} (${itemsCount} ${itemsCount === 1 ? "bebida" : "bebidas"})`
      : `Pedido Coctels OPS #${shortId}`;
  return base.slice(0, 120);
}

export function buildSignedCheckoutSession(input: {
  order: Order;
  provider: PaymentGatewayProvider;
  redirectOrigin: string;
}): PaymentCheckoutSession {
  const { order, provider, redirectOrigin } = input;

  if (order.status === "cancelado" || order.status === "entregado") {
    throw new PaymentCheckoutSessionError(
      422,
      order.status === "cancelado"
        ? "No se puede iniciar un pago para un pedido cancelado"
        : "Este pedido ya fue entregado",
    );
  }

  if (getEffectivePaymentVerificationStatus(order) === "verificado") {
    throw new PaymentCheckoutSessionError(409, "El pago de este pedido ya fue verificado");
  }

  const amountCop = Math.round(order.total);
  if (!Number.isFinite(amountCop) || amountCop <= 0) {
    throw new PaymentCheckoutSessionError(422, "El total del pedido debe ser mayor a $0 COP");
  }

  const amountInCents = amountCop * 100;
  const reference = buildOrderPaymentReference(order.id);
  const cleanOrigin = redirectOrigin.replace(/\/+$/, "");
  const redirectUrl = `${cleanOrigin}/order-status/${encodeURIComponent(order.id)}?paymentReturn=1&provider=${provider}&reference=${encodeURIComponent(reference)}`;
  const description = sanitizeDescription(order);
  const createdAt = new Date().toISOString();

  if (provider === "wompi") {
    const credentials = resolveWompiCredentials();
    if (!credentials) {
      throw new PaymentCheckoutSessionError(
        503,
        "La pasarela Wompi no está configurada en el servidor",
      );
    }

    const integritySignature = computeWompiIntegritySignature({
      reference,
      amountInCents,
      currency: "COP",
      integritySecret: credentials.integritySecret,
    });

    const params = new URLSearchParams({
      "public-key": credentials.publicKey,
      currency: "COP",
      "amount-in-cents": String(amountInCents),
      reference,
      "signature:integrity": integritySignature,
      "redirect-url": redirectUrl,
    });

    const customerName = order.customerName?.trim().slice(0, 100);
    if (customerName) {
      params.set("customer-data:full-name", customerName);
    }

    return {
      provider: "wompi",
      mode: credentials.mode,
      orderId: order.id,
      reference,
      currency: "COP",
      amountCop,
      amountInCents,
      publicKey: credentials.publicKey,
      integritySignature,
      redirectUrl,
      checkoutUrl: `https://checkout.wompi.co/p/?${params.toString()}`,
      description,
      createdAt,
    };
  }

  const boldCredentials = resolveBoldCredentials();
  if (!boldCredentials) {
    throw new PaymentCheckoutSessionError(
      503,
      "La pasarela Bold no está configurada en el servidor",
    );
  }

  const integritySignature = computeBoldIntegritySignature({
    reference,
    amountCop,
    currency: "COP",
    secretKey: boldCredentials.secretKey,
  });

  const boldParams = new URLSearchParams({
    "api-key": boldCredentials.apiKey,
    "order-id": reference,
    amount: String(amountCop),
    currency: "COP",
    "integrity-signature": integritySignature,
    "redirection-url": redirectUrl,
    description,
  });

  return {
    provider: "bold",
    mode: boldCredentials.mode,
    orderId: order.id,
    reference,
    currency: "COP",
    amountCop,
    amountInCents,
    publicKey: boldCredentials.apiKey,
    integritySignature,
    redirectUrl,
    checkoutUrl: `https://checkout.bold.co/payment?${boldParams.toString()}`,
    description,
    createdAt,
  };
}

export async function createOrderPaymentCheckoutSession(
  actor: VerifiedUser,
  input: {
    orderId: string;
    provider: PaymentGatewayProvider;
    redirectOrigin: string;
  },
): Promise<PaymentCheckoutSession> {
  const order = await getOrderForOnlinePayment(actor, input.orderId);
  const session = buildSignedCheckoutSession({
    order,
    provider: input.provider,
    redirectOrigin: input.redirectOrigin,
  });

  await createAuditEntry({
    actorUid: actor.uid,
    action: "initiate_online_payment",
    module: "pedidos",
    entityId: order.id,
    changes: {
      provider: session.provider,
      mode: session.mode,
      reference: session.reference,
      amountCop: session.amountCop,
    },
  });

  return session;
}
