import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { AuthorizationError, toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  emergencyPausePatchSchema,
  getStoreConfiguration,
  storeConfigurationSchema,
  updateEmergencyPause,
  updateStoreConfiguration,
} from "@/lib/firestore/configuration";
import type { VerifiedUser } from "@/types/auth";

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Cuerpo de solicitud JSON inválido" }, { status: 400 });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: error.issues[0]?.message ?? "Configuración inválida" }, { status: 422 });
  }
  return toAuthorizationResponse(error);
}

async function requirePauseControlActor(request: Request): Promise<VerifiedUser> {
  try {
    return await requirePermission(request as never, "configuracion.write");
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 403) {
      return requirePermission(request as never, "pedidos.update");
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requirePermission(request as never, "configuracion.read");
    return Response.json({ configuration: await getStoreConfiguration({ allowDefaults: true }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "configuracion.write");
    const configuration = await updateStoreConfiguration(
      storeConfigurationSchema.parse(await request.json()),
      actor.uid,
    );
    return Response.json({ configuration });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const actor = await requirePauseControlActor(request);
    const input = emergencyPausePatchSchema.parse(await request.json());
    const configuration = await updateEmergencyPause(input, actor.uid);
    return Response.json({ configuration });
  } catch (error) {
    return errorResponse(error);
  }
}
