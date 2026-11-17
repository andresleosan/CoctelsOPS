import { z } from "zod";

import { esTokenAdminVerificado } from "@/lib/auth-claims";
import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse, verifyRequest } from "@/lib/auth/verify-request";
import { listAdminNotifications, listNotifications, markNotificationRead } from "@/lib/firestore/notifications";

export async function GET(request: Request): Promise<Response> {
  try {
    const adminView = new URL(request.url).searchParams.get("admin") === "true";
    if (adminView) { await requirePermission(request as never, "notificaciones.read"); return Response.json({ notifications: await listAdminNotifications() }); }
    const user = await verifyRequest(request as never);
    return Response.json({ notifications: await listNotifications(user.uid) });
  } catch (error) { return toAuthorizationResponse(error); }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = await requirePermission(request as never, "notificaciones.read");
    const input = z.object({ id: z.string().trim().min(1) }).parse(await request.json());
    await markNotificationRead(
      input.id,
      user.uid,
      esTokenAdminVerificado(user.token) && user.profile.accountType === "admin",
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Notificación inválida" }, { status: 422 });
    return toAuthorizationResponse(error);
  }
}
