import { z } from "zod";

import { isGlobalAdmin, requireNegocioAccess, requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import { getAdminDb } from "@/lib/firebase-admin";
import { ORDER_STATUSES, type OrderStatus } from "@/types/orders";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

function resolveDocumentNegocioId(data: Record<string, unknown>): string {
  return typeof data.negocioId === "string" && data.negocioId.trim()
    ? data.negocioId.trim()
    : DEFAULT_TENANT_ID;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parsedScope = z
      .enum(["orders", "products", "customers"])
      .safeParse(url.searchParams.get("scope") ?? "orders");
    if (!parsedScope.success) {
      return Response.json({ error: "El alcance de estadísticas no es válido" }, { status: 422 });
    }
    const scope = parsedScope.data;
    const permission =
      scope === "orders"
        ? "pedidos.read"
        : scope === "products"
          ? "productos.read"
          : "clientes.read";
    const actor = await requirePermission(request as never, permission);

    const requestedNegocioId = url.searchParams.get("negocioId")?.trim() || undefined;
    let scopedNegocioId: string | undefined;

    if (isGlobalAdmin(actor)) {
      scopedNegocioId = requestedNegocioId;
    } else if (requestedNegocioId) {
      requireNegocioAccess(actor, requestedNegocioId);
      scopedNegocioId = requestedNegocioId;
    } else {
      scopedNegocioId = actor.profile?.negocioId?.trim() || DEFAULT_TENANT_ID;
    }

    const db = getAdminDb();
    if (scope === "products") {
      const productsSnapshot =
        scopedNegocioId && scopedNegocioId !== DEFAULT_TENANT_ID
          ? await db
              .collection("productos")
              .where("active", "==", true)
              .where("negocioId", "==", scopedNegocioId)
              .get()
          : await db.collection("productos").where("active", "==", true).get();

      const activeProducts = scopedNegocioId
        ? productsSnapshot.docs.filter(
            (doc) =>
              resolveDocumentNegocioId((doc.data() ?? {}) as Record<string, unknown>) ===
              scopedNegocioId,
          ).length
        : productsSnapshot.size;

      return Response.json({ stats: { activeProducts } });
    }

    if (scope === "customers") {
      if (!scopedNegocioId) {
        return Response.json({
          stats: {
            customers: (await db.collection("users").where("accountType", "==", "customer").get())
              .size,
          },
        });
      }

      const ordersForCustomers =
        scopedNegocioId !== DEFAULT_TENANT_ID
          ? await db.collection("pedidos").where("negocioId", "==", scopedNegocioId).get()
          : await db.collection("pedidos").get();

      const customerUids = new Set<string>();
      for (const document of ordersForCustomers.docs) {
        const data = (document.data() ?? {}) as Record<string, unknown>;
        if (resolveDocumentNegocioId(data) !== scopedNegocioId) continue;
        if (typeof data.clienteUid === "string" && data.clienteUid.trim()) {
          customerUids.add(data.clienteUid.trim());
        }
      }

      const usersSnap =
        scopedNegocioId !== DEFAULT_TENANT_ID
          ? await db
              .collection("users")
              .where("accountType", "==", "customer")
              .where("negocioId", "==", scopedNegocioId)
              .get()
          : await db.collection("users").where("accountType", "==", "customer").get();

      for (const userDoc of usersSnap.docs) {
        const userData = (userDoc.data() ?? {}) as Record<string, unknown>;
        if (resolveDocumentNegocioId(userData) === scopedNegocioId) {
          customerUids.add(userDoc.id);
        }
      }

      return Response.json({ stats: { customers: customerUids.size } });
    }

    const ordersSnapshot =
      scopedNegocioId && scopedNegocioId !== DEFAULT_TENANT_ID
        ? await db.collection("pedidos").where("negocioId", "==", scopedNegocioId).get()
        : await db.collection("pedidos").orderBy("createdAt", "desc").get();

    const byStatus = Object.fromEntries(
      ORDER_STATUSES.map((status) => [status, 0]),
    ) as Record<OrderStatus, number>;
    let revenue = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    let ordersCount = 0;

    for (const document of ordersSnapshot.docs) {
      const data = (document.data() ?? {}) as Record<string, unknown>;
      if (scopedNegocioId && resolveDocumentNegocioId(data) !== scopedNegocioId) {
        continue;
      }
      ordersCount += 1;
      if (typeof data.status === "string" && data.status in byStatus) {
        byStatus[data.status as OrderStatus] += 1;
      }
      if (data.status !== "cancelado" && typeof data.total === "number") {
        revenue += data.total;
      }
      const orderRating = (data as { rating?: { stars?: unknown } }).rating;
      if (
        orderRating &&
        typeof orderRating.stars === "number" &&
        orderRating.stars >= 1 &&
        orderRating.stars <= 5
      ) {
        ratingSum += orderRating.stars;
        ratingCount += 1;
      }
    }

    const csat = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : undefined;
    return Response.json({
      stats: {
        orders: ordersCount,
        pending: byStatus.pendiente,
        revenue,
        byStatus,
        csat,
        ratingCount,
      },
    });
  } catch (error) {
    return toAuthorizationResponse(error);
  }
}
