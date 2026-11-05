import "server-only";

import { z } from "zod";
import { getAdminDb } from "@/lib/firebase-admin";
import { getRateLimitIdentity, hashRateLimitIdentity, reserveAIRateLimit } from "@/lib/ai/ai-rate-limit";
import { listActiveProducts, listActiveProductsByNegocio } from "@/lib/firestore/products";
import { getStoreConfiguration } from "@/lib/firestore/configuration";
import { processOpsyChat } from "@/lib/ai/opsy-guardrails";

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
  negocioId: z.string().trim().optional(),
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

  const { message, history, negocioId } = parseResult.data;

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
    // En caso de fallo transitorio en DB de rate limit, continuamos con fallback seguro
  }

  try {
    // Carga de catálogo activo respetando multi-tenant si se provee negocioId
    const products = negocioId
      ? await listActiveProductsByNegocio(negocioId)
      : await listActiveProducts();

    // Carga de configuración pública
    const config = await getStoreConfiguration({ allowDefaults: true }).catch(() => null);

    const chatReply = await processOpsyChat({
      message,
      history,
      products,
      config,
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

