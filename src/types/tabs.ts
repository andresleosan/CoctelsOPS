import type { CheckoutItemInput, OrderItem, OrderStatus, PosPaymentMethod } from "@/types/orders";

export const BAR_TAB_STATUSES = ["abierta", "cerrada", "cancelada"] as const;
export type BarTabStatus = (typeof BAR_TAB_STATUSES)[number];

export const BAR_TAB_SPLIT_MODES = ["single", "equal", "custom"] as const;
export type BarTabSplitMode = (typeof BAR_TAB_SPLIT_MODES)[number];

export type BarTabRoundSource = "staff" | "cliente_qr";

export type BarTabRound = {
  roundNumber: number;
  orderId: string;
  items: OrderItem[];
  subtotal: number;
  notes?: string;
  createdAt: string;
  createdByUid: string;
  createdByName?: string;
  source?: BarTabRoundSource;
  idempotencyKey?: string;
};

export type BarTabBillRequest = {
  requestedAt: string;
  splitMode: Extract<BarTabSplitMode, "single" | "equal">;
  guestCount: number;
  perPersonAmount?: number;
  preferredMethod?: PosPaymentMethod;
  notes?: string;
};

export type BarTabPaymentSplit = {
  id: string;
  label: string;
  method: Exclude<PosPaymentMethod, "mixto">;
  amount: number;
  reference?: string;
  paidAt: string;
};

export type BarTab = {
  id: string;
  negocioId: string;
  tableNumber: string;
  customerName?: string;
  guestCount: number;
  status: BarTabStatus;
  rounds: BarTabRound[];
  subtotal: number;
  total: number;
  splitMode?: BarTabSplitMode;
  payments?: BarTabPaymentSplit[];
  billRequest?: BarTabBillRequest;
  openedAt: string;
  openedByUid: string;
  openedByName: string;
  closedAt?: string;
  closedByUid?: string;
  closedByName?: string;
  closingNotes?: string;
  updatedAt: string;
};

export type PublicTableTabRound = {
  roundNumber: number;
  orderId: string;
  orderStatus?: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  notes?: string;
  createdAt: string;
  source?: BarTabRoundSource;
};

export type PublicTableTab = {
  id: string;
  negocioId: string;
  tableNumber: string;
  customerName?: string;
  guestCount: number;
  status: BarTabStatus;
  rounds: PublicTableTabRound[];
  itemsCount: number;
  subtotal: number;
  total: number;
  billRequest?: BarTabBillRequest;
  openedAt: string;
  updatedAt: string;
};

export type PublicAddTableRoundInput = {
  negocioId: string;
  tableNumber: string;
  items: CheckoutItemInput[];
  customerName?: string;
  guestCount?: number;
  notes?: string;
  idempotencyKey?: string;
  actorUid?: string;
  actorName?: string;
};

export type PublicRequestBillInput = {
  negocioId: string;
  tableNumber: string;
  splitMode: Extract<BarTabSplitMode, "single" | "equal">;
  guestCount: number;
  preferredMethod?: PosPaymentMethod;
  notes?: string;
  actorUid?: string;
};

export type OpenBarTabInput = {
  negocioId?: string;
  tableNumber: string;
  customerName?: string;
  guestCount?: number;
};

export type AddBarTabRoundInput = {
  tabId: string;
  items: CheckoutItemInput[];
  notes?: string;
};

export type BarTabPaymentInput = {
  label?: string;
  method: Exclude<PosPaymentMethod, "mixto">;
  amount: number;
  reference?: string;
};

export type CloseBarTabInput = {
  tabId: string;
  splitMode: BarTabSplitMode;
  guestCount?: number;
  payments: BarTabPaymentInput[];
  closingNotes?: string;
};

export type CancelBarTabInput = {
  tabId: string;
  reason?: string;
};
