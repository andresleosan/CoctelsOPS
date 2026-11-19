import type {
  CashCountBreakdown,
  CashExpense,
  CashExpenseCategory,
  CashReconciliationResult,
  CashReconciliationStatus,
  PaymentChannelTotals,
} from "@/types/cash-register";
import type { Order, PosDigitalChannel } from "@/types/orders";

export const EXPENSE_CATEGORY_LABELS: Record<CashExpenseCategory, string> = {
  hielo: "Hielo",
  fruta: "Fruta y frescos",
  domicilio: "Domicilios",
  insumo: "Insumos barra",
  otro: "Otros gastos",
};

function toCop(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function addDigitalAmount(
  totals: PaymentChannelTotals,
  channel: PosDigitalChannel | undefined,
  amount: number,
): void {
  if (amount <= 0) return;
  switch (channel) {
    case "nequi":
      totals.nequi += amount;
      break;
    case "daviplata":
      totals.daviplata += amount;
      break;
    case "qr":
      totals.qr += amount;
      break;
    case "transferencia":
    default:
      totals.transferencia += amount;
      break;
  }
}

export function createEmptyPaymentChannelTotals(): PaymentChannelTotals {
  return {
    efectivo: 0,
    nequi: 0,
    daviplata: 0,
    qr: 0,
    transferencia: 0,
    sinEspecificar: 0,
    totalVentas: 0,
    ordersCount: 0,
    cancelledCount: 0,
  };
}

export function calculateOrderPaymentChannels(
  orders: ReadonlyArray<
    Pick<Order, "createdAt" | "status" | "total" | "paymentMethod" | "paymentBreakdown">
  >,
  openedAt: string,
  closedAt?: string,
): PaymentChannelTotals {
  const totals = createEmptyPaymentChannelTotals();
  const openedAtMs = Date.parse(openedAt);
  const closedAtMs = closedAt ? Date.parse(closedAt) : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(openedAtMs)) {
    return totals;
  }

  for (const order of orders) {
    const orderCreatedMs = Date.parse(order.createdAt);
    if (!Number.isFinite(orderCreatedMs)) continue;
    if (orderCreatedMs < openedAtMs || orderCreatedMs > closedAtMs) continue;

    if (order.status === "cancelado") {
      totals.cancelledCount += 1;
      continue;
    }

    const total = toCop(order.total);
    totals.ordersCount += 1;
    totals.totalVentas += total;

    if (order.paymentMethod === "mixto" && order.paymentBreakdown) {
      const cash = Math.min(total, toCop(order.paymentBreakdown.cashAmount));
      const remaining = Math.max(0, total - cash);
      const digital = Math.min(remaining, toCop(order.paymentBreakdown.digitalAmount));
      const unaccounted = Math.max(0, total - cash - digital);

      totals.efectivo += cash;
      addDigitalAmount(totals, order.paymentBreakdown.digitalMethod, digital);
      totals.sinEspecificar += unaccounted;
      continue;
    }

    switch (order.paymentMethod) {
      case "efectivo":
        totals.efectivo += total;
        break;
      case "nequi":
        totals.nequi += total;
        break;
      case "daviplata":
        totals.daviplata += total;
        break;
      case "qr":
        totals.qr += total;
        break;
      case "transferencia":
        totals.transferencia += total;
        break;
      default:
        totals.sinEspecificar += total;
        break;
    }
  }

  return totals;
}

export function sumCashExpenses(expenses: ReadonlyArray<Pick<CashExpense, "amount">>): number {
  return expenses.reduce((sum, expense) => sum + toCop(expense.amount), 0);
}

export function calculateCashReconciliation(input: {
  openingBase: number;
  sales: PaymentChannelTotals;
  expenses: ReadonlyArray<Pick<CashExpense, "amount">>;
  count: CashCountBreakdown;
}): CashReconciliationResult {
  const openingBase = toCop(input.openingBase);
  const cashSales = toCop(input.sales.efectivo);
  const totalExpenses = sumCashExpenses(input.expenses);
  const expectedCash = openingBase + cashSales - totalExpenses;
  const declaredCash = toCop(input.count.declaredCash);
  const cashDifference = declaredCash - expectedCash;

  const statusLabel: CashReconciliationStatus =
    cashDifference === 0 ? "cuadrado" : cashDifference > 0 ? "sobrante" : "faltante";

  const digitalExpected =
    toCop(input.sales.nequi) +
    toCop(input.sales.daviplata) +
    toCop(input.sales.qr) +
    toCop(input.sales.transferencia);

  const hasDigitalDeclaration =
    input.count.declaredNequi !== undefined ||
    input.count.declaredDaviplata !== undefined ||
    input.count.declaredQr !== undefined ||
    input.count.declaredTransferencia !== undefined;

  const digitalDeclared = hasDigitalDeclaration
    ? toCop(input.count.declaredNequi ?? input.sales.nequi) +
      toCop(input.count.declaredDaviplata ?? input.sales.daviplata) +
      toCop(input.count.declaredQr ?? input.sales.qr) +
      toCop(input.count.declaredTransferencia ?? input.sales.transferencia)
    : digitalExpected;

  const digitalDifference = digitalDeclared - digitalExpected;

  return {
    openingBase,
    cashSales,
    totalExpenses,
    expectedCash,
    declaredCash,
    cashDifference,
    statusLabel,
    digitalExpected,
    digitalDeclared,
    digitalDifference,
  };
}
