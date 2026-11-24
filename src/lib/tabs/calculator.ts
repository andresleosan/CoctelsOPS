import { sanitizeCopAmount } from "@/lib/orders/pos-calculator";
import type { OrderStatus } from "@/types/orders";
import type { BarTab, BarTabPaymentInput, BarTabRound, PublicTableTab } from "@/types/tabs";

export type BarTabTotalsSummary = {
  roundsCount: number;
  itemsCount: number;
  subtotal: number;
  total: number;
};

export type BarTabPaymentValidation = {
  total: number;
  totalPaid: number;
  changeAmount: number;
  shortfall: number;
  isCovered: boolean;
};

/**
 * Normaliza el identificador de mesa para mantener consistencia en búsquedas y KDS.
 */
export function normalizeTableNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Determina si el identificador corresponde al modo de retiro en barra (pickup) y no a una mesa física.
 */
export function isPickupTableIdentifier(raw: string): boolean {
  const normalized = normalizeTableNumber(raw).toLowerCase();
  return normalized === "barra" || normalized === "recoger en barra";
}

/**
 * Estandariza el identificador visible de mesa (ej. "4" -> "Mesa 4", "mesa  4" -> "Mesa 4").
 */
export function canonicalizeTableNumber(raw: string): string {
  const clean = normalizeTableNumber(raw);
  if (!clean) return "";

  if (/^\d+[a-z]?$/i.test(clean)) {
    return `Mesa ${clean}`;
  }

  const mesaMatch = clean.match(/^mesa\s+(.+)$/i);
  if (mesaMatch && mesaMatch[1]?.trim()) {
    return `Mesa ${mesaMatch[1].trim()}`;
  }

  return clean;
}

/**
 * Clave normalizada para emparejar mesas abiertas independientemente de mayúsculas o prefijo "Mesa".
 */
export function getTableLookupKey(raw: string): string {
  return canonicalizeTableNumber(raw).toLowerCase();
}

/**
 * Proyecta una cuenta de mesa a su representación pública segura para el cliente en mesa,
 * excluyendo identificadores internos de staff, pagos registrados y notas internas de cierre.
 */
export function toPublicTableTab(
  tab: BarTab,
  orderStatuses?: ReadonlyMap<string, OrderStatus>,
): PublicTableTab {
  const totals = calculateBarTabTotals(tab.rounds);
  const rounds = tab.rounds.map((round) => {
    const orderStatus = round.orderId ? orderStatuses?.get(round.orderId) : undefined;
    return {
      roundNumber: round.roundNumber,
      orderId: round.orderId,
      ...(orderStatus ? { orderStatus } : {}),
      items: round.items,
      subtotal: round.subtotal,
      ...(round.notes ? { notes: round.notes } : {}),
      createdAt: round.createdAt,
      ...(round.source ? { source: round.source } : {}),
    };
  });

  return {
    id: tab.id,
    negocioId: tab.negocioId,
    tableNumber: tab.tableNumber,
    ...(tab.customerName ? { customerName: tab.customerName } : {}),
    guestCount: tab.guestCount,
    status: tab.status,
    rounds,
    itemsCount: totals.itemsCount,
    subtotal: tab.subtotal,
    total: tab.total,
    ...(tab.billRequest ? { billRequest: tab.billRequest } : {}),
    openedAt: tab.openedAt,
    updatedAt: tab.updatedAt,
  };
}

/**
 * Recalcula los totales acumulados de una cuenta a partir de sus rondas enviadas al KDS.
 */
export function calculateBarTabTotals(
  rounds: Array<Pick<BarTabRound, "items" | "subtotal">>,
): BarTabTotalsSummary {
  let itemsCount = 0;
  let subtotal = 0;

  for (const round of rounds) {
    subtotal += sanitizeCopAmount(round.subtotal);
    for (const item of round.items) {
      itemsCount += Math.max(0, Math.round(item.quantity));
    }
  }

  return {
    roundsCount: rounds.length,
    itemsCount,
    subtotal,
    total: subtotal,
  };
}

/**
 * Divide una cuenta equitativamente entre N comensales en pesos COP enteros,
 * repartiendo el residuo de redondeo entre los primeros comensales para que la suma sea exacta.
 */
export function calculateEqualSplitShares(total: number, guestCount: number): number[] {
  const safeTotal = sanitizeCopAmount(total);
  const safeGuests = Math.max(1, Math.min(30, Math.round(guestCount)));

  const baseShare = Math.floor(safeTotal / safeGuests);
  const remainder = safeTotal - baseShare * safeGuests;

  return Array.from({ length: safeGuests }, (_, index) =>
    index < remainder ? baseShare + 1 : baseShare,
  );
}

/**
 * Verifica que los pagos declarados (único, dividido o mixto) cubran el total de la cuenta.
 */
export function validateBarTabPayments(
  total: number,
  payments: Array<Pick<BarTabPaymentInput, "amount">>,
): BarTabPaymentValidation {
  const safeTotal = sanitizeCopAmount(total);
  const totalPaid = payments.reduce((sum, item) => sum + sanitizeCopAmount(item.amount), 0);
  const shortfall = Math.max(0, safeTotal - totalPaid);
  const changeAmount = Math.max(0, totalPaid - safeTotal);

  return {
    total: safeTotal,
    totalPaid,
    changeAmount,
    shortfall,
    isCovered: payments.length > 0 && totalPaid >= safeTotal,
  };
}
