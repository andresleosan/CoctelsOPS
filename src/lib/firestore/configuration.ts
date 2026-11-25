import "server-only";

import { z } from "zod";

import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import { syncLegacyDeliveryZones } from "@/lib/orders/delivery-zones";
import { DEFAULT_STORE_CONFIGURATION, type StoreConfiguration } from "@/types/operations";

export { DEFAULT_STORE_CONFIGURATION } from "@/types/operations";

const timeSchema = z.string().refine((value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match !== null && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}, "La hora debe estar entre 00:00 y 23:59");

const businessHourSchema = z.object({
  day: z.string().trim().min(1),
  open: timeSchema,
  close: timeSchema,
  closed: z.boolean().optional(),
}).superRefine((value, context) => {
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  if (toMinutes(value.close) <= toMinutes(value.open)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["close"], message: "La hora de cierre debe ser posterior a la apertura; los turnos nocturnos requieren soporte explícito" });
  }
});

export const deliveryZoneConfigSchema = z.object({
  id: z.string().trim().min(1, "El identificador de la zona es obligatorio").max(64),
  name: z.string().trim().min(1, "El nombre de la zona es obligatorio").max(80),
  feeCop: z.number().int().min(0, "La tarifa no puede ser negativa").max(200_000),
  estimatedMinutes: z.number().int().min(5, "El tiempo estimado mínimo es 5 minutos").max(240),
  freeDeliveryMinCop: z.number().int().min(0).max(5_000_000).optional(),
  active: z.boolean().default(true),
});

export const storeConfigurationSchema = z
  .object({
    whatsappNumber: z.string().trim().regex(/^\d{10,15}$/, "El WhatsApp debe ser un número internacional"),
    businessHours: z.array(businessHourSchema).length(7),
    deliveryZones: z.array(z.string().trim().min(1)).min(1).max(50),
    deliveryZoneRates: z.array(deliveryZoneConfigSchema).max(50).optional(),
    estimatedDeliveryMinutes: z.number().int().min(1).max(240),
    messages: z.object({ orderReceived: z.string().trim().min(1).max(300), orderStatus: z.string().trim().min(1).max(300), unavailable: z.string().trim().min(1).max(300) }),
  })
  .superRefine((value, context) => {
    if (!value.deliveryZoneRates || value.deliveryZoneRates.length === 0) return;
    const seenNames = new Set<string>();
    let activeCount = 0;
    for (const [index, zone] of value.deliveryZoneRates.entries()) {
      const normalizedName = zone.name.trim().toLowerCase();
      if (seenNames.has(normalizedName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryZoneRates", index, "name"],
          message: `La zona "${zone.name}" está duplicada`,
        });
      }
      seenNames.add(normalizedName);
      if (zone.active) activeCount += 1;
    }
    if (activeCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveryZoneRates"],
        message: "Debe existir al menos una zona de entrega activa",
      });
    }
  });

export class StoreConfigurationUnavailableError extends Error {
  constructor() {
    super("La configuración de la tienda no está disponible");
    this.name = "StoreConfigurationUnavailableError";
  }
}

export async function getStoreConfiguration(
  options: { allowDefaults?: boolean } = {},
): Promise<StoreConfiguration> {
  const snapshot = await getAdminDb().collection("configuracion").doc("principal").get();
  if (!snapshot.exists) {
    if (options.allowDefaults) return DEFAULT_STORE_CONFIGURATION;
    throw new StoreConfigurationUnavailableError();
  }

  const parsed = storeConfigurationSchema.safeParse(snapshot.data());
  if (parsed.success) return parsed.data;
  if (options.allowDefaults) return DEFAULT_STORE_CONFIGURATION;
  throw new StoreConfigurationUnavailableError();
}

export async function updateStoreConfiguration(input: StoreConfiguration, actorUid: string): Promise<StoreConfiguration> {
  const validated = storeConfigurationSchema.parse(input);
  const normalizedValidated: StoreConfiguration = validated.deliveryZoneRates?.length
    ? {
        ...validated,
        deliveryZones: syncLegacyDeliveryZones(validated.deliveryZoneRates),
      }
    : validated;
  const data = { ...normalizedValidated, updatedAt: new Date().toISOString() };
  const db = getAdminDb();
  const reference = db.collection("configuracion").doc("principal");
  await db.runTransaction(async (transaction) => {
    transaction.set(reference, data, { merge: true });
    writeAuditInTransaction(transaction, { actorUid, action: "update", module: "configuracion", entityId: "principal", changes: normalizedValidated });
  });
  return data;
}
