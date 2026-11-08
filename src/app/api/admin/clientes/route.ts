import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  calculateCrmMetrics,
  consolidateCrmCustomer,
  type CrmCustomer,
} from "@/lib/customers/crm";
import { getAdminDb } from "@/lib/firebase-admin";
import type { LoyaltyOrderSnapshot } from "@/lib/firestore/loyalty";
import { listUsers } from "@/lib/firestore/users";
import type { LoyaltyRewardId } from "@/types/loyalty";
import type { Order } from "@/types/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requirePermission(request as never, "clientes.read");

    const [users, ordersSnapshot] = await Promise.all([
      listUsers(),
      getAdminDb().collection("pedidos").get(),
    ]);

    // Indexar pedidos por clienteUid
    const ordersByCustomerUid = new Map<string, LoyaltyOrderSnapshot[]>();

    for (const doc of ordersSnapshot.docs) {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const clienteUid = String(data.clienteUid ?? "").trim();
      if (!clienteUid) continue;

      const orderSnapshot: LoyaltyOrderSnapshot = {
        id: doc.id,
        total: typeof data.total === "number" ? data.total : 0,
        status: typeof data.status === "string" ? (data.status as Order["status"]) : "pendiente",
        createdAt: String(data.createdAt ?? ""),
        ...(typeof data.loyaltyPointsEarned === "number"
          ? { loyaltyPointsEarned: data.loyaltyPointsEarned }
          : {}),
        ...(typeof data.loyaltyPointsRedeemed === "number"
          ? { loyaltyPointsRedeemed: data.loyaltyPointsRedeemed }
          : {}),
        ...(typeof data.loyaltyRewardId === "string"
          ? { loyaltyRewardId: data.loyaltyRewardId as LoyaltyRewardId }
          : {}),
      };

      const existing = ordersByCustomerUid.get(clienteUid) ?? [];
      existing.push(orderSnapshot);
      ordersByCustomerUid.set(clienteUid, existing);
    }

    const customers: CrmCustomer[] = users
      .filter((user) => user.accountType === "customer")
      .map((user) => {
        const userOrders = ordersByCustomerUid.get(user.uid) ?? [];
        return consolidateCrmCustomer(user, userOrders);
      });

    const metrics = calculateCrmMetrics(customers);

    return Response.json({
      customers,
      metrics,
    });
  } catch (error) {
    return toAuthorizationResponse(error);
  }
}
