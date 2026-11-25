import { z } from "zod";

import { requirePermission, resolveAuthorizedNegocioId } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  calculateSuppliesKpis,
  createSupply,
  listSupplies,
  SupplyValidationError,
} from "@/lib/firestore/supplies";
import { createSupplySchema } from "@/lib/validation/supplies";

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 422 });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Datos de insumo inválidos" },
      { status: 422 }
    );
  }
  if (error instanceof SupplyValidationError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  return toAuthorizationResponse(error);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "inventario.read");
    const url = new URL(request.url);
    const negocioId = resolveAuthorizedNegocioId(actor, url.searchParams.get("negocioId"));

    const supplies = await listSupplies(negocioId);
    const kpis = calculateSuppliesKpis(supplies);

    return Response.json({ supplies, kpis });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "inventario.write");
    const json = await request.json();
    const input = createSupplySchema.parse(json);
    const targetNegocioId = resolveAuthorizedNegocioId(actor, input.negocioId);

    const supply = await createSupply({ ...input, negocioId: targetNegocioId }, actor.uid);
    return Response.json({ supply }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
