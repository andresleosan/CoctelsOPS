import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import { getNegocioById, updateNegocio } from "@/lib/firestore/tenant";
import { negocioPatchSchema } from "@/lib/validation/tenant";

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json({ error: error.issues[0]?.message ?? "Datos inválidos" }, { status: 422 });
  }
  return toAuthorizationResponse(error);
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await requirePermission(request as never, "configuracion.read");
    const { id } = await context.params;
    const negocio = await getNegocioById(id);
    if (!negocio) {
      return Response.json({ error: "Negocio no encontrado" }, { status: 404 });
    }
    return Response.json({ negocio });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.write");
    const { id } = await context.params;
    const json = await request.json();
    const validatedPatch = negocioPatchSchema.parse(json);
    const updated = await updateNegocio(id, validatedPatch, caller);
    return Response.json({ negocio: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

