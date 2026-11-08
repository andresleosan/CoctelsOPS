export const LOYALTY_POINTS_PER_UNIT_COP = 1000;
export const LOYALTY_MIN_ORDER_FOR_STAMP_COP = 10000;
export const LOYALTY_STAMPS_PER_CARD = 10;

export type LoyaltyTierId = "bronce" | "plata" | "oro";

export type LoyaltyTier = {
  id: LoyaltyTierId;
  name: string;
  minLifetimePoints: number;
  nextTierMinPoints: number | null;
  badgeColor: string;
  perkDescription: string;
};

export const LOYALTY_TIERS: readonly LoyaltyTier[] = [
  {
    id: "bronce",
    name: "Bronce Neón",
    minLifetimePoints: 0,
    nextTierMinPoints: 50,
    badgeColor: "text-amber-400 border-amber-400/30 bg-amber-500/10",
    perkDescription: "Acumula 1 pto por cada $1.000 COP en pedidos entregados.",
  },
  {
    id: "plata",
    name: "Plata Cyber",
    minLifetimePoints: 50,
    nextTierMinPoints: 150,
    badgeColor: "text-cyan-300 border-cyan-400/30 bg-cyan-500/10",
    perkDescription: "Desbloquea bonos de descuento directo y toppings de cortesía.",
  },
  {
    id: "oro",
    name: "Oro Opsy VIP",
    minLifetimePoints: 150,
    nextTierMinPoints: null,
    badgeColor: "text-primary border-primary/40 bg-primary/15",
    perkDescription: "Nivel máximo VIP: acceso a cócteles y granizados de cortesía.",
  },
] as const;

export type LoyaltyRewardId = "TOP_GRATIS" | "DESC_5000" | "COCTEL_CORTESIA";

export type LoyaltyReward = {
  id: LoyaltyRewardId;
  title: string;
  description: string;
  pointsCost: number;
  maxDiscountCop: number;
  minSubtotalCop: number;
};

export const LOYALTY_REWARDS: readonly LoyaltyReward[] = [
  {
    id: "TOP_GRATIS",
    title: "Topping / Adición Gratis",
    description: "Descuento de hasta $3.000 COP para cubrir tu adición favorita.",
    pointsCost: 25,
    maxDiscountCop: 3000,
    minSubtotalCop: 10000,
  },
  {
    id: "DESC_5000",
    title: "Bono Neón $5.000 COP",
    description: "Descuento directo de $5.000 COP en tu pedido.",
    pointsCost: 50,
    maxDiscountCop: 5000,
    minSubtotalCop: 12000,
  },
  {
    id: "COCTEL_CORTESIA",
    title: "Cóctel o Granizado de Cortesía",
    description: "Cubre hasta $15.000 COP equivalentes a una bebida de 8 oz a 16 oz.",
    pointsCost: 100,
    maxDiscountCop: 15000,
    minSubtotalCop: 15000,
  },
] as const;

export type LoyaltyHistoryEntry = {
  orderId: string;
  createdAt: string;
  orderTotal: number;
  pointsEarned: number;
  pointsRedeemed: number;
  rewardId?: LoyaltyRewardId;
  earnedStamp: boolean;
  status: string;
};

export type LoyaltySummary = {
  availablePoints: number;
  lifetimeEarnedPoints: number;
  totalRedeemedPoints: number;
  totalStamps: number;
  stampsInCurrentCard: number;
  stampsPerCard: number;
  completedStampCards: number;
  deliveredOrdersCount: number;
  tier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number;
  redeemableRewards: LoyaltyReward[];
  allRewards: readonly LoyaltyReward[];
  recentActivity: LoyaltyHistoryEntry[];
};
