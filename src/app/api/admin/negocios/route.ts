import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import { createNegocio, listAllNegocios } from "@/lib/firestore/tenant";
import { negocioInputSchema } from "@/lib/validation/tenant";

function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json({ error: error.issues[0]?.message ?? "Negocio inválido" }, { status: 422 });
  }
  return toAuthorizationResponse(error);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.read");
    const negocios = await listAllNegocios(caller);
    return Response.json({ negocios });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.write");
    const json = await request.json();
    const validated = negocioInputSchema.parse(json);
    const id = await createNegocio(validated, caller);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

