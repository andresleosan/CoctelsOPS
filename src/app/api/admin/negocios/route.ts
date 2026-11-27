import { z } from "zod";

import { isGlobalAdmin, requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  TenantNotFoundError,
  TenantValidationError,
  cloneCatalogForNegocio,
  createNegocio,
  getNegocioOnboardingStats,
  listAccessibleNegocios,
} from "@/lib/firestore/tenant";
import { negocioCreateRequestSchema } from "@/lib/validation/tenant";

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 422 });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Negocio inválido" },
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

export async function GET(request: Request): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.read");
    const negocios = await listAccessibleNegocios(caller);
    const stats = await getNegocioOnboardingStats(negocios.map((negocio) => negocio.id));
    return Response.json({
      negocios,
      canCreate: isGlobalAdmin(caller),
      stats,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.write");
    const json = await request.json();
    const { cloneStarterCatalog, cloneSource, ...negocioInput } =
      negocioCreateRequestSchema.parse(json);

    const id = await createNegocio(negocioInput, caller);
    if (cloneStarterCatalog) {
      const clonedCatalog = await cloneCatalogForNegocio(id, caller, {
        source: cloneSource ?? "starter",
      });
      return Response.json({ id, clonedCatalog }, { status: 201 });
    }

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
