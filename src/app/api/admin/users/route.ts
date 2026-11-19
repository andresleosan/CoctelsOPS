import { z } from "zod";

import { isGlobalAdmin, requirePermission } from "@/lib/auth/permissions";
import { AuthorizationError, toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  AdminUserValidationError,
  addAdministratorByEmail,
  listUsers,
} from "@/lib/firestore/users";

const addAdminSchema = z.object({
  email: z.string().trim().email("Ingresa un correo electrónico válido").max(160),
  displayName: z.string().trim().max(120).optional(),
  password: z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || value.length >= 8,
      "La contraseña debe tener al menos 8 caracteres",
    )
    .refine((value) => value.length <= 128, "La contraseña excede el límite permitido")
    .optional(),
});

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "El cuerpo JSON no es válido" }, { status: 422 });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Los datos del administrador no son válidos" },
      { status: 422 },
    );
  }
  if (error instanceof AdminUserValidationError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  return toAuthorizationResponse(error);
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requirePermission(request as never, "usuarios.read");
    return Response.json({ users: await listUsers() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "usuarios.manage");
    if (!isGlobalAdmin(actor)) {
      throw new AuthorizationError(403, "Solo un administrador puede agregar nuevos administradores");
    }
    const parsed = addAdminSchema.parse(await request.json());
    const result = await addAdministratorByEmail(
      {
        email: parsed.email,
        displayName: parsed.displayName,
        password: parsed.password || undefined,
      },
      actor.uid,
    );
    return Response.json(
      { user: result.user, createdAuthUser: result.createdAuthUser },
      { status: result.createdAuthUser ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
