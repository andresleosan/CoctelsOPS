import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  addRoundToBarTab,
  BarTabError,
  cancelBarTab,
  closeBarTab,
  listBarTabsForCaller,
  openBarTab,
} from "@/lib/firestore/tabs";
import { OrderValidationError } from "@/lib/validation/orders";
import { barTabActionSchema } from "@/lib/validation/tabs";

function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 422 });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Datos de mesa inválidos" },
      { status: 422 },
    );
  }
  if (error instanceof OrderValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof BarTabError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return toAuthorizationResponse(error);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "pedidos.read");
    const url = new URL(request.url);
    const tabs = await listBarTabsForCaller(actor, url.searchParams.get("negocioId"));
    return Response.json({ tabs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "pedidos.update");
    const json = await request.json();
    const parsed = barTabActionSchema.parse(json);

    if (parsed.action === "open") {
      const tab = await openBarTab(actor, {
        negocioId: parsed.negocioId,
        tableNumber: parsed.tableNumber,
        customerName: parsed.customerName,
        guestCount: parsed.guestCount,
      });
      return Response.json({ tab }, { status: 201 });
    }

    if (parsed.action === "add_round") {
      const result = await addRoundToBarTab(actor, {
        tabId: parsed.tabId,
        items: parsed.items,
        notes: parsed.notes,
      });
      return Response.json(result, { status: 201 });
    }

    if (parsed.action === "close") {
      const tab = await closeBarTab(actor, {
        tabId: parsed.tabId,
        splitMode: parsed.splitMode,
        guestCount: parsed.guestCount,
        payments: parsed.payments,
        closingNotes: parsed.closingNotes,
      });
      return Response.json({ tab });
    }

    const tab = await cancelBarTab(actor, {
      tabId: parsed.tabId,
      reason: parsed.reason,
    });
    return Response.json({ tab });
  } catch (error) {
    return errorResponse(error);
  }
}
