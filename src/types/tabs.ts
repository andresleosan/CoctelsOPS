import type { CheckoutItemInput, OrderItem, PosPaymentMethod } from "@/types/orders";

export const BAR_TAB_STATUSES = ["abierta", "cerrada", "cancelada"] as const;
export type BarTabStatus = (typeof BAR_TAB_STATUSES)[number];

export const BAR_TAB_SPLIT_MODES = ["single", "equal", "custom"] as const;
export type BarTabSplitMode = (typeof BAR_TAB_SPLIT_MODES)[number];

export type BarTabRound = {
  roundNumber: number;
  orderId: string;
  items: OrderItem[];
  subtotal: number;
  notes?: string;
  createdAt: string;
  createdByUid: string;
  createdByName?: string;
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
  openedAt: string;
  openedByUid: string;
  openedByName: string;
  closedAt?: string;
  closedByUid?: string;
  closedByName?: string;
  closingNotes?: string;
  updatedAt: string;
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
