import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  TenantNotFoundError,
  TenantValidationError,
  cloneCatalogForNegocio,
} from "@/lib/firestore/tenant";
import { cloneCatalogRequestSchema } from "@/lib/validation/tenant";

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 422 });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Solicitud de clonación inválida" },
      { status: 422 },
    );
  }
  if (error instanceof TenantValidationError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof TenantNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  return toAuthorizationResponse(error);
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.write");
    const { id } = await context.params;
    const rawBody = await request.text();
    const parsedJson = rawBody.trim() ? JSON.parse(rawBody) : {};
    const options = cloneCatalogRequestSchema.parse(parsedJson);
    const result = await cloneCatalogForNegocio(id, caller, options);
    return Response.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
