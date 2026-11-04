import { z } from "zod";

import { isAllowedCatalogImage } from "@/lib/catalog/image-hosts";
import { PRODUCT_CATEGORIES } from "@/types/catalog";

const imageSchema = z.string().trim().min(1).refine(isAllowedCatalogImage, "La imagen no pertenece a un host permitido");

const addOnSchema = z.object({
  name: z.string().trim().min(1, "El nombre de la adición es obligatorio"),
  price: z.number().positive("El precio de la adición debe ser mayor que cero"),
});

const sizeSchema = z.object({
  name: z.string().trim().min(1, "El nombre de la presentación es obligatorio"),
  price: z.number().positive("El precio de la presentación debe ser mayor que cero"),
});

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  description: z.string().trim().min(1, "La descripción es obligatoria"),
  price: z.number().positive("El precio debe ser mayor que cero"),
  image: imageSchema,
  category: z.enum(PRODUCT_CATEGORIES),
  availableSizes: z.array(sizeSchema).max(10).optional(),
  availableFlavors: z.array(z.string().trim().min(1)).max(20),
  availableAddOns: z.array(addOnSchema).max(20).superRefine((addOns, context) => {
    const names = new Set<string>();
    for (const addOn of addOns) {
      const normalizedName = addOn.name.trim().toLocaleLowerCase();
      if (names.has(normalizedName)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "No puede haber adiciones duplicadas" });
        return;
      }
      names.add(normalizedName);
    }
  }),
  stock: z.number().int().nonnegative("El stock no puede ser negativo"),
  active: z.boolean(),
  featured: z.boolean(),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  active: z.boolean(),
  order: z.number().int().nonnegative(),
});

export type ValidatedProductInput = z.infer<typeof productInputSchema>;
