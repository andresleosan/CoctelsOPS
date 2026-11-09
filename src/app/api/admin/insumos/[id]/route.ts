import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  getSupplyById,
  SupplyValidationError,
  updateSupply,
} from "@/lib/firestore/supplies";
import { updateSupplySchema } from "@/lib/validation/supplies";

function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Datos inválidos" },
      { status: 422 }
    );
  }
  if (error instanceof SupplyValidationError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  return toAuthorizationResponse(error);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await requirePermission(request as never, "inventario.read");
    const { id } = await context.params;
    const supply = await getSupplyById(id);
    if (!supply) {
      return Response.json({ error: "Insumo no encontrado" }, { status: 404 });
    }
    return Response.json({ supply });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "inventario.write");
    const { id } = await context.params;
    const json = await request.json();
    const patch = updateSupplySchema.parse(json);

    const supply = await updateSupply(id, patch, actor.uid);
    return Response.json({ supply });
  } catch (error) {
    return errorResponse(error);
  }
}
