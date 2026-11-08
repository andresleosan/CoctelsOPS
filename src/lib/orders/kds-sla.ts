import type { Order, OrderStatus } from "@/types/orders";

export type SlaLevel = "ok" | "warning" | "critical" | "completed";

export type OrderSlaBadge = {
  level: SlaLevel;
  elapsedMinutes: number;
  label: string;
};

export type KdsColumnKey = "nuevos" | "preparacion" | "despacho" | "finalizados";

export type KdsColumn = {
  key: KdsColumnKey;
  title: string;
  subtitle: string;
  orders: Order[];
};

const COMPLETED_STATUSES: ReadonlySet<OrderStatus> = new Set(["entregado", "cancelado"]);

export function calculateOrderElapsedMinutes(createdAt: string, nowMs: number = Date.now()): number {
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / 60_000));
}

export function getOrderSlaStatus(
  createdAt: string,
  status: OrderStatus,
  nowMs: number = Date.now(),
): OrderSlaBadge {
  const elapsedMinutes = calculateOrderElapsedMinutes(createdAt, nowMs);

  if (COMPLETED_STATUSES.has(status)) {
    return {
      level: "completed",
      elapsedMinutes,
      label: `${elapsedMinutes} min`,
    };
  }

  if (elapsedMinutes < 10) {
    return {
      level: "ok",
      elapsedMinutes,
      label: `${elapsedMinutes} min · A tiempo`,
    };
  }

  if (elapsedMinutes <= 20) {
    return {
      level: "warning",
      elapsedMinutes,
      label: `${elapsedMinutes} min · Atención`,
    };
  }

  return {
    level: "critical",
    elapsedMinutes,
    label: `${elapsedMinutes} min · Demorado`,
  };
}

function compareByCreatedAtAsc(a: Order, b: Order): number {
  const timeA = Date.parse(a.createdAt);
  const timeB = Date.parse(b.createdAt);
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0;
  return timeA - timeB;
}

function compareByCreatedAtDesc(a: Order, b: Order): number {
  return compareByCreatedAtAsc(b, a);
}

export function groupOrdersIntoKdsColumns(orders: Order[]): KdsColumn[] {
  const nuevos: Order[] = [];
  const preparacion: Order[] = [];
  const despacho: Order[] = [];
  const finalizados: Order[] = [];

  for (const order of orders) {
    switch (order.status) {
      case "pendiente":
        nuevos.push(order);
        break;
      case "confirmado":
      case "preparando":
        preparacion.push(order);
        break;
      case "en_camino":
        despacho.push(order);
        break;
      case "entregado":
      case "cancelado":
        finalizados.push(order);
        break;
    }
  }

  // FIFO para columnas operativas activas (primero en entrar, primero en preparar)
  nuevos.sort(compareByCreatedAtAsc);
  preparacion.sort(compareByCreatedAtAsc);
  despacho.sort(compareByCreatedAtAsc);
  // Más recientes primero en columna de finalizados
  finalizados.sort(compareByCreatedAtDesc);

  return [
    {
      key: "nuevos",
      title: "Por Confirmar",
      subtitle: "Nuevos ingresos en cola",
      orders: nuevos,
    },
    {
      key: "preparacion",
      title: "En Barra / Preparación",
      subtitle: "Confirmados y mezclando",
      orders: preparacion,
    },
    {
      key: "despacho",
      title: "En Camino / Listo",
      subtitle: "Despachados para entrega",
      orders: despacho,
    },
    {
      key: "finalizados",
      title: "Finalizados",
      subtitle: "Entregados o cancelados",
      orders: finalizados,
    },
  ];
}

export function detectNewPendingOrderIds(
  previousOrderIds: ReadonlySet<string>,
  currentOrders: Order[],
): string[] {
  const addedPending: string[] = [];
  for (const order of currentOrders) {
    if (order.status === "pendiente" && !previousOrderIds.has(order.id)) {
      addedPending.push(order.id);
    }
  }
  return addedPending;
}
