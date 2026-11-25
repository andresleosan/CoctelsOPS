import { processPaymentWebhookEvent } from "@/lib/payments/process-webhook";
import {
  PaymentWebhookValidationError,
  detectPaymentWebhookProvider,
  normalizePaymentWebhookEvent,
  verifyPaymentWebhookSignature,
} from "@/lib/payments/webhook-signature";
import type { PaymentGatewayProvider } from "@/types/orders";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1024;

function resolveProviderSecret(provider: PaymentGatewayProvider): string | undefined {
  if (provider === "wompi") {
    return process.env.WOMPI_EVENTS_SECRET?.trim() || undefined;
  }
  return process.env.BOLD_WEBHOOK_SECRET?.trim() || undefined;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
      return Response.json(
        { error: "El cuerpo del webhook excede el límite permitido" },
        { status: 413 },
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "Cuerpo JSON inválido" }, { status: 422 });
    }

    if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
      return Response.json({ error: "El payload del webhook debe ser un objeto JSON" }, { status: 422 });
    }

    const payload = parsedJson as Record<string, unknown>;
    const url = new URL(request.url);
    const provider = detectPaymentWebhookProvider(
      request.headers,
      payload,
      url.searchParams.get("provider"),
    );
    if (!provider) {
      return Response.json(
        { error: "Proveedor de pasarela no reconocido (usa wompi o bold)" },
        { status: 422 },
      );
    }

    const secret = resolveProviderSecret(provider);
    if (!secret) {
      return Response.json(
        { error: "Webhook de pasarela no configurado en el servidor" },
        { status: 503 },
      );
    }

    const verification = verifyPaymentWebhookSignature({
      provider,
      rawBody,
      payload,
      headers: request.headers,
      secret,
    });
    if (!verification.ok) {
      return Response.json({ error: "Firma HMAC de webhook inválida" }, { status: 401 });
    }

    const normalizedEvent = normalizePaymentWebhookEvent(provider, payload);
    const result = await processPaymentWebhookEvent(normalizedEvent);

    if (result.outcome === "order_not_found") {
      return Response.json(
        { error: "Pedido asociado no encontrado", ...result },
        { status: 404 },
      );
    }

    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof PaymentWebhookValidationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "No fue posible procesar la notificación de pago" },
      { status: 500 },
    );
  }
}
