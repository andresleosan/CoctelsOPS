import "server-only";

import { z } from "zod";

import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import type {
  HappyHourSchedule,
  Promotion,
  PromotionContext,
  PromotionInput,
  PromotionResult,
} from "@/types/promotions";

export const happyHourScheduleSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Debe seleccionar al menos un día"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora de inicio inválido (HH:mm)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora de finalización inválido (HH:mm)"),
  timezone: z.string().optional().default("America/Bogota"),
}).superRefine((val, ctx) => {
  if (val.endTime <= val.startTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "La hora de finalización debe ser posterior a la de inicio",
    });
  }
});

export const promotionInputSchema = z.object({
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  title: z.string().trim().max(100).optional(),
  description: z.string().trim().max(300).optional(),
  active: z.boolean(),
  type: z.enum(["standard", "happy_hour", "combo"]).optional().default("standard"),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  discountType: z.enum(["percent", "fixed", "2x1"]),
  discountValue: z.number().nonnegative(),
  minimumSubtotal: z.number().nonnegative(),
  productIds: z.array(z.string().trim().min(1)).max(100).optional(),
  categoryIds: z.array(z.string().trim().min(1)).max(30).optional(),
  usageLimit: z.number().int().positive().optional(),
  maxDiscount: z.number().positive().optional(),
  isAutomatic: z.boolean().optional().default(false),
  schedule: happyHourScheduleSchema.optional(),
}).superRefine((value, context) => {
  if (value.endsAt <= value.startsAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "La fecha final debe ser posterior a la inicial" });
  }
  if (value.discountType === "percent") {
    if (value.discountValue <= 0 || value.discountValue > 100) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "El porcentaje debe estar entre 0.01 y 100" });
    }
  } else if (value.discountType === "fixed") {
    if (value.discountValue <= 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "El valor fijo debe ser mayor a 0" });
    }
  }
  if (value.type === "happy_hour" && !value.schedule) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule"], message: "Las promociones de Happy Hour requieren una franja horaria configurada" });
  }
});

export function getDayAndTimeInTimezone(date: Date, timeZone: string = "America/Bogota"): { dayOfWeek: number; time: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value.toLowerCase() ?? "";
  const hourPart = parts.find((p) => p.type === "hour")?.value.padStart(2, "0") ?? "00";
  const minutePart = parts.find((p) => p.type === "minute")?.value.padStart(2, "0") ?? "00";

  const dayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const dayOfWeek = dayMap[weekdayPart] ?? date.getDay();
  const cleanHour = hourPart === "24" ? "00" : hourPart;
  return { dayOfWeek, time: `${cleanHour}:${minutePart}` };
}

export function isWithinSchedule(schedule: HappyHourSchedule, nowIso: string): boolean {
  const tz = schedule.timezone || "America/Bogota";
  const date = new Date(nowIso);
  const { dayOfWeek, time } = getDayAndTimeInTimezone(date, tz);

  if (!schedule.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }

  return time >= schedule.startTime && time <= schedule.endTime;
}

export function toPromotion(id: string, data: Record<string, unknown>): Promotion {
  const validated = promotionInputSchema.parse(data);
  return {
    id,
    ...validated,
    usageCount: typeof data.usageCount === "number" && data.usageCount >= 0 ? data.usageCount : 0,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  };
}

export function calculatePromotion(input: PromotionContext): PromotionResult {
  const { promotion, subtotal, items } = input;
  const now = input.now ?? new Date().toISOString();
  const inactive = !promotion.active;
  if (inactive) return { applied: false, discount: 0, total: subtotal, code: promotion.code, reason: "inactiva" };
  if (!Number.isFinite(subtotal) || subtotal < 0 || now < promotion.startsAt || now > promotion.endsAt) {
    return { applied: false, discount: 0, total: subtotal, code: promotion.code, reason: "vencida" };
  }
  if (promotion.schedule && !isWithinSchedule(promotion.schedule, now)) {
    return { applied: false, discount: 0, total: subtotal, code: promotion.code, reason: "horario" };
  }
  if (subtotal < promotion.minimumSubtotal) {
    return { applied: false, discount: 0, total: subtotal, code: promotion.code, reason: "mínimo" };
  }
  if (promotion.usageLimit !== undefined && promotion.usageCount >= promotion.usageLimit) {
    return { applied: false, discount: 0, total: subtotal, code: promotion.code, reason: "límite" };
  }

  const scoped = Boolean(promotion.productIds?.length || promotion.categoryIds?.length);
  const eligible = items.filter(
    (item) =>
      (!promotion.productIds?.length || promotion.productIds.includes(item.productId)) &&
      (!promotion.categoryIds?.length || promotion.categoryIds.includes(item.category))
  );

  if (scoped && eligible.length === 0) {
    return { applied: false, discount: 0, total: subtotal, code: promotion.code, reason: "alcance" };
  }

  const eligibleSubtotal = scoped ? eligible.reduce((sum, item) => sum + Math.max(0, item.subtotal), 0) : subtotal;

  let rawDiscount = 0;
  if (promotion.discountType === "2x1") {
    const units: number[] = [];
    for (const item of eligible) {
      const qty = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
      const unitPrice = typeof item.unitPrice === "number" && item.unitPrice > 0 ? item.unitPrice : Math.round(item.subtotal / qty);
      for (let i = 0; i < qty; i++) {
        units.push(unitPrice);
      }
    }

    if (units.length < 2) {
      return { applied: false, discount: 0, total: subtotal, code: promotion.code, reason: "mínimo" };
    }

    units.sort((a, b) => a - b);
    const freeCount = Math.floor(units.length / 2);
    rawDiscount = units.slice(0, freeCount).reduce((sum, p) => sum + p, 0);
  } else if (promotion.discountType === "percent") {
    rawDiscount = eligibleSubtotal * (promotion.discountValue / 100);
  } else {
    rawDiscount = promotion.discountValue;
  }

  const discount = Math.min(
    Math.round(rawDiscount),
    Math.round(eligibleSubtotal),
    promotion.maxDiscount === undefined ? Number.MAX_SAFE_INTEGER : Math.round(promotion.maxDiscount)
  );

  return { applied: true, discount, total: Math.max(0, Math.round(subtotal - discount)), code: promotion.code };
}

export async function getPromotionByCode(code: string): Promise<Promotion | null> {
  const snapshot = await getAdminDb().collection("promociones").where("code", "==", code.trim().toUpperCase()).limit(1).get();
  const document = snapshot.docs[0];
  return document ? toPromotion(document.id, document.data() as Record<string, unknown>) : null;
}

export async function listPromotions(): Promise<Promotion[]> {
  const snapshot = await getAdminDb().collection("promociones").orderBy("startsAt", "desc").limit(100).get();
  return snapshot.docs.map((document) => toPromotion(document.id, document.data() as Record<string, unknown>));
}

export async function getActivePromotions(nowIso: string = new Date().toISOString()): Promise<{
  activeHappyHours: Promotion[];
  todayScheduled: Promotion[];
}> {
  const promotions = await listPromotions();
  const tz = "America/Bogota";
  const { dayOfWeek } = getDayAndTimeInTimezone(new Date(nowIso), tz);

  const activeHappyHours: Promotion[] = [];
  const todayScheduled: Promotion[] = [];

  for (const promo of promotions) {
    if (!promo.active) continue;
    if (nowIso < promo.startsAt || nowIso > promo.endsAt) continue;

    if (promo.schedule) {
      if (promo.schedule.daysOfWeek.includes(dayOfWeek)) {
        todayScheduled.push(promo);
        if (isWithinSchedule(promo.schedule, nowIso)) {
          activeHappyHours.push(promo);
        }
      }
    } else if (promo.isAutomatic) {
      activeHappyHours.push(promo);
      todayScheduled.push(promo);
    }
  }

  return { activeHappyHours, todayScheduled };
}

export async function createPromotion(input: PromotionInput, actorUid: string): Promise<string> {
  const validated = promotionInputSchema.parse(input);
  const reference = getAdminDb().collection("promociones").doc();
  const data = { ...validated, usageCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const db = getAdminDb();
  await db.runTransaction(async (transaction) => {
    transaction.create(reference, data);
    writeAuditInTransaction(transaction, { actorUid, action: "create", module: "promociones", entityId: reference.id, changes: data });
  });
  return reference.id;
}

export async function updatePromotion(id: string, input: PromotionInput, actorUid: string): Promise<void> {
  const validated = promotionInputSchema.parse(input);
  const db = getAdminDb();
  const reference = db.collection("promociones").doc(id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new Error("Promoción no encontrada");
    const current = toPromotion(id, snapshot.data() as Record<string, unknown>);
    const data = { ...validated, usageCount: current.usageCount, updatedAt: new Date().toISOString() };
    transaction.update(reference, data);
    writeAuditInTransaction(transaction, { actorUid, action: "update", module: "promociones", entityId: id, changes: { ...validated, usageCount: current.usageCount } });
  });
}

export async function deletePromotion(id: string, actorUid: string): Promise<void> {
  const db = getAdminDb();
  const reference = db.collection("promociones").doc(id);
  await db.runTransaction(async (transaction) => {
    transaction.delete(reference);
    writeAuditInTransaction(transaction, { actorUid, action: "delete", module: "promociones", entityId: id });
  });
}
