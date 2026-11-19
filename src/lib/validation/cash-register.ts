import { z } from "zod";
import { CASH_EXPENSE_CATEGORIES } from "@/types/cash-register";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

const copAmountSchema = z
  .number({ invalid_type_error: "El monto debe ser numérico" })
  .finite("El monto debe ser válido")
  .min(0, "El monto no puede ser negativo")
  .max(100_000_000, "El monto excede el límite permitido")
  .transform((value) => Math.round(value));

export const openCashShiftSchema = z.object({
  action: z.literal("open"),
  negocioId: z.string().trim().min(1).default(DEFAULT_TENANT_ID),
  openingBase: copAmountSchema,
  openingNotes: z.string().trim().max(300).optional(),
});

export const addCashExpenseSchema = z.object({
  action: z.literal("expense"),
  shiftId: z.string().trim().min(1, "El identificador del turno es obligatorio"),
  concept: z
    .string()
    .trim()
    .min(2, "El concepto debe tener al menos 2 caracteres")
    .max(120, "El concepto no puede superar 120 caracteres"),
  category: z.enum(CASH_EXPENSE_CATEGORIES),
  amount: copAmountSchema.refine((value) => value > 0, {
    message: "El monto del gasto debe ser mayor a $0",
  }),
  notes: z.string().trim().max(300).optional(),
});

export const closeCashShiftSchema = z.object({
  action: z.literal("close"),
  shiftId: z.string().trim().min(1, "El identificador del turno es obligatorio"),
  countBreakdown: z.object({
    declaredCash: copAmountSchema,
    declaredNequi: copAmountSchema.optional(),
    declaredDaviplata: copAmountSchema.optional(),
    declaredQr: copAmountSchema.optional(),
    declaredTransferencia: copAmountSchema.optional(),
  }),
  closingNotes: z.string().trim().max(400).optional(),
});

export const cashRegisterActionSchema = z.discriminatedUnion("action", [
  openCashShiftSchema,
  addCashExpenseSchema,
  closeCashShiftSchema,
]);
