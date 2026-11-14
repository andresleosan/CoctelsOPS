import type { NextRequest } from "next/server";

import { requirePermission } from "@/lib/auth/permissions";
import {
  deleteRecipe,
  getRecipeById,
  RecipeValidationError,
  updateRecipe,
} from "@/lib/firestore/recipes";
import { toRecipeErrorResponse } from "@/lib/recipes/http-errors";
import { productRecipePatchSchema } from "@/lib/validation/recipes";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const caller = await requirePermission(request, "inventario.read");
    const { id } = await context.params;
    const recipe = await getRecipeById(caller, id);
    return Response.json({ recipe });
  } catch (error) {
    return toRecipeErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const caller = await requirePermission(request, "inventario.write");
    const { id } = await context.params;
    const rawBody = await request.json().catch(() => {
      throw new RecipeValidationError("El cuerpo JSON de la receta no es válido");
    });
    const validated = productRecipePatchSchema.parse(rawBody);
    const recipe = await updateRecipe(caller, id, validated);
    return Response.json({ recipe });
  } catch (error) {
    return toRecipeErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const caller = await requirePermission(request, "inventario.write");
    const { id } = await context.params;
    await deleteRecipe(caller, id);
    return Response.json({ deleted: true });
  } catch (error) {
    return toRecipeErrorResponse(error);
  }
}
