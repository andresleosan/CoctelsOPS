import "server-only";

import { z } from "zod";

import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  RecipeConflictError,
  RecipeNotFoundError,
  RecipeValidationError,
} from "@/lib/firestore/recipes";

export function toRecipeErrorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Datos de receta inválidos" },
      { status: 422 }
    );
  }
  if (error instanceof RecipeValidationError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof RecipeNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof RecipeConflictError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  return toAuthorizationResponse(error);
}
