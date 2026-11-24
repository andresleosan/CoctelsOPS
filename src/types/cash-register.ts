import type {
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
};
