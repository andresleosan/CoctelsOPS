import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import { getAdminDb } from "@/lib/firebase-admin";
import { ORDER_STATUSES, type OrderStatus } from "@/types/orders";

export async function GET(request: Request): Promise<Response> {
  try {
    const parsedScope = z.enum(["orders", "products", "customers"]).safeParse(new URL(request.url).searchParams.get("scope") ?? "orders");
    if (!parsedScope.success) return Response.json({ error: "El alcance de estadísticas no es válido" }, { status: 422 });
    const scope = parsedScope.data;
    const permission = scope === "orders" ? "pedidos.read" : scope === "products" ? "productos.read" : "clientes.read";
    await requirePermission(request as never, permission);
    const db = getAdminDb();
    if (scope === "products") {
      return Response.json({ stats: { activeProducts: (await db.collection("productos").where("active", "==", true).get()).size } });
    }
    if (scope === "customers") {
      return Response.json({ stats: { customers: (await db.collection("users").where("accountType", "==", "customer").get()).size } });
    }

    const ordersSnapshot = await db.collection("pedidos").orderBy("createdAt", "desc").get();
    const byStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>;
    let revenue = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    for (const document of ordersSnapshot.docs) {
      const data = document.data() as { status?: unknown; total?: unknown };
      if (typeof data.status === "string" && data.status in byStatus) byStatus[data.status as OrderStatus] += 1;
      if (data.status !== "cancelado" && typeof data.total === "number") revenue += data.total;
      const orderRating = (data as { rating?: { stars?: unknown } }).rating;
      if (orderRating && typeof orderRating.stars === "number" && orderRating.stars >= 1 && orderRating.stars <= 5) {
        ratingSum += orderRating.stars;
        ratingCount += 1;
      }
    }
    const csat = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : undefined;
    return Response.json({ stats: { orders: ordersSnapshot.size, pending: byStatus.pendiente, revenue, byStatus, csat, ratingCount } });
  } catch (error) {
    return toAuthorizationResponse(error);
  }
}
