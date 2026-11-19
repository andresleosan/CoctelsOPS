import type { NextRequest } from "next/server";

import { requirePermission } from "@/lib/auth/permissions";
import {
  createRecipe,
  getCatalogProfitabilityForCaller,
  listRecipes,
  RecipeValidationError,
} from "@/lib/firestore/recipes";
import { toRecipeErrorResponse } from "@/lib/recipes/http-errors";
import { productRecipeInputSchema } from "@/lib/validation/recipes";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const caller = await requirePermission(request, "inventario.read");
    const { searchParams } = new URL(request.url);
    const negocioId = searchParams.get("negocioId")?.trim() || undefined;
    const productId = searchParams.get("productId")?.trim() || undefined;
    const includeProfitability = searchParams.get("includeProfitability") === "true";
    if (includeProfitability) {
      const result = await getCatalogProfitabilityForCaller(caller, { negocioId, productId });
      return Response.json(result);
    }
    const recipes = await listRecipes(caller, { negocioId, productId });
    return Response.json({ recipes });
  } catch (error) {
    return toRecipeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const caller = await requirePermission(request, "inventario.write");
    const rawBody = await request.json().catch(() => {
      throw new RecipeValidationError("El cuerpo JSON de la receta no es válido");
    });
    const validated = productRecipeInputSchema.parse(rawBody);
    const recipe = await createRecipe(caller, validated);
    return Response.json({ recipe }, { status: 201 });
  } catch (error) {
    return toRecipeErrorResponse(error);
  }
}
