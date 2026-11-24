import "server-only";

import { z } from "zod";

import { getRateLimitIdentity, hashRateLimitIdentity } from "@/lib/ai/ai-rate-limit";
import { verifyToken } from "@/lib/auth/verify-request";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  addPublicRoundToTableTab,
  BarTabError,
  getPublicTableTab,
  requestTableBill,
  reserveTableActionRateLimit,
} from "@/lib/firestore/tabs";
import { getNegocioById, getNegocioBySlug } from "@/lib/firestore/tenant";
import { getTableLookupKey, isPickupTableIdentifier } from "@/lib/tabs/calculator";
import { OrderValidationError } from "@/lib/validation/orders";
import { publicTableActionSchema, publicTableIdSchema } from "@/lib/validation/tabs";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

type OptionalActor = {
  uid: string;
  name?: string;
};

function decodeAndValidateMesaId(rawMesaId: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawMesaId);
  } catch {
    throw new BarTabError(422, "Identificador de mesa inválido");
  }

  const parsed = publicTableIdSchema.parse(decoded);
  if (isPickupTableIdentifier(parsed)) {
    throw new BarTabError(422, "El modo retiro en barra no utiliza cuenta de mesa en vivo.");
  }

  return parsed;
}

async function resolveTenantNegocioId(
  negocioId?: string | null,
  slug?: string | null,
): Promise<string> {
  const cleanSlug = slug?.trim();
  if (cleanSlug) {
    const negocio = await getNegocioBySlug(cleanSlug);
    if (!negocio) {
      throw new BarTabError(404, "El local especificado no está disponible.");
    }
    return negocio.id;
  }

  const cleanNegocioId = negocioId?.trim();
  if (cleanNegocioId && cleanNegocioId !== DEFAULT_TENANT_ID) {
    const negocio = await getNegocioById(cleanNegocioId);
    if (!negocio || !negocio.active) {
      throw new BarTabError(404, "El local especificado no está disponible.");
    }
    return negocio.id;
  }

  return DEFAULT_TENANT_ID;
}

async function resolveOptionalActor(request: Request): Promise<OptionalActor | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !/^Bearer\s+[^\s]+$/i.test(authHeader)) {
    return null;
  }

  try {
    const token = await verifyToken(request);
    return {
      uid: token.uid,
      name: typeof token.name === "string" && token.name.trim() ? token.name.trim() : undefined,
    };
  } catch {
    return null;
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json(
      { error: "Cuerpo de solicitud JSON inválido" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Datos de mesa inválidos" },
      { status: 422, headers: NO_STORE_HEADERS },
    );
  }
  if (error instanceof OrderValidationError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }
  if (error instanceof BarTabError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }
  return Response.json(
    { error: "No fue posible procesar la solicitud de la mesa" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ mesaId: string }> },
): Promise<Response> {
  try {
    const { mesaId: rawMesaId } = await context.params;
    const mesaId = decodeAndValidateMesaId(rawMesaId);
    const url = new URL(request.url);
    const negocioId = await resolveTenantNegocioId(
      url.searchParams.get("negocioId"),
      url.searchParams.get("slug"),
    );

    const data = await getPublicTableTab(negocioId, mesaId);
    return Response.json(
      {
        tableNumber: data.tableNumber,
        negocioId,
        tab: data.tab,
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ mesaId: string }> },
): Promise<Response> {
  try {
    const { mesaId: rawMesaId } = await context.params;
    const mesaId = decodeAndValidateMesaId(rawMesaId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Cuerpo de solicitud JSON inválido" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const parsed = publicTableActionSchema.parse(body);
    const url = new URL(request.url);
    const negocioId = await resolveTenantNegocioId(
      parsed.negocioId ?? url.searchParams.get("negocioId"),
      parsed.slug ?? url.searchParams.get("slug"),
    );

    const identity = getRateLimitIdentity(request.headers);
    const secret =
      process.env.TABLE_RATE_LIMIT_SECRET ||
      process.env.AI_RATE_LIMIT_SECRET ||
      "coctels-ops-table-secret";
    const digest = hashRateLimitIdentity(
      `${identity}:${negocioId}:${getTableLookupKey(mesaId)}`,
      secret,
    );

    try {
      const isAllowed = await reserveTableActionRateLimit({
        db: getAdminDb(),
        digest,
      });

      if (!isAllowed) {
        return Response.json(
          {
            error:
              "Has enviado muchas solicitudes seguidas para esta mesa. Intenta de nuevo en unos minutos.",
            code: "RATE_LIMITED",
            retryAfter: 600,
          },
          {
            status: 429,
            headers: {
              ...NO_STORE_HEADERS,
              "Retry-After": "600",
            },
          },
        );
      }
    } catch {
      // Fallback seguro si el contador transitorio falla
    }

    const actor = await resolveOptionalActor(request);

    if (parsed.action === "add_round") {
      const idempotencyKey = request.headers.get("idempotency-key")?.trim() || undefined;
      const result = await addPublicRoundToTableTab({
        negocioId,
        tableNumber: mesaId,
        items: parsed.items,
        customerName: parsed.customerName,
        guestCount: parsed.guestCount,
        notes: parsed.notes,
        idempotencyKey,
        actorUid: actor?.uid,
        actorName: actor?.name,
      });

      return Response.json(result, {
        status: result.idempotentReplay ? 200 : 201,
        headers: NO_STORE_HEADERS,
      });
    }

    const result = await requestTableBill({
      negocioId,
      tableNumber: mesaId,
      splitMode: parsed.splitMode,
      guestCount: parsed.guestCount,
      preferredMethod: parsed.preferredMethod,
      notes: parsed.notes,
      actorUid: actor?.uid,
    });

    return Response.json(result, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
