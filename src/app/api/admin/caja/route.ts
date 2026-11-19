import { z } from "zod";

import { requireNegocioAccess, requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  addCashExpense,
  CashRegisterError,
  closeCashShift,
  getCashDashboardState,
  openCashShift,
} from "@/lib/firestore/cash-register";
import { cashRegisterActionSchema } from "@/lib/validation/cash-register";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Datos de caja inválidos" },
      { status: 422 },
    );
  }
  if (error instanceof CashRegisterError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return toAuthorizationResponse(error);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "pedidos.read");
    const url = new URL(request.url);
    const negocioId =
      url.searchParams.get("negocioId")?.trim() ||
      actor.profile.negocioId?.trim() ||
      DEFAULT_TENANT_ID;

    requireNegocioAccess(actor, negocioId);

    const dashboard = await getCashDashboardState(negocioId);
    return Response.json(dashboard);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "pedidos.update");
    const json = await request.json();
    const parsed = cashRegisterActionSchema.parse(json);

    if (parsed.action === "open") {
      const shift = await openCashShift(actor, {
        negocioId: parsed.negocioId,
        openingBase: parsed.openingBase,
        openingNotes: parsed.openingNotes,
      });
      return Response.json({ shift }, { status: 201 });
    }

    if (parsed.action === "expense") {
      const shift = await addCashExpense(actor, {
        shiftId: parsed.shiftId,
        concept: parsed.concept,
        category: parsed.category,
        amount: parsed.amount,
        notes: parsed.notes,
      });
      return Response.json({ shift });
    }

    const shift = await closeCashShift(actor, {
      shiftId: parsed.shiftId,
      countBreakdown: parsed.countBreakdown,
      closingNotes: parsed.closingNotes,
    });
    return Response.json({ shift });
  } catch (error) {
    return errorResponse(error);
  }
}
