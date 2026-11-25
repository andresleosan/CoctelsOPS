import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import { assignOrderDriver, OrderNotFoundError } from "@/lib/firestore/orders";
import { assignOrderDriverSchema, OrderValidationError } from "@/lib/validation/orders";

type RouteContext = { params: Promise<{ id: string }> };

function toDriverResponse(error: unknown): Response {
  if (
    error instanceof SyntaxError ||
    error instanceof z.ZodError ||
    error instanceof OrderValidationError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    const message =
      error instanceof SyntaxError
        ? "El cuerpo de la solicitud no es un JSON válido"
        : error instanceof z.ZodError
          ? error.issues[0]?.message
          : (error as Error).message;
    return Response.json(
      { error: message ?? "Los datos del domiciliario no son válidos" },
      { status: 422 },
    );
  }
  if (error instanceof OrderNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  return toAuthorizationResponse(error);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requirePermission(request as never, "pedidos.update");
    const { id } = await context.params;
    const parsed = assignOrderDriverSchema.parse(await request.json());
    const order = await assignOrderDriver(user, id, parsed.driver);
    return Response.json({ order });
  } catch (error) {
    return toDriverResponse(error);
  }
}
