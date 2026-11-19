import { sanitizeCopAmount } from "@/lib/orders/pos-calculator";
import type { BarTabPaymentInput, BarTabRound } from "@/types/tabs";

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
