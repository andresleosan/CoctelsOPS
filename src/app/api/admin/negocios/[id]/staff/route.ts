import { z } from "zod";

import { requireNegocioAccess, requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  TenantNotFoundError,
  TenantValidationError,
  assignStaffToNegocioByIdentity,
  listNegocioStaff,
} from "@/lib/firestore/tenant";
import { assignNegocioStaffSchema } from "@/lib/validation/tenant";

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 422 });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Datos de personal inválidos" },
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

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.read");
    const { id } = await context.params;
    requireNegocioAccess(caller, id);
    const staff = await listNegocioStaff(id, caller);
    return Response.json({ staff });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.write");
    const { id } = await context.params;
    const json = await request.json();
    const validated = assignNegocioStaffSchema.parse(json);
    const result = await assignStaffToNegocioByIdentity(id, validated, caller);
    return Response.json(
      { member: result.member, createdAuthUser: result.createdAuthUser },
      { status: result.createdAuthUser ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.write");
    const { id } = await context.params;
    const url = new URL(request.url);
    let uid = url.searchParams.get("uid")?.trim() ?? "";

    if (!uid) {
      const rawBody = await request.text();
      if (rawBody.trim()) {
        const body = JSON.parse(rawBody) as { uid?: unknown };
        if (typeof body.uid === "string") {
          uid = body.uid.trim();
        }
      }
    }

    if (!uid) {
      return Response.json({ error: "El UID del miembro de staff es obligatorio" }, { status: 422 });
    }

    const result = await assignStaffToNegocioByIdentity(
      id,
      { uid, role: "staff", active: false },
      caller,
    );
    return Response.json({ member: result.member });
  } catch (error) {
    return errorResponse(error);
  }
}
