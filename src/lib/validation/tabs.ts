import { z } from "zod";

import { BAR_TAB_SPLIT_MODES } from "@/types/tabs";

const SINGLE_PAYMENT_METHODS = ["efectivo", "transferencia", "nequi", "daviplata", "qr"] as const;

const roundItemSchema = z.object({
  productId: z.string().trim().min(1, "Producto requerido"),
  quantity: z.number().int().min(1, "Cantidad mínima 1").max(50, "Máximo 50 unidades por línea"),
  customization: z.object({
    size: z.string().trim().min(1, "El tamaño es obligatorio").max(50),
    flavors: z.array(z.string().trim().min(1)).max(20),
    addOns: z.array(z.string().trim().min(1)).max(20),
  }),
});

export const openBarTabSchema = z.object({
  action: z.literal("open"),
  negocioId: z.string().trim().min(1).max(120).optional(),
  tableNumber: z.string().trim().min(1, "El número o nombre de mesa es obligatorio").max(40),
  customerName: z.string().trim().max(120).optional(),
  guestCount: z.number().int().min(1).max(30).optional().default(1),
});

export const addBarTabRoundSchema = z.object({
  action: z.literal("add_round"),
  tabId: z.string().trim().min(1, "El ID de la cuenta es obligatorio"),
  items: z.array(roundItemSchema).min(1, "Agrega al menos un producto a la ronda").max(50),
  notes: z.string().trim().max(300).optional(),
});

export const barTabPaymentSchema = z.object({
  label: z.string().trim().max(80).optional(),
  method: z.enum(SINGLE_PAYMENT_METHODS),
  amount: z.number().int().min(1, "El monto debe ser mayor a 0").max(100_000_000),
  reference: z.string().trim().max(80).optional(),
});

export const closeBarTabSchema = z.object({
  action: z.literal("close"),
  tabId: z.string().trim().min(1, "El ID de la cuenta es obligatorio"),
  splitMode: z.enum(BAR_TAB_SPLIT_MODES),
  guestCount: z.number().int().min(1).max(30).optional(),
  payments: z.array(barTabPaymentSchema).min(1, "Registra al menos un pago").max(30),
  closingNotes: z.string().trim().max(300).optional(),
});

export const cancelBarTabSchema = z.object({
  action: z.literal("cancel"),
  tabId: z.string().trim().min(1, "El ID de la cuenta es obligatorio"),
  reason: z.string().trim().max(240).optional(),
});

export const barTabActionSchema = z.discriminatedUnion("action", [
  openBarTabSchema,
  addBarTabRoundSchema,
  closeBarTabSchema,
  cancelBarTabSchema,
]);
