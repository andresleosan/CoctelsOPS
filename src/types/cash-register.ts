import type {
  OrderPaymentGateway,
  OrderPaymentProof,
  OrderPaymentVerification,
  OrderStatus,
  PaymentVerificationStatus,
  PosDigitalChannel,
  PosPaymentMethod,
} from "@/types/orders";

export const CASH_REGISTER_STATUSES = ["abierta", "cerrada"] as const;
export type CashRegisterStatus = (typeof CASH_REGISTER_STATUSES)[number];

export const CASH_EXPENSE_CATEGORIES = ["hielo", "fruta", "domicilio", "insumo", "otro"] as const;
export type CashExpenseCategory = (typeof CASH_EXPENSE_CATEGORIES)[number];

export const STAFF_TIP_ROLES = ["bartender", "mesero", "domiciliario"] as const;
export type StaffTipRole = (typeof STAFF_TIP_ROLES)[number];

export const TIP_SOURCES = ["efectivo", "digital"] as const;
export type TipSource = (typeof TIP_SOURCES)[number];

export const TIP_DISTRIBUTION_MODES = ["equitativo", "ponderado_rol"] as const;
export type TipDistributionMode = (typeof TIP_DISTRIBUTION_MODES)[number];

export type CashTipEntry = {
  id: string;
  amount: number;
  source: TipSource;
  channel?: PosDigitalChannel;
  orderId?: string;
  notes?: string;
  createdAt: string;
  createdByUid: string;
  createdByName?: string;
};

export type StaffTipRecipientInput = {
  id?: string;
  name: string;
  role: StaffTipRole;
  weight?: number;
  deliveriesCount?: number;
  commissionPerDeliveryCop?: number;
  fixedCommissionCop?: number;
  paidFromCash?: boolean;
};

export type StaffTipAllocation = {
  id: string;
  name: string;
  role: StaffTipRole;
  weight: number;
  sharePct: number;
  tipShareCop: number;
  deliveriesCount: number;
  commissionPerDeliveryCop: number;
  fixedCommissionCop: number;
  commissionCop: number;
  totalPayoutCop: number;
  paidFromCash: boolean;
};

export type StaffRolePayoutTotal = {
  role: StaffTipRole;
  membersCount: number;
  tipsCop: number;
  commissionsCop: number;
  totalPayoutCop: number;
};

export type ShiftStaffSettlement = {
  mode: TipDistributionMode;
  cashTipsCop: number;
  digitalTipsCop: number;
  totalTipsCop: number;
  totalCommissionsCop: number;
  totalPayoutCop: number;
  paidFromCashCop: number;
  paidNonCashCop: number;
  byRole: StaffRolePayoutTotal[];
  allocations: StaffTipAllocation[];
};

export type CloseCashShiftStaffSettlementInput = {
  mode: TipDistributionMode;
  extraCashTips?: number;
  extraDigitalTips?: number;
  recipients: StaffTipRecipientInput[];
};

export type AddCashTipInput = {
  shiftId: string;
  amount: number;
  source: TipSource;
  channel?: PosDigitalChannel;
  orderId?: string;
  notes?: string;
};

export type ShiftDriverDeliveryCount = {
  name: string;
  deliveriesCount: number;
  totalCop: number;
};

export type CashExpense = {
  id: string;
  concept: string;
  category: CashExpenseCategory;
  amount: number;
  createdAt: string;
  createdByUid: string;
  createdByName?: string;
  notes?: string;
};

export type PaymentChannelTotals = {
  efectivo: number;
  nequi: number;
  daviplata: number;
  qr: number;
  transferencia: number;
  sinEspecificar: number;
  totalVentas: number;
  ordersCount: number;
  cancelledCount: number;
};

export type CashCountBreakdown = {
  declaredCash: number;
  declaredNequi?: number;
  declaredDaviplata?: number;
  declaredQr?: number;
  declaredTransferencia?: number;
};

export type CashReconciliationStatus = "cuadrado" | "sobrante" | "faltante";

export type CashReconciliationResult = {
  openingBase: number;
  cashSales: number;
  totalExpenses: number;
  expectedCash: number;
  declaredCash: number;
  cashDifference: number;
  statusLabel: CashReconciliationStatus;
  digitalExpected: number;
  digitalDeclared: number;
  digitalDifference: number;
  cashTips?: number;
  digitalTips?: number;
  totalTips?: number;
  totalCommissions?: number;
  staffCashPayouts?: number;
};

export type CashShift = {
  id: string;
  negocioId: string;
  status: CashRegisterStatus;
  openedAt: string;
  openedByUid: string;
  openedByName: string;
  openingBase: number;
  openingNotes?: string;
  expenses: CashExpense[];
  tips?: CashTipEntry[];
  staffSettlement?: ShiftStaffSettlement;
  closedAt?: string;
  closedByUid?: string;
  closedByName?: string;
  closingNotes?: string;
  salesSnapshot?: PaymentChannelTotals;
  countBreakdown?: CashCountBreakdown;
  reconciliation?: CashReconciliationResult;
  updatedAt: string;
};

export type OpenCashShiftInput = {
  negocioId?: string;
  openingBase: number;
  openingNotes?: string;
};

export type AddCashExpenseInput = {
  shiftId: string;
  concept: string;
  category: CashExpenseCategory;
  amount: number;
  notes?: string;
};

export type CloseCashShiftInput = {
  shiftId: string;
  countBreakdown: CashCountBreakdown;
  closingNotes?: string;
  staffSettlement?: CloseCashShiftStaffSettlementInput;
};

export type CashTransferVerificationItem = {
  orderId: string;
  customerName: string;
  phone: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  paymentMethod?: PosPaymentMethod;
  digitalChannel?: PosDigitalChannel;
  digitalReference?: string;
  paymentVerificationStatus: PaymentVerificationStatus;
  paymentProof?: Pick<OrderPaymentProof, "url" | "uploadedAt" | "channel" | "reference">;
  paymentVerification?: Pick<
    OrderPaymentVerification,
    "status" | "updatedAt" | "updatedByName" | "reason"
  >;
  paymentGateway?: Pick<
    OrderPaymentGateway,
    "provider" | "transactionId" | "status" | "confirmedAt"
  >;
};
