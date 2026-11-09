import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  getSupplyById,
  recordSupplyMovement,
  SupplyValidationError,
} from "@/lib/firestore/supplies";
import { recordSupplyMovementSchema } from "@/lib/validation/supplies";

function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Movimiento inválido" },
      { status: 422 }
    );
  }
  if (error instanceof SupplyValidationError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  return toAuthorizationResponse(error);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "inventario.write");
    const { id } = await context.params;
    const json = await request.json();
    const input = recordSupplyMovementSchema.parse(json);

    const movement = await recordSupplyMovement({
      supplyId: id,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason,
      actorUid: actor.uid,
      actorEmail: actor.profile.email,
    });

    const updatedSupply = await getSupplyById(id);

    return Response.json({ movement, supply: updatedSupply }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
