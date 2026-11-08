import {
  LOYALTY_MIN_ORDER_FOR_STAMP_COP,
  LOYALTY_POINTS_PER_UNIT_COP,
  LOYALTY_REWARDS,
  LOYALTY_STAMPS_PER_CARD,
  LOYALTY_TIERS,
  type LoyaltyHistoryEntry,
  type LoyaltyReward,
  type LoyaltySummary,
  type LoyaltyTier,
} from "@/types/loyalty";
import type { Order } from "@/types/orders";

export type LoyaltyOrderSnapshot = Pick<
  Order,
  | "id"
  | "total"
  | "status"
  | "createdAt"
  | "loyaltyPointsEarned"
  | "loyaltyPointsRedeemed"
  | "loyaltyRewardId"
>;

/**
 * Calcula los Puntos Coctels ganados por un pedido entregado:
 * 1 punto por cada $1.000 COP completos pagados.
 */
export function calculateEarnedPoints(orderTotalCop: number): number {
  if (!Number.isFinite(orderTotalCop) || orderTotalCop <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(orderTotalCop / LOYALTY_POINTS_PER_UNIT_COP));
}

/**
 * Determina si un pedido otorga 1 sello digital en la tarjeta de fidelización.
 * Requiere estado 'entregado' y un monto pagado mínimo de $10.000 COP.
 */
export function qualifiesForDigitalStamp(orderTotalCop: number, status: string): boolean {
  return (
    status === "entregado" &&
    Number.isFinite(orderTotalCop) &&
    orderTotalCop >= LOYALTY_MIN_ORDER_FOR_STAMP_COP
  );
}

/**
 * Obtiene una recompensa del catálogo por su identificador.
 */
export function getLoyaltyRewardById(rewardId: string | undefined | null): LoyaltyReward | null {
  if (!rewardId) return null;
  const normalized = rewardId.trim().toUpperCase();
  return LOYALTY_REWARDS.find((reward) => reward.id === normalized) ?? null;
}

/**
 * Resuelve el nivel VIP del cliente según los puntos históricos acumulados.
 */
export function resolveLoyaltyTier(lifetimeEarnedPoints: number): {
  tier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number;
} {
  const safePoints = Math.max(0, Math.floor(lifetimeEarnedPoints));
  let currentTierIndex = 0;

  for (let i = 0; i < LOYALTY_TIERS.length; i += 1) {
    if (safePoints >= LOYALTY_TIERS[i].minLifetimePoints) {
      currentTierIndex = i;
    }
  }

  const tier = LOYALTY_TIERS[currentTierIndex];
  const nextTier =
    currentTierIndex + 1 < LOYALTY_TIERS.length ? LOYALTY_TIERS[currentTierIndex + 1] : null;
  const pointsToNextTier = nextTier ? Math.max(0, nextTier.minLifetimePoints - safePoints) : 0;

  return { tier, nextTier, pointsToNextTier };
}

export type LoyaltyRedemptionResult = {
  applied: boolean;
  reward?: LoyaltyReward;
  pointsCost: number;
  discount: number;
  total: number;
  reason?: string;
};

/**
 * Valida y calcula el descuento en COP al canjear una recompensa con Puntos Coctels.
 */
export function calculateLoyaltyRedemption(params: {
  rewardId: string;
  availablePoints: number;
  subtotalAfterPromo: number;
}): LoyaltyRedemptionResult {
  const { rewardId, availablePoints, subtotalAfterPromo } = params;
  const safeTotal = Math.max(0, Math.round(subtotalAfterPromo));
  const reward = getLoyaltyRewardById(rewardId);

  if (!reward) {
    return {
      applied: false,
      pointsCost: 0,
      discount: 0,
      total: safeTotal,
      reason: "La recompensa seleccionada no existe",
    };
  }

  if (availablePoints < reward.pointsCost) {
    return {
      applied: false,
      reward,
      pointsCost: 0,
      discount: 0,
      total: safeTotal,
      reason: `Puntos insuficientes (tienes ${availablePoints} pts y requiere ${reward.pointsCost} pts)`,
    };
  }

  if (safeTotal < reward.minSubtotalCop) {
    return {
      applied: false,
      reward,
      pointsCost: 0,
      discount: 0,
      total: safeTotal,
      reason: `Requiere un monto mínimo de $${reward.minSubtotalCop.toLocaleString("es-CO")} COP`,
    };
  }

  const discount = Math.min(reward.maxDiscountCop, safeTotal);

  return {
    applied: true,
    reward,
    pointsCost: reward.pointsCost,
    discount,
    total: Math.max(0, safeTotal - discount),
  };
}

/**
 * Consolida el estado completo de fidelización ("Puntos Coctels" y Sellos Digitales)
 * a partir del historial de pedidos del cliente.
 */
export function calculateLoyaltySummaryFromOrders(
  orders: LoyaltyOrderSnapshot[]
): LoyaltySummary {
  let lifetimeEarnedPoints = 0;
  let totalRedeemedPoints = 0;
  let totalStamps = 0;
  let deliveredOrdersCount = 0;

  const recentActivity: LoyaltyHistoryEntry[] = [];

  for (const order of orders) {
    const isDelivered = order.status === "entregado";
    const isCancelled = order.status === "cancelado";

    const earnedPoints = isDelivered
      ? typeof order.loyaltyPointsEarned === "number" && order.loyaltyPointsEarned >= 0
        ? Math.floor(order.loyaltyPointsEarned)
        : calculateEarnedPoints(order.total)
      : 0;

    const redeemedPoints =
      !isCancelled &&
      typeof order.loyaltyPointsRedeemed === "number" &&
      order.loyaltyPointsRedeemed > 0
        ? Math.floor(order.loyaltyPointsRedeemed)
        : 0;

    const earnedStamp = qualifiesForDigitalStamp(order.total, order.status);

    if (isDelivered) {
      lifetimeEarnedPoints += earnedPoints;
      deliveredOrdersCount += 1;
      if (earnedStamp) {
        totalStamps += 1;
      }
    }

    if (redeemedPoints > 0) {
      totalRedeemedPoints += redeemedPoints;
    }

    if (earnedPoints > 0 || redeemedPoints > 0) {
      recentActivity.push({
        orderId: order.id,
        createdAt: order.createdAt,
        orderTotal: order.total,
        pointsEarned: earnedPoints,
        pointsRedeemed: redeemedPoints,
        ...(order.loyaltyRewardId ? { rewardId: order.loyaltyRewardId } : {}),
        earnedStamp,
        status: order.status,
      });
    }
  }

  const availablePoints = Math.max(0, lifetimeEarnedPoints - totalRedeemedPoints);
  const stampsInCurrentCard = totalStamps % LOYALTY_STAMPS_PER_CARD;
  const completedStampCards = Math.floor(totalStamps / LOYALTY_STAMPS_PER_CARD);
  const { tier, nextTier, pointsToNextTier } = resolveLoyaltyTier(lifetimeEarnedPoints);
  const redeemableRewards = LOYALTY_REWARDS.filter((r) => availablePoints >= r.pointsCost);

  return {
    availablePoints,
    lifetimeEarnedPoints,
    totalRedeemedPoints,
    totalStamps,
    stampsInCurrentCard,
    stampsPerCard: LOYALTY_STAMPS_PER_CARD,
    completedStampCards,
    deliveredOrdersCount,
    tier,
    nextTier,
    pointsToNextTier,
    redeemableRewards,
    allRewards: LOYALTY_REWARDS,
    recentActivity: recentActivity.slice(0, 10),
  };
}
