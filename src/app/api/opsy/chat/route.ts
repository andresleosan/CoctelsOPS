import "server-only";

import { z } from "zod";
import { getAdminDb } from "@/lib/firebase-admin";
import { getRateLimitIdentity, hashRateLimitIdentity, reserveAIRateLimit } from "@/lib/ai/ai-rate-limit";
import { listActiveProducts, listActiveProductsByNegocio } from "@/lib/firestore/products";
import { getStoreConfiguration } from "@/lib/firestore/configuration";
import { getActivePromotions } from "@/lib/firestore/promotions";
import { getNegocioById, getNegocioBySlug } from "@/lib/firestore/tenant";
import { processOpsyChat, type OpsyStoreConfig } from "@/lib/ai/opsy-guardrails";
import type { Negocio } from "@/types/tenant";

export const dynamic = "force-dynamic";

const opsyChatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "El mensaje no puede estar vacío")
    .max(1000, "El mensaje no puede exceder 1.000 caracteres"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(1000, "Cada turno de historial no puede exceder 1.000 caracteres"),
      })
    )
    .max(8, "El historial no puede exceder 8 turnos")
    .optional()
    .default([]),
  negocioId: z.string().trim().max(80).optional(),
  tenantSlug: z.string().trim().max(80).optional(),
  preferences: z
    .object({
      alcoholFree: z.boolean().optional(),
      flavorProfile: z.enum(["all", "citrico", "dulce", "tropical", "frutal"]).optional(),
      happyHourOnly: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Cuerpo de solicitud JSON inválido" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const parseResult = opsyChatRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]?.message || "Datos de entrada inválidos";
    return Response.json(
      { error: issue },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { message, history, negocioId, tenantSlug, preferences } = parseResult.data;

  // Rate Limiting atómico en servidor (5 consultas cada 10 min por IP)
  const identity = getRateLimitIdentity(request.headers);
  const secret = process.env.AI_RATE_LIMIT_SECRET || "coctels-ops-ai-secret";
  const digest = hashRateLimitIdentity(identity, secret);

  try {
    const isAllowed = await reserveAIRateLimit({
      db: getAdminDb(),
      digest,
    });

    if (!isAllowed) {
      return Response.json(
        {
          error: "Has alcanzado el límite de 5 consultas cada 10 minutos con Opsy Bot. ¡Parce, tómate un respiro y ya casi volvemos!",
          code: "RATE_LIMITED",
          retryAfter: 600,
        },
        {
          status: 429,
          headers: {
            "Retry-After": "600",
            "Cache-Control": "no-store",
          },
        }
      );
    }
  } catch (error) {
    console.error("[Opsy Bot API] Error verificando rate limit:", error);
  }

  try {
    let negocio: Negocio | null = null;
    if (negocioId) {
      negocio = await getNegocioById(negocioId).catch(() => null);
    } else if (tenantSlug) {
      negocio = await getNegocioBySlug(tenantSlug).catch(() => null);
    }

    const effectiveNegocioId = negocioId || negocio?.id;
    let products = effectiveNegocioId
      ? await listActiveProductsByNegocio(effectiveNegocioId)
      : await listActiveProducts();

    if (!negocioId && negocio && products.length === 0) {
      products = await listActiveProducts();
    }

    const [fallbackConfig, promotionsData] = await Promise.all([
      negocio?.configuracion
        ? Promise.resolve<OpsyStoreConfig>(negocio.configuracion)
        : getStoreConfiguration({ allowDefaults: true }).catch(() => null),
      getActivePromotions().catch(() => ({ activeHappyHours: [], todayScheduled: [] })),
    ]);

    const tenantContext =
      negocio || effectiveNegocioId || tenantSlug
        ? {
            ...(effectiveNegocioId ? { id: effectiveNegocioId } : {}),
            ...(negocio?.slug || tenantSlug ? { slug: negocio?.slug ?? tenantSlug } : {}),
            ...(negocio?.name ? { name: negocio.name } : {}),
          }
        : undefined;

    const chatReply = await processOpsyChat({
      message,
      history,
      products,
      config: fallbackConfig,
      activePromotions: promotionsData.activeHappyHours,
      todayScheduledPromotions: promotionsData.todayScheduled,
      preferences,
      tenant: tenantContext,
    });

    return Response.json(chatReply, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Opsy Bot API] Error procesando chat:", error);
    return Response.json(
      {
        error: "Opsy está ocupado preparando un cóctel en la barra. Por favor intenta en un momento.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
