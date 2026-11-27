import type {
  BarDisplayServiceFilter,
  BarDisplayStage,
  BarDisplayTicket,
} from "@/types/display";
import type { Order } from "@/types/orders";

const DEFAULT_MAX_AGE_HOURS = 24;
const DEFAULT_MAX_PER_COLUMN = 18;

export function formatTurnCode(orderId: string): string {
  const alphanumeric = orderId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!alphanumeric) return "#0000";
  return `#${alphanumeric.slice(-4)}`;
}

export function formatPublicDisplayName(customerName: string): string {
  const cleaned = customerName.trim().replace(/\s+/g, " ");
  if (!cleaned) return "Cliente";

  const parts = cleaned.split(" ");
  const firstName = Array.from(parts[0] ?? "").slice(0, 16).join("");
  if (!firstName) return "Cliente";

  const secondPart = parts[1]?.trim();
  if (!secondPart) return firstName;

  const initial = Array.from(secondPart)[0]?.toUpperCase();
  return initial ? `${firstName} ${initial}.` : firstName;
}

export function toBarDisplayTicket(
  order: Pick<
    Order,
    | "id"
    | "customerName"
    | "serviceType"
    | "tableNumber"
    | "items"
    | "status"
    | "createdAt"
    | "updatedAt"
  >,
): BarDisplayTicket | null {
  let stage: BarDisplayStage;
  let status: BarDisplayTicket["status"];

  if (order.status === "confirmado" || order.status === "preparando") {
    stage = "preparing";
    status = order.status;
  } else if (order.status === "en_camino") {
    stage = "ready";
    status = "en_camino";
  } else {
    return null;
  }

  const rawItemsCount = order.items.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.quantity)),
    0,
  );
  const itemsCount = rawItemsCount > 0 ? rawItemsCount : 1;
  const cleanTable = order.tableNumber?.trim();

  return {
    orderId: order.id,
    turnCode: formatTurnCode(order.id),
    displayName: formatPublicDisplayName(order.customerName),
    serviceType: order.serviceType ?? "delivery",
    ...(cleanTable ? { tableNumber: cleanTable } : {}),
    itemsCount,
    stage,
    status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt || order.createdAt,
  };
}

function parseTimeMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

export function buildBarDisplayColumns(
  orders: Array<
    Pick<
      Order,
      | "id"
      | "customerName"
      | "serviceType"
      | "tableNumber"
      | "items"
      | "status"
      | "createdAt"
      | "updatedAt"
    >
  >,
  options: { nowMs?: number; maxAgeHours?: number; maxPerColumn?: number } = {},
): { preparing: BarDisplayTicket[]; ready: BarDisplayTicket[] } {
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const maxPerColumn = Math.max(1, options.maxPerColumn ?? DEFAULT_MAX_PER_COLUMN);
  const maxAgeMs = Math.max(1, maxAgeHours) * 60 * 60 * 1000;

  const preparing: BarDisplayTicket[] = [];
  const ready: BarDisplayTicket[] = [];

  for (const order of orders) {
    const ticket = toBarDisplayTicket(order);
    if (!ticket) continue;

    const referenceTimeMs = parseTimeMs(ticket.updatedAt || ticket.createdAt);
    if (referenceTimeMs > 0 && nowMs - referenceTimeMs > maxAgeMs) {
      continue;
    }

    if (ticket.stage === "preparing") {
      preparing.push(ticket);
    } else {
      ready.push(ticket);
    }
  }

  // FIFO para pedidos en preparación (primero en entrar, primero arriba)
  preparing.sort((a, b) => parseTimeMs(a.createdAt) - parseTimeMs(b.createdAt));
  // Más recientes primero en listos para recoger
  ready.sort((a, b) => parseTimeMs(b.updatedAt) - parseTimeMs(a.updatedAt));

  return {
    preparing: preparing.slice(0, maxPerColumn),
    ready: ready.slice(0, maxPerColumn),
  };
}

export function detectNewlyReadyOrderIds(
  previousReadyIds: ReadonlySet<string>,
  currentReady: BarDisplayTicket[],
): string[] {
  const added: string[] = [];
  for (const ticket of currentReady) {
    if (!previousReadyIds.has(ticket.orderId)) {
      added.push(ticket.orderId);
    }
  }
  return added;
}

export function filterBarDisplayTickets(
  tickets: BarDisplayTicket[],
  filter: BarDisplayServiceFilter,
): BarDisplayTicket[] {
  if (filter === "all") return tickets;
  return tickets.filter((ticket) => ticket.serviceType !== "delivery");
}
