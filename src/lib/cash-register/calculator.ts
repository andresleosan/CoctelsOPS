import type {
  CashCountBreakdown,
  CashExpense,
  CashExpenseCategory,
  CashReconciliationResult,
  CashReconciliationStatus,
  CashShift,
  CashTipEntry,
  PaymentChannelTotals,
  ShiftStaffSettlement,
  StaffRolePayoutTotal,
  StaffTipAllocation,
  StaffTipRecipientInput,
  StaffTipRole,
  TipDistributionMode,
} from "@/types/cash-register";
import { STAFF_TIP_ROLES } from "@/types/cash-register";
import type {
  StaffTipsMemberSummary,
  StaffTipsReportSummary,
  StaffTipsRoleSummary,
} from "@/types/operations";
import type { Order, PosDigitalChannel } from "@/types/orders";

export const EXPENSE_CATEGORY_LABELS: Record<CashExpenseCategory, string> = {
  hielo: "Hielo",
  fruta: "Fruta y frescos",
  domicilio: "Domicilios",
  insumo: "Insumos barra",
  otro: "Otros gastos",
};

export const STAFF_TIP_ROLE_LABELS: Record<StaffTipRole, string> = {
  bartender: "Bartender",
  mesero: "Mesero",
  domiciliario: "Domiciliario",
};

export const DEFAULT_ROLE_TIP_WEIGHTS: Record<StaffTipRole, number> = {
  bartender: 50,
  mesero: 35,
  domiciliario: 15,
};

export const TIP_DISTRIBUTION_MODE_LABELS: Record<TipDistributionMode, string> = {
  equitativo: "Equitativo",
  ponderado_rol: "Por rol (50 / 35 / 15)",
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

export function sumCashTips(
  tips: ReadonlyArray<Pick<CashTipEntry, "amount" | "source">>,
): { cashTipsCop: number; digitalTipsCop: number; totalTipsCop: number } {
  let cashTipsCop = 0;
  let digitalTipsCop = 0;

  for (const tip of tips) {
    const amount = toCop(tip.amount);
    if (tip.source === "digital") {
      digitalTipsCop += amount;
    } else {
      cashTipsCop += amount;
    }
  }

  return {
    cashTipsCop,
    digitalTipsCop,
    totalTipsCop: cashTipsCop + digitalTipsCop,
  };
}

export function calculateStaffTipsDistribution(input: {
  mode: TipDistributionMode;
  cashTipsCop: number;
  digitalTipsCop: number;
  recipients: ReadonlyArray<StaffTipRecipientInput>;
}): ShiftStaffSettlement {
  const cashTipsCop = toCop(input.cashTipsCop);
  const digitalTipsCop = toCop(input.digitalTipsCop);
  const totalTipsCop = cashTipsCop + digitalTipsCop;

  const cleanRecipients = input.recipients
    .map((recipient, index) => ({
      id: recipient.id?.trim() || `staff-${index + 1}`,
      name: recipient.name.trim(),
      role: recipient.role,
      explicitWeight:
        typeof recipient.weight === "number" && Number.isFinite(recipient.weight) && recipient.weight > 0
          ? recipient.weight
          : undefined,
      deliveriesCount: Math.max(0, Math.round(recipient.deliveriesCount ?? 0)),
      commissionPerDeliveryCop: toCop(recipient.commissionPerDeliveryCop ?? 0),
      fixedCommissionCop: toCop(recipient.fixedCommissionCop ?? 0),
      paidFromCash: recipient.paidFromCash !== false,
    }))
    .filter((recipient) => recipient.name.length > 0);

  if (cleanRecipients.length === 0) {
    return {
      mode: input.mode,
      cashTipsCop,
      digitalTipsCop,
      totalTipsCop,
      totalCommissionsCop: 0,
      totalPayoutCop: 0,
      paidFromCashCop: 0,
      paidNonCashCop: 0,
      byRole: [],
      allocations: [],
    };
  }

  const roleCounts: Record<StaffTipRole, number> = {
    bartender: 0,
    mesero: 0,
    domiciliario: 0,
  };
  for (const recipient of cleanRecipients) {
    roleCounts[recipient.role] += 1;
  }

  const weights = cleanRecipients.map((recipient) => {
    if (input.mode === "equitativo") {
      return 1;
    }
    if (recipient.explicitWeight !== undefined) {
      return recipient.explicitWeight;
    }
    const countInRole = Math.max(1, roleCounts[recipient.role]);
    return DEFAULT_ROLE_TIP_WEIGHTS[recipient.role] / countInRole;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const exactShares = weights.map((weight) =>
    totalWeight > 0 ? (totalTipsCop * weight) / totalWeight : 0,
  );
  const floorShares = exactShares.map((share) => Math.floor(share));
  const assignedSum = floorShares.reduce((sum, val) => sum + val, 0);
  let remainderCop = Math.max(0, totalTipsCop - assignedSum);

  if (remainderCop > 0) {
    const orderByRemainder = exactShares
      .map((exact, index) => ({ index, frac: exact - floorShares[index] }))
      .sort((a, b) => b.frac - a.frac || a.index - b.index);

    for (const item of orderByRemainder) {
      if (remainderCop <= 0) break;
      floorShares[item.index] += 1;
      remainderCop -= 1;
    }
  }

  const allocations: StaffTipAllocation[] = cleanRecipients.map((recipient, index) => {
    const weight = Number(weights[index].toFixed(4));
    const sharePct =
      totalWeight > 0 ? Number(((weights[index] / totalWeight) * 100).toFixed(1)) : 0;
    const tipShareCop = floorShares[index];
    const commissionCop =
      recipient.deliveriesCount * recipient.commissionPerDeliveryCop +
      recipient.fixedCommissionCop;
    const totalPayoutCop = tipShareCop + commissionCop;

    return {
      id: recipient.id,
      name: recipient.name,
      role: recipient.role,
      weight,
      sharePct,
      tipShareCop,
      deliveriesCount: recipient.deliveriesCount,
      commissionPerDeliveryCop: recipient.commissionPerDeliveryCop,
      fixedCommissionCop: recipient.fixedCommissionCop,
      commissionCop,
      totalPayoutCop,
      paidFromCash: recipient.paidFromCash,
    };
  });

  const roleMap = new Map<StaffTipRole, StaffRolePayoutTotal>();
  let totalCommissionsCop = 0;
  let totalPayoutCop = 0;
  let paidFromCashCop = 0;
  let paidNonCashCop = 0;

  for (const allocation of allocations) {
    totalCommissionsCop += allocation.commissionCop;
    totalPayoutCop += allocation.totalPayoutCop;
    if (allocation.paidFromCash) {
      paidFromCashCop += allocation.totalPayoutCop;
    } else {
      paidNonCashCop += allocation.totalPayoutCop;
    }

    const current = roleMap.get(allocation.role) ?? {
      role: allocation.role,
      membersCount: 0,
      tipsCop: 0,
      commissionsCop: 0,
      totalPayoutCop: 0,
    };
    current.membersCount += 1;
    current.tipsCop += allocation.tipShareCop;
    current.commissionsCop += allocation.commissionCop;
    current.totalPayoutCop += allocation.totalPayoutCop;
    roleMap.set(allocation.role, current);
  }

  const byRole: StaffRolePayoutTotal[] = STAFF_TIP_ROLES.flatMap((role) => {
    const entry = roleMap.get(role);
    return entry ? [entry] : [];
  });

  return {
    mode: input.mode,
    cashTipsCop,
    digitalTipsCop,
    totalTipsCop,
    totalCommissionsCop,
    totalPayoutCop,
    paidFromCashCop,
    paidNonCashCop,
    byRole,
    allocations,
  };
}

export function calculateCashReconciliation(input: {
  openingBase: number;
  sales: PaymentChannelTotals;
  expenses: ReadonlyArray<Pick<CashExpense, "amount">>;
  count: CashCountBreakdown;
  tips?: ReadonlyArray<Pick<CashTipEntry, "amount" | "source">>;
  staffSettlement?: Pick<
    ShiftStaffSettlement,
    "cashTipsCop" | "digitalTipsCop" | "totalTipsCop" | "totalCommissionsCop" | "paidFromCashCop"
  >;
}): CashReconciliationResult {
  const openingBase = toCop(input.openingBase);
  const cashSales = toCop(input.sales.efectivo);
  const totalExpenses = sumCashExpenses(input.expenses);

  const tipTotals = input.staffSettlement
    ? {
        cashTipsCop: toCop(input.staffSettlement.cashTipsCop),
        digitalTipsCop: toCop(input.staffSettlement.digitalTipsCop),
        totalTipsCop: toCop(input.staffSettlement.totalTipsCop),
      }
    : sumCashTips(input.tips ?? []);

  const staffCashPayouts = toCop(input.staffSettlement?.paidFromCashCop ?? 0);
  const totalCommissions = toCop(input.staffSettlement?.totalCommissionsCop ?? 0);

  const expectedCash =
    openingBase + cashSales - totalExpenses + tipTotals.cashTipsCop - staffCashPayouts;
  const declaredCash = toCop(input.count.declaredCash);
  const cashDifference = declaredCash - expectedCash;

  const statusLabel: CashReconciliationStatus =
    cashDifference === 0 ? "cuadrado" : cashDifference > 0 ? "sobrante" : "faltante";

  const digitalExpected =
    toCop(input.sales.nequi) +
    toCop(input.sales.daviplata) +
    toCop(input.sales.qr) +
    toCop(input.sales.transferencia) +
    tipTotals.digitalTipsCop;

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
  const includeStaffMetrics =
    tipTotals.totalTipsCop > 0 ||
    staffCashPayouts > 0 ||
    totalCommissions > 0 ||
    Boolean(input.staffSettlement);

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
    ...(includeStaffMetrics
      ? {
          cashTips: tipTotals.cashTipsCop,
          digitalTips: tipTotals.digitalTipsCop,
          totalTips: tipTotals.totalTipsCop,
          totalCommissions,
          staffCashPayouts,
        }
      : {}),
  };
}

export function aggregateShiftStaffSettlements(
  shifts: ReadonlyArray<Pick<CashShift, "status" | "closedAt" | "staffSettlement">>,
): StaffTipsReportSummary | undefined {
  let shiftsWithSettlement = 0;
  let totalTipsCop = 0;
  let cashTipsCop = 0;
  let digitalTipsCop = 0;
  let totalCommissionsCop = 0;
  let totalPayoutCop = 0;
  let paidFromCashCop = 0;

  const roleMap = new Map<StaffTipRole, StaffTipsRoleSummary>();
  const staffMap = new Map<string, StaffTipsMemberSummary>();

  for (const shift of shifts) {
    if (shift.status !== "cerrada" || !shift.staffSettlement) continue;
    const settlement = shift.staffSettlement;
    shiftsWithSettlement += 1;
    totalTipsCop += toCop(settlement.totalTipsCop);
    cashTipsCop += toCop(settlement.cashTipsCop);
    digitalTipsCop += toCop(settlement.digitalTipsCop);
    totalCommissionsCop += toCop(settlement.totalCommissionsCop);
    totalPayoutCop += toCop(settlement.totalPayoutCop);
    paidFromCashCop += toCop(settlement.paidFromCashCop);

    for (const allocation of settlement.allocations) {
      const roleEntry = roleMap.get(allocation.role) ?? {
        role: allocation.role,
        membersCount: 0,
        tipsCop: 0,
        commissionsCop: 0,
        totalPayoutCop: 0,
      };
      roleEntry.membersCount += 1;
      roleEntry.tipsCop += toCop(allocation.tipShareCop);
      roleEntry.commissionsCop += toCop(allocation.commissionCop);
      roleEntry.totalPayoutCop += toCop(allocation.totalPayoutCop);
      roleMap.set(allocation.role, roleEntry);

      const staffKey = `${allocation.role}::${allocation.name.trim().toLowerCase()}`;
      const staffEntry = staffMap.get(staffKey) ?? {
        name: allocation.name.trim(),
        role: allocation.role,
        shiftsCount: 0,
        deliveriesCount: 0,
        tipsCop: 0,
        commissionsCop: 0,
        totalPayoutCop: 0,
      };
      staffEntry.shiftsCount += 1;
      staffEntry.deliveriesCount += Math.max(0, Math.round(allocation.deliveriesCount));
      staffEntry.tipsCop += toCop(allocation.tipShareCop);
      staffEntry.commissionsCop += toCop(allocation.commissionCop);
      staffEntry.totalPayoutCop += toCop(allocation.totalPayoutCop);
      staffMap.set(staffKey, staffEntry);
    }
  }

  if (shiftsWithSettlement === 0) {
    return undefined;
  }

  const byRole: StaffTipsRoleSummary[] = STAFF_TIP_ROLES.flatMap((role) => {
    const entry = roleMap.get(role);
    return entry ? [entry] : [];
  });

  const byStaff = [...staffMap.values()].sort(
    (a, b) => b.totalPayoutCop - a.totalPayoutCop || a.name.localeCompare(b.name),
  );

  return {
    shiftsWithSettlement,
    totalTipsCop,
    cashTipsCop,
    digitalTipsCop,
    totalCommissionsCop,
    totalPayoutCop,
    paidFromCashCop,
    byRole,
    byStaff,
  };
}
