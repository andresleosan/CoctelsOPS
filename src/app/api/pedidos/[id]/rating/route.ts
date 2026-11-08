import { z } from "zod";

import { toAuthorizationResponse, verifyRequest } from "@/lib/auth/verify-request";
import { OrderNotFoundError, rateCustomerOrder } from "@/lib/firestore/orders";
import { OrderValidationError, orderRatingSchema } from "@/lib/validation/orders";

type RouteContext = { params: Promise<{ id: string }> };

function toRatingResponse(error: unknown): Response {
  if (
    error instanceof SyntaxError ||
    error instanceof z.ZodError ||
    error instanceof OrderValidationError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    const message =
      error instanceof SyntaxError
        ? "El cuerpo de la solicitud no es un JSON valido"
        : error instanceof z.ZodError
          ? error.issues[0]?.message
          : (error as Error).message;
    return Response.json({ error: message ?? "La calificación no es válida" }, { status: 422 });
  }
  if (error instanceof OrderNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  return toAuthorizationResponse(error);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await verifyRequest(request as never);
    const { id } = await context.params;
    const body = (await request.json()) as unknown;
    const validated = orderRatingSchema.parse(body);
    const rating = await rateCustomerOrder(user, id, validated);
    return Response.json({ success: true, rating });
  } catch (error) {
    return toRatingResponse(error);
  }
}
