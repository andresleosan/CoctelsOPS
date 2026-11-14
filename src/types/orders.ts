import type { LoyaltyRewardId } from "@/types/loyalty";
import type { OrderEscandalloSummary } from "@/types/recipes";

export const ORDER_STATUSES = [
  "pendiente",
  "confirmado",
  "preparando",
  "en_camino",
  "entregado",
  "cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SERVICE_TYPES = ["delivery", "mesa", "pickup"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const POS_PAYMENT_METHODS = [
  "efectivo",
  "nequi",
  "daviplata",
  "qr",
  "mixto",
] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

export const POS_DIGITAL_CHANNELS = ["nequi", "daviplata", "qr"] as const;
export type PosDigitalChannel = (typeof POS_DIGITAL_CHANNELS)[number];

export type OrderPaymentBreakdown = {
  cashAmount: number;
  cashReceived: number;
  changeAmount: number;
  digitalAmount: number;
  digitalMethod?: PosDigitalChannel;
  digitalReference?: string;
};

export type OrderCustomization = {
  size: string;
  flavors: string[];
  addOns: string[];
};

export type CheckoutItemInput = {
  productId: string;
  quantity: number;
  customization: OrderCustomization;
};

export type CreateOrderInput = {
  customerName: string;
  phone: string;
  address: string;
  notes?: string;
  serviceType?: ServiceType;
  tableNumber?: string;
  items: CheckoutItemInput[];
  promotionCode?: string;
  loyaltyRewardId?: LoyaltyRewardId;
  paymentMethod?: PosPaymentMethod;
  paymentBreakdown?: OrderPaymentBreakdown;
};

export type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  customization: OrderCustomization;
};

export type StatusUpdate = {
  status: OrderStatus;
  reason?: string;
};

export type OrderAudit = {
  createdByUid: string;
  createdAt: string;
  updatedByUid?: string;
  updatedAt?: string;
};

export type OrderStatusHistoryEntry = {
  status: OrderStatus;
  actorUid?: string;
  at: string;
  reason?: string;
};

export type OrderRating = {
  stars: number;
  tags?: string[];
  comment?: string;
  createdAt: string;
};

export type OrderRatingInput = {
  stars: number;
  tags?: string[];
  comment?: string;
};

export type Order = {
  id: string;
  clienteUid: string;
  customerName: string;
  phone: string;
  address: string;
  notes?: string;
  serviceType?: ServiceType;
  tableNumber?: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  audit: OrderAudit;
  statusHistory?: OrderStatusHistoryEntry[];
  promotionCode?: string;
  loyaltyRewardId?: LoyaltyRewardId;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscount?: number;
  paymentMethod?: PosPaymentMethod;
  paymentBreakdown?: OrderPaymentBreakdown;
  rating?: OrderRating;
  negocioId?: string;
  suppliesDepletedAt?: string;
  suppliesDepletedOnStatus?: "preparando" | "entregado";
  escandallo?: OrderEscandalloSummary;
  legacy?: boolean;
  historical?: boolean;
};

export type CustomerStatusHistoryEntry = Pick<OrderStatusHistoryEntry, "status" | "at" | "reason">;

export type CustomerOrder = Omit<
  Order,
  "audit" | "clienteUid" | "statusHistory" | "escandallo" | "suppliesDepletedAt" | "suppliesDepletedOnStatus"
> & {
  statusHistory: CustomerStatusHistoryEntry[];
  rating?: OrderRating;
};
