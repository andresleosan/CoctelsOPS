import { z } from "zod";

export const negocioSlugSchema = z
  .string()
  .trim()
  .min(2, "El slug debe tener al menos 2 caracteres")
  .max(50, "El slug no puede superar 50 caracteres")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug solo puede contener letras minúsculas, números y guiones sencillos");

export const negocioPlanSchema = z.enum(["starter", "pro", "enterprise"]);

export const negocioBrandingSchema = z.object({
  logoUrl: z.string().trim().min(1, "El logo es obligatorio"),
  bannerUrl: z.string().trim().optional(),
  primaryColor: z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color primario hexadecimal inválido").optional(),
  accentColor: z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color de acento hexadecimal inválido").optional(),
  slogan: z.string().trim().min(1, "El slogan es obligatorio"),
});

const businessHourSchema = z.object({
  day: z.string().trim().min(1),
  open: z.string().trim().regex(/^\d{2}:\d{2}$/, "Formato HH:mm inválido"),
  close: z.string().trim().regex(/^\d{2}:\d{2}$/, "Formato HH:mm inválido"),
  closed: z.boolean().optional(),
});

export const negocioConfigurationSchema = z.object({
  whatsappNumber: z.string().trim().regex(/^\d{10,15}$/, "El número de WhatsApp debe contener entre 10 y 15 dígitos"),
  businessHours: z.array(businessHourSchema).min(1, "Debe tener al menos un horario"),
  deliveryZones: z.array(z.string().trim().min(1)).min(1, "Debe incluir al menos una zona"),
  estimatedDeliveryMinutes: z.number().int().positive("Los minutos estimados deben ser positivos"),
  messages: z.object({
    orderReceived: z.string().trim().min(1),
    orderStatus: z.string().trim().min(1),
    unavailable: z.string().trim().min(1),
  }),
});

export const negocioInputSchema = z.object({
  slug: negocioSlugSchema,
  name: z.string().trim().min(1, "El nombre del negocio es obligatorio").max(100),
  description: z.string().trim().min(1, "La descripción es obligatoria").max(500),
  active: z.boolean(),
  plan: negocioPlanSchema,
  branding: negocioBrandingSchema,
  configuracion: negocioConfigurationSchema,
  ownerUid: z.string().trim().min(1, "El ownerUid es obligatorio"),
  staffUids: z.array(z.string().trim().min(1)).default([]),
});

export const negocioPatchSchema = z.object({
  slug: negocioSlugSchema.optional(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  active: z.boolean().optional(),
  plan: negocioPlanSchema.optional(),
  branding: negocioBrandingSchema.partial().optional(),
  configuracion: negocioConfigurationSchema.partial().optional(),
  ownerUid: z.string().trim().min(1).optional(),
  staffUids: z.array(z.string().trim().min(1)).optional(),
});

export const usuarioNegocioSchema = z.object({
  uid: z.string().trim().min(1),
  negocioId: z.string().trim().min(1),
  role: z.enum(["owner", "staff", "admin"]),
  active: z.boolean(),
});

