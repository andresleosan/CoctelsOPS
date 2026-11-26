import type { StaffTipRole } from "@/types/cash-register";
import type { OrderStatus } from "@/types/orders";
import type {
  CatalogProfitabilityReport,
  OrderEscandalloSummary,
  OrderProfitabilitySummary,
} from "@/types/recipes";

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

export type StoreEmergencyPause = {
  active: boolean;
  reason?: string;
  pausedAt?: string;
  resumeAt?: string;
  pausedByUid?: string;
};

export type ScheduledOrdersConfig = {
  enabled: boolean;
  slotIntervalMinutes: number;
  minLeadMinutes: number;
  maxDaysAhead: number;
};

export type DeliveryZoneConfig = {
  id: string;
  name: string;
  feeCop: number;
  estimatedMinutes: number;
  freeDeliveryMinCop?: number;
  active: boolean;
};

export type StoreConfiguration = {
  whatsappNumber: string;
  timezone?: string;
  businessHours: BusinessHour[];
  deliveryZones: string[];
  deliveryZoneRates?: DeliveryZoneConfig[];
  estimatedDeliveryMinutes: number;
  emergencyPause?: StoreEmergencyPause;
  scheduledOrders?: ScheduledOrdersConfig;
  messages: {
    orderReceived: string;
    orderStatus: string;
    unavailable: string;
  };
  updatedAt?: string;
};

export const DEFAULT_STORE_CONFIGURATION: StoreConfiguration = {
  whatsappNumber: "573000000000",
  timezone: "America/Bogota",
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
  deliveryZoneRates: [
    {
      id: "laureles",
      name: "Laureles",
      feeCop: 4000,
      estimatedMinutes: 35,
      freeDeliveryMinCop: 50000,
      active: true,
    },
    {
      id: "el-poblado",
      name: "El Poblado",
      feeCop: 6000,
      estimatedMinutes: 45,
      freeDeliveryMinCop: 60000,
      active: true,
    },
    {
      id: "belen",
      name: "Belén",
      feeCop: 4000,
      estimatedMinutes: 40,
      freeDeliveryMinCop: 50000,
      active: true,
    },
  ],
  estimatedDeliveryMinutes: 45,
  emergencyPause: {
    active: false,
  },
  scheduledOrders: {
    enabled: true,
    slotIntervalMinutes: 30,
    minLeadMinutes: 45,
    maxDaysAhead: 2,
  },
  messages: {
    orderReceived: "Recibimos tu pedido y pronto confirmaremos la preparación.",
    orderStatus: "El estado de tu pedido cambió a {status}.",
    unavailable: "En este momento no podemos procesar el pedido.",
  },
};

export type AuditInput = {
  actorUid: string;
  action: string;
  module:
    | "roles"
    | "usuarios"
    | "pedidos"
    | "productos"
    | "inventario"
    | "recetas"
    | "promociones"
    | "configuracion"
    | "categorias"
    | "negocios"
    | "usuarios_negocio"
    | "caja";
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
  negocioId?: string;
  escandallo?: OrderEscandalloSummary;
};

export type OrderReportFilter = { from?: string; to?: string; status?: OrderStatus };

export type StaffTipsRoleSummary = {
  role: StaffTipRole;
  membersCount: number;
  tipsCop: number;
  commissionsCop: number;
  totalPayoutCop: number;
};

export type StaffTipsMemberSummary = {
  name: string;
  role: StaffTipRole;
  shiftsCount: number;
  deliveriesCount: number;
  tipsCop: number;
  commissionsCop: number;
  totalPayoutCop: number;
};

export type StaffTipsReportSummary = {
  shiftsWithSettlement: number;
  totalTipsCop: number;
  cashTipsCop: number;
  digitalTipsCop: number;
  totalCommissionsCop: number;
  totalPayoutCop: number;
  paidFromCashCop: number;
  byRole: StaffTipsRoleSummary[];
  byStaff: StaffTipsMemberSummary[];
};

export type OrderReport = {
  orderCount: number;
  totalRevenue: number;
  revenueByStatus: Record<string, number>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  topCustomers: Array<{ customerBucket: string; orders: number; revenue: number }>;
  cancellationCount: number;
  csat?: number;
  ratingCount?: number;
  profitability?: OrderProfitabilitySummary;
  catalogProfitability?: CatalogProfitabilityReport;
  staffTipsSummary?: StaffTipsReportSummary;
};
