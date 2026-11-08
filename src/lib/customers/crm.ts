import {
  calculateLoyaltySummaryFromOrders,
  type LoyaltyOrderSnapshot,
} from "@/lib/loyalty/calculator";
import type { UserProfile } from "@/types/auth";
import type { LoyaltyTierId } from "@/types/loyalty";

export type CustomerSegment = "vip" | "frecuente" | "inactivo" | "nuevo";

export type CustomerSegmentMeta = {
  id: CustomerSegment;
  label: string;
  badgeClass: string;
  dotClass: string;
  description: string;
};

export const CUSTOMER_SEGMENTS: Record<CustomerSegment, CustomerSegmentMeta> = {
  vip: {
    id: "vip",
    label: "VIP Neón",
    badgeClass: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40",
    dotClass: "bg-fuchsia-400",
    description: "Clientes destacados de alto consumo o nivel VIP Oro",
  },
  frecuente: {
    id: "frecuente",
    label: "Frecuente",
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
    dotClass: "bg-cyan-400",
    description: "Clientes recurrentes con 2 o más pedidos entregados",
  },
  inactivo: {
    id: "inactivo",
    label: "Inactivo con Puntos",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    dotClass: "bg-amber-400 animate-pulse",
    description: "Más de 15 días sin pedir con saldo de puntos disponible",
  },
  nuevo: {
    id: "nuevo",
    label: "Nuevo",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    dotClass: "bg-emerald-400",
    description: "Cliente reciente con 0 o 1 pedido entregado",
  },
};

export type CrmCustomer = {
  uid: string;
  email: string;
  displayName: string | null;
  telefono: string | null;
  photoURL: string | null;
  addressesCount: number;
  addresses: UserProfile["addresses"];
  deliveredOrdersCount: number;
  totalOrdersCount: number;
  totalSpent: number;
  averageTicket: number;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  availablePoints: number;
  lifetimePoints: number;
  tier: LoyaltyTierId;
  segment: CustomerSegment;
  segmentLabel: string;
};

export type CrmSummaryMetrics = {
  totalCustomers: number;
  vipCount: number;
  frecuenteCount: number;
  inactivoCount: number;
  nuevoCount: number;
  totalSpentAllCustomers: number;
  globalAverageTicket: number;
  totalAvailablePoints: number;
};

export type WhatsAppCampaignTemplate =
  | "reactivacion_puntos"
  | "saludo_vip"
  | "happy_hour"
  | "fidelizacion";

export type CampaignTemplateOption = {
  id: WhatsAppCampaignTemplate;
  title: string;
  description: string;
};

export const CAMPAIGN_TEMPLATES: readonly CampaignTemplateOption[] = [
  {
    id: "reactivacion_puntos",
    title: "🍹 Re-activación con Puntos",
    description: "Invita al cliente a canjear sus puntos acumulados listos",
  },
  {
    id: "saludo_vip",
    title: "🌟 Trato Preferencial VIP",
    description: "Agradecimiento y trato especial para clientes VIP",
  },
  {
    id: "happy_hour",
    title: "🎉 Invitación a Happy Hour",
    description: "Promoción activa hoy combinable con sus puntos",
  },
  {
    id: "fidelizacion",
    title: "🥤 Recordatorio de Fidelización",
    description: "Recordatorio general de beneficios y nueva carta",
  },
] as const;

/**
 * Limpia y normaliza el número de teléfono para la API de WhatsApp (wa.me).
 * Si es un número colombiano de 10 dígitos (ej. 3001234567), antepone el código de país 57.
 */
export function cleanPhoneNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return "";
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "";

  // Si tiene 10 dígitos y empieza por 3 (celular en Colombia), agregamos '57'
  if (digits.length === 10 && digits.startsWith("3")) {
    return `57${digits}`;
  }

  // Si ya tiene código de país Colombia (12 dígitos comenzando con 573)
  if (digits.length === 12 && digits.startsWith("573")) {
    return digits;
  }

  return digits;
}

/**
 * Clasifica a un cliente en uno de los 4 segmentos operativos del CRM:
 * 1. 'inactivo': Más de 15 días sin compras Y con puntos disponibles para redimir.
 * 2. 'vip': Nivel Oro (>=150 pts), gasto total >= $100.000 COP, o >= 5 pedidos entregados.
 * 3. 'frecuente': 2 o más pedidos entregados y activo recientemente.
 * 4. 'nuevo': Clientes con 0 o 1 pedido entregado.
 */
export function classifyCustomerSegment(params: {
  deliveredOrdersCount: number;
  totalSpent: number;
  daysSinceLastOrder: number | null;
  availablePoints: number;
  lifetimePoints: number;
}): CustomerSegment {
  const { deliveredOrdersCount, totalSpent, daysSinceLastOrder, availablePoints, lifetimePoints } =
    params;

  // Prioridad 1: Clientes en riesgo de inactividad que tienen saldo de puntos
  if (daysSinceLastOrder !== null && daysSinceLastOrder > 15 && availablePoints > 0) {
    return "inactivo";
  }

  // Prioridad 2: Clientes VIP por consumo acumulado, tier Oro o volumen
  if (lifetimePoints >= 150 || totalSpent >= 100_000 || deliveredOrdersCount >= 5) {
    return "vip";
  }

  // Prioridad 3: Clientes frecuentes
  if (deliveredOrdersCount >= 2) {
    return "frecuente";
  }

  // Prioridad 4: Clientes nuevos
  return "nuevo";
}

/**
 * Calcula los días transcurridos desde una fecha ISO hasta una fecha de referencia.
 */
export function calculateDaysSince(
  isoDateString: string | null,
  referenceDate: Date = new Date()
): number | null {
  if (!isoDateString) return null;
  const target = new Date(isoDateString);
  if (Number.isNaN(target.getTime())) return null;

  const diffMs = referenceDate.getTime() - target.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Genera el texto del mensaje de WhatsApp personalizado para el cliente.
 */
export function buildWhatsAppReactivationMessage(
  customer: Pick<CrmCustomer, "displayName" | "availablePoints" | "segment">,
  template: WhatsAppCampaignTemplate = "reactivacion_puntos",
  options: {
    storeName?: string;
    menuUrl?: string;
  } = {}
): string {
  const rawName = customer.displayName?.trim() || "";
  const name = rawName ? rawName.split(" ")[0] : "amig@";
  const points = customer.availablePoints ?? 0;
  const storeName = options.storeName ?? "Coctels OPS";
  const menuUrl = options.menuUrl ?? "https://coctelsops.com/menu";

  switch (template) {
    case "reactivacion_puntos":
      return `¡Hola ${name}! 🍹 Hace días no te vemos en ${storeName}. Te recordamos que tienes *${points} Puntos Coctels* listos para canjear en tus granizados y adiciones favoritas. ¡Haz tu pedido hoy y refréscate con nosotros! Pide aquí: ${menuUrl}`;

    case "saludo_vip":
      return `¡Hola ${name}! 🌟 Como cliente VIP de ${storeName}, queremos agradecer tu preferencia. Tienes *${points} Puntos Coctels* acumulados para disfrutar de cócteles o adiciones de cortesía. ¡Visítanos o haz tu pedido en línea: ${menuUrl}`;

    case "happy_hour":
      return `¡Hola ${name}! 🎉 Hoy tenemos *Happy Hour activo* en ${storeName} con promociones especiales en nuestros mejores granizados. Además, puedes redimir tus *${points} Puntos Coctels*. ¡Aprovecha la promo aquí: ${menuUrl} !`;

    case "fidelizacion":
    default:
      return `¡Hola ${name}! 🥤 En ${storeName} te premiamos por cada compra. Actualmente cuentas con *${points} Puntos Coctels* disponibles. ¡Descubre los nuevos sabores de nuestra carta y redime tus puntos: ${menuUrl}`;
  }
}

/**
 * Construye la URL directa de wa.me con el mensaje codificado.
 * Si el teléfono no es válido, retorna null.
 */
export function buildWhatsAppChatUrl(
  rawPhone: string | null | undefined,
  message: string
): string | null {
  const cleaned = cleanPhoneNumber(rawPhone);
  if (!cleaned || cleaned.length < 7) {
    return null;
  }
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

/**
 * Consolida los datos del perfil de usuario y sus órdenes en una ficha CRM completa.
 */
export function consolidateCrmCustomer(
  profile: Pick<
    UserProfile,
    "uid" | "email" | "displayName" | "telefono" | "photoURL" | "addresses"
  >,
  orders: LoyaltyOrderSnapshot[],
  referenceDate: Date = new Date()
): CrmCustomer {
  const loyaltySummary = calculateLoyaltySummaryFromOrders(orders);

  const deliveredOrders = orders.filter((o) => o.status === "entregado");
  const totalOrdersCount = orders.length;
  const deliveredOrdersCount = deliveredOrders.length;

  const totalSpent = deliveredOrders.reduce((sum, order) => {
    const val = typeof order.total === "number" && !Number.isNaN(order.total) ? order.total : 0;
    return sum + val;
  }, 0);

  const averageTicket =
    deliveredOrdersCount > 0 ? Math.round(totalSpent / deliveredOrdersCount) : 0;

  // Encontrar la fecha del último pedido
  let lastOrderAt: string | null = null;
  if (orders.length > 0) {
    const sorted = [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    lastOrderAt = sorted[0].createdAt || null;
  }

  const daysSinceLastOrder = calculateDaysSince(lastOrderAt, referenceDate);

  const segment = classifyCustomerSegment({
    deliveredOrdersCount,
    totalSpent,
    daysSinceLastOrder,
    availablePoints: loyaltySummary.availablePoints,
    lifetimePoints: loyaltySummary.lifetimeEarnedPoints,
  });

  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName ?? null,
    telefono: profile.telefono ?? null,
    photoURL: profile.photoURL ?? null,
    addressesCount: profile.addresses?.length ?? 0,
    addresses: profile.addresses ?? [],
    deliveredOrdersCount,
    totalOrdersCount,
    totalSpent,
    averageTicket,
    lastOrderAt,
    daysSinceLastOrder,
    availablePoints: loyaltySummary.availablePoints,
    lifetimePoints: loyaltySummary.lifetimeEarnedPoints,
    tier: loyaltySummary.tier.id,
    segment,
    segmentLabel: CUSTOMER_SEGMENTS[segment].label,
  };
}

/**
 * Calcula métricas resumen consolidadas para todo el grupo de clientes.
 */
export function calculateCrmMetrics(customers: CrmCustomer[]): CrmSummaryMetrics {
  const totalCustomers = customers.length;
  let vipCount = 0;
  let frecuenteCount = 0;
  let inactivoCount = 0;
  let nuevoCount = 0;
  let totalSpentAllCustomers = 0;
  let totalDeliveredOrders = 0;
  let totalAvailablePoints = 0;

  for (const c of customers) {
    if (c.segment === "vip") vipCount += 1;
    else if (c.segment === "frecuente") frecuenteCount += 1;
    else if (c.segment === "inactivo") inactivoCount += 1;
    else nuevoCount += 1;

    totalSpentAllCustomers += c.totalSpent;
    totalDeliveredOrders += c.deliveredOrdersCount;
    totalAvailablePoints += c.availablePoints;
  }

  const globalAverageTicket =
    totalDeliveredOrders > 0 ? Math.round(totalSpentAllCustomers / totalDeliveredOrders) : 0;

  return {
    totalCustomers,
    vipCount,
    frecuenteCount,
    inactivoCount,
    nuevoCount,
    totalSpentAllCustomers,
    globalAverageTicket,
    totalAvailablePoints,
  };
}
