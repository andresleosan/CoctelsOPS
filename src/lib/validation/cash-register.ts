import { z } from "zod";
import {
  CASH_EXPENSE_CATEGORIES,
  STAFF_TIP_ROLES,
  TIP_DISTRIBUTION_MODES,
  TIP_SOURCES,
} from "@/types/cash-register";
import { POS_DIGITAL_CHANNELS } from "@/types/orders";

const copAmountSchema = z
  .number({ invalid_type_error: "El monto debe ser numérico" })
  .finite("El monto debe ser válido")
  .min(0, "El monto no puede ser negativo")
  .max(100_000_000, "El monto excede el límite permitido")
  .transform((value) => Math.round(value));

export const openCashShiftSchema = z.object({
  action: z.literal("open"),
  negocioId: z.string().trim().min(1).max(120).optional(),
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

export const addCashTipSchema = z.object({
  action: z.literal("tip"),
  shiftId: z.string().trim().min(1, "El identificador del turno es obligatorio"),
  amount: copAmountSchema.refine((value) => value > 0, {
    message: "El monto de la propina debe ser mayor a $0",
  }),
  source: z.enum(TIP_SOURCES),
  channel: z.enum(POS_DIGITAL_CHANNELS).optional(),
  orderId: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(240).optional(),
});

export const staffTipRecipientSchema = z.object({
  id: z.string().trim().max(80).optional(),
  name: z
    .string()
    .trim()
    .min(2, "El nombre del integrante debe tener al menos 2 caracteres")
    .max(80, "El nombre no puede superar 80 caracteres"),
  role: z.enum(STAFF_TIP_ROLES),
  weight: z
    .number()
    .finite()
    .positive("El peso debe ser mayor a 0")
    .max(1000)
    .optional(),
  deliveriesCount: z
    .number()
    .int("Las entregas deben ser enteras")
    .min(0)
    .max(500)
    .optional(),
  commissionPerDeliveryCop: copAmountSchema.optional(),
  fixedCommissionCop: copAmountSchema.optional(),
  paidFromCash: z.boolean().optional(),
});

export const closeCashShiftStaffSettlementSchema = z.object({
  mode: z.enum(TIP_DISTRIBUTION_MODES),
  extraCashTips: copAmountSchema.optional(),
  extraDigitalTips: copAmountSchema.optional(),
  recipients: z
    .array(staffTipRecipientSchema)
    .max(40, "No se pueden liquidar más de 40 integrantes en un turno"),
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
  staffSettlement: closeCashShiftStaffSettlementSchema.optional(),
});

export const cashRegisterActionSchema = z.discriminatedUnion("action", [
  openCashShiftSchema,
  addCashExpenseSchema,
  addCashTipSchema,
  closeCashShiftSchema,
]);
