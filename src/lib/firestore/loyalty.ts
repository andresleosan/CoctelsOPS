import "server-only";

import { getAdminDb } from "@/lib/firebase-admin";
import {
  calculateLoyaltySummaryFromOrders,
  type LoyaltyOrderSnapshot,
} from "@/lib/loyalty/calculator";
import type { LoyaltyRewardId, LoyaltySummary } from "@/types/loyalty";
import type { Order } from "@/types/orders";

export * from "@/lib/loyalty/calculator";

/**
 * Consulta en servidor los pedidos del cliente y retorna su resumen de fidelización.
 */
export async function getUserLoyaltySummary(uid: string): Promise<LoyaltySummary> {
  if (!uid?.trim()) {
    return calculateLoyaltySummaryFromOrders([]);
  }

  const snapshot = await getAdminDb()
    .collection("pedidos")
    .where("clienteUid", "==", uid.trim())
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const orders: LoyaltyOrderSnapshot[] = snapshot.docs.map((doc) => {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    return {
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
  });

  return calculateLoyaltySummaryFromOrders(orders);
}
