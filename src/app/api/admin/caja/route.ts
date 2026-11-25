import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  addCashExpense,
  addCashTip,
  CashRegisterError,
  closeCashShift,
  getCashDashboardStateForCaller,
  openCashShift,
} from "@/lib/firestore/cash-register";
import { cashRegisterActionSchema } from "@/lib/validation/cash-register";

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 422 });
  }
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
    const dashboard = await getCashDashboardStateForCaller(
      actor,
      url.searchParams.get("negocioId"),
    );
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

    if (parsed.action === "tip") {
      const shift = await addCashTip(actor, {
        shiftId: parsed.shiftId,
        amount: parsed.amount,
        source: parsed.source,
        channel: parsed.channel,
        orderId: parsed.orderId,
        notes: parsed.notes,
      });
      return Response.json({ shift });
    }

    const shift = await closeCashShift(actor, {
      shiftId: parsed.shiftId,
      countBreakdown: parsed.countBreakdown,
      closingNotes: parsed.closingNotes,
      staffSettlement: parsed.staffSettlement,
    });
    return Response.json({ shift });
  } catch (error) {
    return errorResponse(error);
  }
}
