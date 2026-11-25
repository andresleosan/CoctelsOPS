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
  "transferencia",
  "nequi",
  "daviplata",
  "qr",
  "mixto",
] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

export const POS_DIGITAL_CHANNELS = ["transferencia", "nequi", "daviplata", "qr"] as const;
export type PosDigitalChannel = (typeof POS_DIGITAL_CHANNELS)[number];

export const PAYMENT_VERIFICATION_STATUSES = [
  "pendiente_verificacion",
  "verificado",
  "rechazado",
] as const;
export type PaymentVerificationStatus = (typeof PAYMENT_VERIFICATION_STATUSES)[number];

export const PAYMENT_GATEWAY_PROVIDERS = ["wompi", "bold"] as const;
export type PaymentGatewayProvider = (typeof PAYMENT_GATEWAY_PROVIDERS)[number];

export const PAYMENT_GATEWAY_STATUSES = [
  "approved",
  "declined",
  "voided",
  "pending",
  "error",
] as const;
export type PaymentGatewayStatus = (typeof PAYMENT_GATEWAY_STATUSES)[number];

export type OrderPaymentGateway = {
  provider: PaymentGatewayProvider;
  transactionId: string;
  eventId: string;
  status: PaymentGatewayStatus;
  amountCop: number;
  currency: string;
  channel?: PosDigitalChannel;
  tipAmountCop?: number;
  confirmedAt: string;
  rawStatus?: string;
};

export type CustomerOrderPaymentGateway = Pick<
  OrderPaymentGateway,
  "provider" | "status" | "channel" | "confirmedAt"
>;

export type OnlinePaymentGatewayOption = {
  provider: PaymentGatewayProvider;
  label: string;
  subtitle: string;
  mode: "test" | "live";
};

export type PaymentCheckoutSession = {
  provider: PaymentGatewayProvider;
  mode: "test" | "live";
  orderId: string;
  reference: string;
  currency: "COP";
  amountCop: number;
  amountInCents: number;
  publicKey: string;
  integritySignature: string;
  redirectUrl: string;
  checkoutUrl: string;
  description: string;
  createdAt: string;
};

export type PaymentProofContentType = "image/jpeg" | "image/png" | "image/webp";

export type OrderPaymentProof = {
  url: string;
  key: string;
  contentType: PaymentProofContentType;
  uploadedAt: string;
  uploadedByUid: string;
  channel?: PosDigitalChannel;
  reference?: string;
};

export type OrderPaymentVerification = {
  status: PaymentVerificationStatus;
  updatedAt: string;
  updatedByUid?: string;
  updatedByName?: string;
  reason?: string;
};

export type VerifyOrderPaymentInput = {
  status: PaymentVerificationStatus;
  reason?: string;
};

export type CustomerOrderPaymentProof = Pick<
  OrderPaymentProof,
  "url" | "uploadedAt" | "channel" | "reference"
>;

export type CustomerOrderPaymentVerification = Pick<
  OrderPaymentVerification,
  "status" | "updatedAt" | "reason"
>;

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

export type OrderAssignedDriver = {
  uid?: string;
  name: string;
  phone?: string;
  assignedAt: string;
  assignedByUid: string;
};

export type AssignOrderDriverInput = {
  uid?: string;
  name: string;
  phone?: string;
} | null;

export type CustomerOrderAssignedDriver = Pick<OrderAssignedDriver, "name" | "assignedAt">;

export type CreateOrderInput = {
  customerName: string;
  phone: string;
  address: string;
  notes?: string;
  serviceType?: ServiceType;
  tableNumber?: string;
  deliveryZoneId?: string;
  deliveryZoneName?: string;
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
  paymentVerificationStatus?: PaymentVerificationStatus;
  paymentProof?: OrderPaymentProof;
  paymentVerification?: OrderPaymentVerification;
  paymentGateway?: OrderPaymentGateway;
  deliveryZoneId?: string;
  deliveryZoneName?: string;
  deliveryFee?: number;
  estimatedDeliveryMinutes?: number;
  assignedDriver?: OrderAssignedDriver;
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
  | "audit"
  | "clienteUid"
  | "statusHistory"
  | "escandallo"
  | "suppliesDepletedAt"
  | "suppliesDepletedOnStatus"
  | "paymentProof"
  | "paymentVerification"
  | "paymentGateway"
  | "assignedDriver"
> & {
  statusHistory: CustomerStatusHistoryEntry[];
  rating?: OrderRating;
  paymentProof?: CustomerOrderPaymentProof;
  paymentVerification?: CustomerOrderPaymentVerification;
  paymentGateway?: CustomerOrderPaymentGateway;
  assignedDriver?: CustomerOrderAssignedDriver;
};
