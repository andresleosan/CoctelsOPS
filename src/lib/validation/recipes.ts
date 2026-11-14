import { z } from "zod";

import { areUnitsCompatible } from "@/lib/recipes/escandallo";
import { supplyUnitSchema } from "@/lib/validation/supplies";
import { RECIPE_UNITS, type RecipeUnit } from "@/types/recipes";

export const recipeUnitSchema = z.enum(RECIPE_UNITS) satisfies z.ZodType<RecipeUnit>;

export const recipeIngredientSchema = z
  .object({
    supplyId: z.string().trim().min(1, "Selecciona un insumo válido").max(120),
    supplyName: z.string().trim().min(1, "El nombre del insumo es obligatorio").max(120),
    supplyUnit: supplyUnitSchema,
    quantity: z
      .number()
      .finite("La cantidad debe ser un número válido")
      .positive("La cantidad del insumo debe ser mayor a 0")
      .max(100_000, "La cantidad excede el límite permitido"),
    unit: recipeUnitSchema,
    bottleVolumeMl: z
      .number()
      .finite()
      .positive("El volumen por botella debe ser mayor a 0")
      .max(10_000)
      .optional(),
  })
  .superRefine((ingredient, ctx) => {
    if (!areUnitsCompatible(ingredient.unit, ingredient.supplyUnit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unit"],
        message: `La unidad "${ingredient.unit}" es incompatible con el stock en "${ingredient.supplyUnit}"`,
      });
    }
  });

export const addOnRecipeIngredientSchema = z
  .object({
    addOnName: z.string().trim().min(1, "El nombre de la adición es obligatorio").max(80),
    supplyId: z.string().trim().min(1, "Selecciona un insumo válido").max(120),
    supplyName: z.string().trim().min(1, "El nombre del insumo es obligatorio").max(120),
    supplyUnit: supplyUnitSchema,
    quantity: z
      .number()
      .finite("La cantidad debe ser un número válido")
      .positive("La cantidad del insumo debe ser mayor a 0")
      .max(100_000, "La cantidad excede el límite permitido"),
    unit: recipeUnitSchema,
    bottleVolumeMl: z
      .number()
      .finite()
      .positive("El volumen por botella debe ser mayor a 0")
      .max(10_000)
      .optional(),
  })
  .superRefine((ingredient, ctx) => {
    if (!areUnitsCompatible(ingredient.unit, ingredient.supplyUnit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unit"],
        message: `La unidad "${ingredient.unit}" es incompatible con el stock en "${ingredient.supplyUnit}"`,
      });
    }
  });

const ingredientsListSchema = z
  .array(recipeIngredientSchema)
  .min(1, "La receta debe tener al menos un insumo")
  .max(40, "Una receta no puede superar 40 insumos")
  .superRefine((ingredients, ctx) => {
    const seen = new Set<string>();
    for (const ingredient of ingredients) {
      if (seen.has(ingredient.supplyId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El insumo "${ingredient.supplyName}" está duplicado en la receta base`,
        });
        return;
      }
      seen.add(ingredient.supplyId);
    }
  });

const addOnIngredientsListSchema = z
  .array(addOnRecipeIngredientSchema)
  .max(30, "Una receta no puede superar 30 insumos por adición")
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.addOnName.trim().toLocaleLowerCase()}::${item.supplyId}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El insumo "${item.supplyName}" está duplicado para la adición "${item.addOnName}"`,
        });
        return;
      }
      seen.add(key);
    }
  });

export const productRecipeInputSchema = z.object({
  negocioId: z.string().trim().min(1).max(80).optional(),
  productId: z.string().trim().min(1, "El producto es obligatorio").max(120),
  productName: z.string().trim().min(1, "El nombre del producto es obligatorio").max(140),
  presentation: z.string().trim().min(1, "La presentación es obligatoria").max(80),
  ingredients: ingredientsListSchema,
  addOnIngredients: addOnIngredientsListSchema.optional().default([]),
  yieldUnits: z
    .number()
    .finite()
    .positive("El rendimiento debe ser mayor a 0")
    .max(1000)
    .optional()
    .default(1),
  notes: z.string().trim().max(500).optional(),
  active: z.boolean().optional().default(true),
});

export const productRecipePatchSchema = z.object({
  productName: z.string().trim().min(1).max(140).optional(),
  presentation: z.string().trim().min(1).max(80).optional(),
  ingredients: ingredientsListSchema.optional(),
  addOnIngredients: addOnIngredientsListSchema.optional(),
  yieldUnits: z.number().finite().positive().max(1000).optional(),
  notes: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
});

export type ValidatedProductRecipeInput = z.infer<typeof productRecipeInputSchema>;
export type ValidatedProductRecipePatch = z.infer<typeof productRecipePatchSchema>;
