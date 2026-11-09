import { z } from "zod";
import type { SupplyCategory, SupplyMovementType, SupplyUnit } from "@/types/supplies";

export const supplyCategorySchema = z.enum(["licor", "pulpa", "mezclador", "desechable", "topping", "otro"]) satisfies z.ZodType<SupplyCategory>;

export const supplyUnitSchema = z.enum(["ml", "l", "g", "kg", "unidad", "botella"]) satisfies z.ZodType<SupplyUnit>;

export const supplyMovementTypeSchema = z.enum(["entrada", "merma", "ajuste", "consumo"]) satisfies z.ZodType<SupplyMovementType>;

export const createSupplySchema = z.object({
  negocioId: z.string().trim().min(1).default("coctels-ops"),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  category: supplyCategorySchema,
  unit: supplyUnitSchema,
  currentStock: z.number().min(0, "El stock no puede ser negativo"),
  minStock: z.number().min(0, "El stock mínimo no puede ser negativo"),
  costPerUnit: z.number().min(0).default(0),
  supplier: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateSupplySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  category: supplyCategorySchema.optional(),
  unit: supplyUnitSchema.optional(),
  minStock: z.number().min(0).optional(),
  costPerUnit: z.number().min(0).optional(),
  supplier: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const recordSupplyMovementSchema = z.object({
  type: supplyMovementTypeSchema,
  quantity: z.number().finite("La cantidad debe ser un número válido"),
  reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres").max(240),
});
