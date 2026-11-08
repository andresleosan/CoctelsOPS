import type { OrderStatus } from "@/types/orders";

export type InventoryMovementType = "entrada" | "salida" | "ajuste";

export type InventoryMovementInput = {
  productId: string;
  type: InventoryMovementType;
  quantity: number;
  reason: string;
  actorUid: string;
};

export type InventoryMovement = InventoryMovementInput & {
  id: string;
  previousStock: number;
  resultingStock: number;
  createdAt: string;
};

export type {
  ActivePromotionsResponse,
  HappyHourSchedule,
  Promotion,
  PromotionContext,
  PromotionContextItem,
  PromotionDiscountType,
  PromotionInput,
  PromotionResult,
  PromotionType,
} from "./promotions";

export type BusinessHour = { day: string; open: string; close: string; closed?: boolean };

export type StoreConfiguration = {
  whatsappNumber: string;
  businessHours: BusinessHour[];
  deliveryZones: string[];
  estimatedDeliveryMinutes: number;
  messages: {
    orderReceived: string;
    orderStatus: string;
    unavailable: string;
  };
  updatedAt?: string;
};

export const DEFAULT_STORE_CONFIGURATION: StoreConfiguration = {
  whatsappNumber: "573000000000",
  businessHours: [
    { day: "Lunes", open: "10:00", close: "22:00" },
    { day: "Martes", open: "10:00", close: "22:00" },
    { day: "Miércoles", open: "10:00", close: "22:00" },
    { day: "Jueves", open: "10:00", close: "22:00" },
    { day: "Viernes", open: "10:00", close: "23:00" },
    { day: "Sábado", open: "10:00", close: "23:00" },
    { day: "Domingo", open: "12:00", close: "20:00" },
  ],
  deliveryZones: ["Laureles", "El Poblado", "Belén"],
  estimatedDeliveryMinutes: 45,
  messages: {
    orderReceived: "Recibimos tu pedido y pronto confirmaremos la preparación.",
    orderStatus: "El estado de tu pedido cambió a {status}.",
    unavailable: "En este momento no podemos procesar el pedido.",
  },
};

export type AuditInput = {
  actorUid: string;
  action: string;
  module: "roles" | "usuarios" | "pedidos" | "productos" | "inventario" | "promociones" | "configuracion" | "categorias" | "negocios" | "usuarios_negocio";
  entityId: string;
  changes?: Record<string, unknown>;
};

export type AuditEntry = AuditInput & { id: string; createdAt: string };

export type Notification = {
  id: string;
  uid?: string;
  audience: "customer" | "admin";
  title: string;
  message: string;
  orderId?: string;
  read: boolean;
  createdAt: string;
};

export type NotificationInput = Omit<Notification, "id" | "createdAt" | "read"> & { read?: boolean };

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type PushSubscriptionData = {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
};

export type PushSubscriptionRecord = {
  id: string;
  uid: string;
  subscription: PushSubscriptionData;
  orderId?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportOrderItem = { name: string; quantity: number; subtotal: number };

export type ReportOrder = {
  id: string;
  status: OrderStatus;
  total: number;
  customerId: string;
  createdAt: string;
  items: ReportOrderItem[];
  rating?: number;
};

export type OrderReportFilter = { from?: string; to?: string; status?: OrderStatus };

export type OrderReport = {
  orderCount: number;
  totalRevenue: number;
  revenueByStatus: Record<string, number>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  topCustomers: Array<{ customerBucket: string; orders: number; revenue: number }>;
  cancellationCount: number;
  csat?: number;
  ratingCount?: number;
};
