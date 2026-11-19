import { z } from "zod";

import { isGlobalAdmin, requirePermission } from "@/lib/auth/permissions";
import { AuthorizationError, toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  AdminUserValidationError,
  UserNotFoundError,
  getUserProfile,
  setUserAdminStatus,
  updateUser,
} from "@/lib/firestore/users";

const updateSchema = z
  .object({
    active: z.boolean().optional(),
    roleIds: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    accountType: z.enum(["admin", "staff", "customer"]).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.active !== undefined ||
      data.roleIds !== undefined ||
      data.accountType !== undefined,
    "No hay cambios para aplicar",
  );

type Context = { params: Promise<{ uid: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "El cuerpo JSON no es válido" }, { status: 422 });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: "Los datos del usuario no son válidos" }, { status: 422 });
  }
  if (error instanceof AdminUserValidationError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof UserNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof Error && error.message === "Los roles seleccionados no existen") {
    return Response.json({ error: error.message }, { status: 422 });
  }
  return toAuthorizationResponse(error);
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await requirePermission(request as never, "usuarios.read");
    const { uid } = await context.params;
    const user = await getUserProfile(uid);
    return user ? Response.json({ user }) : Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "usuarios.manage");
    const { uid } = await context.params;
    const input = updateSchema.parse(await request.json());

    if (input.accountType !== undefined) {
      if (!isGlobalAdmin(actor)) {
        throw new AuthorizationError(403, "Solo un administrador puede cambiar el nivel administrativo");
      }
      await setUserAdminStatus(
        uid,
        input.accountType === "admin",
        actor.uid,
        input.accountType === "customer" ? "customer" : "staff",
      );
    }

    if (input.active !== undefined || input.roleIds !== undefined) {
      await updateUser(
        uid,
        {
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.roleIds !== undefined ? { roleIds: input.roleIds } : {}),
        },
        actor.uid,
      );
    }

    const user = await getUserProfile(uid);
    return Response.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
