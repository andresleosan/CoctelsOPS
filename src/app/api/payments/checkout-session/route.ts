import { z } from "zod";

import { resolvePermissions } from "@/lib/auth/permissions";
import { toAuthorizationResponse, verifyRequest } from "@/lib/auth/verify-request";
import { OrderNotFoundError } from "@/lib/firestore/orders";
import {
  PaymentCheckoutSessionError,
  createOrderPaymentCheckoutSession,
  getConfiguredPaymentGateways,
  resolveSafeRedirectOrigin,
} from "@/lib/payments/checkout-session";
import { PAYMENT_GATEWAY_PROVIDERS } from "@/types/orders";

export const dynamic = "force-dynamic";

const createCheckoutSessionSchema = z.object({
  orderId: z.string().trim().min(1, "El identificador del pedido es obligatorio").max(128),
  provider: z.enum(PAYMENT_GATEWAY_PROVIDERS),
});

export async function GET(): Promise<Response> {
  return Response.json(
    { gateways: getConfiguredPaymentGateways() },
    { status: 200 },
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    let actor = await verifyRequest(request as never);
    if (
      actor.profile &&
      actor.profile.accountType !== "admin" &&
      Array.isArray(actor.profile.roleIds) &&
      actor.profile.roleIds.length > 0 &&
      (!actor.profile.permissions || actor.profile.permissions.length === 0) &&
      typeof resolvePermissions === "function"
    ) {
      const permissions = await resolvePermissions(actor.profile);
      actor = {
        ...actor,
        permissions,
        profile: { ...actor.profile, permissions },
      };
    }

    const input = createCheckoutSessionSchema.parse(await request.json());
    const redirectOrigin = resolveSafeRedirectOrigin(request);
    const session = await createOrderPaymentCheckoutSession(actor, {
      orderId: input.orderId,
      provider: input.provider,
      redirectOrigin,
    });

    return Response.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      const message =
        error instanceof SyntaxError
          ? "El cuerpo de la solicitud no es un JSON válido"
          : error.issues[0]?.message ?? "Los datos del pago no son válidos";
      return Response.json({ error: message }, { status: 422 });
    }
    if (error instanceof OrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PaymentCheckoutSessionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return toAuthorizationResponse(error);
  }
}
