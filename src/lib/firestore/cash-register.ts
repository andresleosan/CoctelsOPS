import "server-only";

import { randomUUID } from "node:crypto";

import { requireNegocioAccess } from "@/lib/auth/permissions";
import {
  calculateCashReconciliation,
  calculateOrderPaymentChannels,
} from "@/lib/cash-register/calculator";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import type { VerifiedUser } from "@/types/auth";
import type {
  AddCashExpenseInput,
  CashExpense,
  CashExpenseCategory,
  CashRegisterStatus,
  CashShift,
  CloseCashShiftInput,
  OpenCashShiftInput,
  PaymentChannelTotals,
} from "@/types/cash-register";
import type { Order, OrderPaymentBreakdown, PosDigitalChannel, PosPaymentMethod } from "@/types/orders";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

export { calculateCashReconciliation, calculateOrderPaymentChannels };

export class CashRegisterError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CashRegisterError";
    this.status = status;
  }
}

const COLLECTION = "caja_turnos";

function actorDisplayName(user: VerifiedUser): string {
  return (
    user.profile.displayName?.trim() ||
    user.token.name?.trim() ||
    user.profile.email?.trim() ||
    user.uid
  );
}

function isPosPaymentMethod(value: unknown): value is PosPaymentMethod {
  return (
    value === "efectivo" ||
    value === "transferencia" ||
    value === "nequi" ||
    value === "daviplata" ||
    value === "qr" ||
    value === "mixto"
  );
}

function isPosDigitalChannel(value: unknown): value is PosDigitalChannel {
  return value === "transferencia" || value === "nequi" || value === "daviplata" || value === "qr";
}

function parsePaymentBreakdown(raw: unknown): OrderPaymentBreakdown | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const cashAmount = typeof data.cashAmount === "number" ? data.cashAmount : 0;
  const cashReceived = typeof data.cashReceived === "number" ? data.cashReceived : cashAmount;
  const changeAmount = typeof data.changeAmount === "number" ? data.changeAmount : 0;
  const digitalAmount = typeof data.digitalAmount === "number" ? data.digitalAmount : 0;
  return {
    cashAmount,
    cashReceived,
    changeAmount,
    digitalAmount,
    ...(isPosDigitalChannel(data.digitalMethod) ? { digitalMethod: data.digitalMethod } : {}),
    ...(typeof data.digitalReference === "string" && data.digitalReference.trim()
      ? { digitalReference: data.digitalReference.trim() }
      : {}),
  };
}

function parseExpense(raw: unknown): CashExpense | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id : randomUUID();
  const concept = typeof item.concept === "string" ? item.concept : "Gasto de barra";
  const category = (
    item.category === "hielo" ||
    item.category === "fruta" ||
    item.category === "domicilio" ||
    item.category === "insumo" ||
    item.category === "otro"
      ? item.category
      : "otro"
  ) as CashExpenseCategory;
  const amount = typeof item.amount === "number" && Number.isFinite(item.amount) ? Math.max(0, Math.round(item.amount)) : 0;
  return {
    id,
    concept,
    category,
    amount,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    createdByUid: typeof item.createdByUid === "string" ? item.createdByUid : "",
    ...(typeof item.createdByName === "string" && item.createdByName ? { createdByName: item.createdByName } : {}),
    ...(typeof item.notes === "string" && item.notes ? { notes: item.notes } : {}),
  };
}

function parseCashShiftDoc(id: string, data: Record<string, unknown>): CashShift {
  const status: CashRegisterStatus = data.status === "cerrada" ? "cerrada" : "abierta";
  const rawExpenses = Array.isArray(data.expenses) ? data.expenses : [];
  const expenses = rawExpenses.map(parseExpense).filter((item): item is CashExpense => item !== null);

  return {
    id,
    negocioId: typeof data.negocioId === "string" && data.negocioId.trim() ? data.negocioId.trim() : DEFAULT_TENANT_ID,
    status,
    openedAt: typeof data.openedAt === "string" ? data.openedAt : new Date().toISOString(),
    openedByUid: typeof data.openedByUid === "string" ? data.openedByUid : "",
    openedByName: typeof data.openedByName === "string" ? data.openedByName : "Operador",
    openingBase: typeof data.openingBase === "number" && Number.isFinite(data.openingBase) ? Math.max(0, Math.round(data.openingBase)) : 0,
    ...(typeof data.openingNotes === "string" && data.openingNotes ? { openingNotes: data.openingNotes } : {}),
    expenses,
    ...(typeof data.closedAt === "string" ? { closedAt: data.closedAt } : {}),
    ...(typeof data.closedByUid === "string" ? { closedByUid: data.closedByUid } : {}),
    ...(typeof data.closedByName === "string" ? { closedByName: data.closedByName } : {}),
    ...(typeof data.closingNotes === "string" && data.closingNotes ? { closingNotes: data.closingNotes } : {}),
    ...(data.salesSnapshot && typeof data.salesSnapshot === "object"
      ? { salesSnapshot: data.salesSnapshot as CashShift["salesSnapshot"] }
      : {}),
    ...(data.countBreakdown && typeof data.countBreakdown === "object"
      ? { countBreakdown: data.countBreakdown as CashShift["countBreakdown"] }
      : {}),
    ...(data.reconciliation && typeof data.reconciliation === "object"
      ? { reconciliation: data.reconciliation as CashShift["reconciliation"] }
      : {}),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

async function fetchOrdersForShiftWindow(
  negocioId: string,
  openedAt: string,
  closedAt?: string,
): Promise<PaymentChannelTotals> {
  const snapshot = await getAdminDb()
    .collection("pedidos")
    .where("createdAt", ">=", openedAt)
    .orderBy("createdAt", "desc")
    .get();

  const orders: Array<
    Pick<Order, "createdAt" | "status" | "total" | "paymentMethod" | "paymentBreakdown">
  > = [];

  for (const doc of snapshot.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const orderNegocioId =
      typeof data.negocioId === "string" && data.negocioId.trim()
        ? data.negocioId.trim()
        : DEFAULT_TENANT_ID;
    if (orderNegocioId !== negocioId) continue;

    const createdAt = typeof data.createdAt === "string" ? data.createdAt : "";
    const status = (typeof data.status === "string" ? data.status : "pendiente") as Order["status"];
    const total = typeof data.total === "number" ? data.total : 0;
    const paymentMethod = isPosPaymentMethod(data.paymentMethod) ? data.paymentMethod : undefined;
    const paymentBreakdown = parsePaymentBreakdown(data.paymentBreakdown);

    orders.push({
      createdAt,
      status,
      total,
      paymentMethod,
      paymentBreakdown,
    });
  }

  return calculateOrderPaymentChannels(orders, openedAt, closedAt);
}

export async function listCashShifts(
  negocioId: string = DEFAULT_TENANT_ID,
  limit = 20,
): Promise<CashShift[]> {
  const snapshot = await getAdminDb()
    .collection(COLLECTION)
    .where("negocioId", "==", negocioId)
    .get();

  const shifts = snapshot.docs.map((doc) =>
    parseCashShiftDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>),
  );

  return shifts
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, Math.max(1, limit));
}

export async function getCashDashboardState(negocioId: string = DEFAULT_TENANT_ID): Promise<{
  activeShift: CashShift | null;
  liveSales: PaymentChannelTotals | null;
  history: CashShift[];
}> {
  const shifts = await listCashShifts(negocioId, 25);
  const activeShift = shifts.find((shift) => shift.status === "abierta") ?? null;
  const history = shifts.filter((shift) => shift.status === "cerrada").slice(0, 15);

  const liveSales = activeShift
    ? await fetchOrdersForShiftWindow(negocioId, activeShift.openedAt)
    : null;

  return {
    activeShift,
    liveSales,
    history,
  };
}

export async function openCashShift(
  user: VerifiedUser,
  input: OpenCashShiftInput,
): Promise<CashShift> {
  const negocioId = input.negocioId?.trim() || user.profile.negocioId?.trim() || DEFAULT_TENANT_ID;
  requireNegocioAccess(user, negocioId);

  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc();
  const now = new Date().toISOString();
  const actorName = actorDisplayName(user);

  const shiftData = {
    negocioId,
    status: "abierta" as const,
    openedAt: now,
    openedByUid: user.uid,
    openedByName: actorName,
    openingBase: Math.max(0, Math.round(input.openingBase)),
    ...(input.openingNotes?.trim() ? { openingNotes: input.openingNotes.trim() } : {}),
    expenses: [] as CashExpense[],
    updatedAt: now,
  };

  await db.runTransaction(async (transaction) => {
    const existingOpenQuery = db
      .collection(COLLECTION)
      .where("negocioId", "==", negocioId)
      .where("status", "==", "abierta")
      .limit(1);
    const existingOpen = await transaction.get(existingOpenQuery);
    if (!existingOpen.empty) {
      throw new CashRegisterError(409, "Ya existe un turno de caja abierto para este local");
    }

    transaction.create(ref, shiftData);
    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "create",
      module: "caja",
      entityId: ref.id,
      changes: {
        negocioId,
        openingBase: shiftData.openingBase,
        openedByName: actorName,
      },
    });
  });

  return { id: ref.id, ...shiftData };
}

export async function addCashExpense(
  user: VerifiedUser,
  input: AddCashExpenseInput,
): Promise<CashShift> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(input.shiftId);
  const now = new Date().toISOString();
  const actorName = actorDisplayName(user);

  const newExpense: CashExpense = {
    id: randomUUID(),
    concept: input.concept.trim(),
    category: input.category,
    amount: Math.max(0, Math.round(input.amount)),
    createdAt: now,
    createdByUid: user.uid,
    createdByName: actorName,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };

  let updatedShift: CashShift | null = null;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      throw new CashRegisterError(404, "El turno de caja no existe");
    }

    const current = parseCashShiftDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    requireNegocioAccess(user, current.negocioId);

    if (current.status !== "abierta") {
      throw new CashRegisterError(409, "No se pueden registrar gastos en un turno cerrado");
    }

    const expenses = [...current.expenses, newExpense];
    transaction.update(ref, { expenses, updatedAt: now });
    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "update",
      module: "caja",
      entityId: current.id,
      changes: {
        expenseAdded: newExpense,
      },
    });

    updatedShift = { ...current, expenses, updatedAt: now };
  });

  if (!updatedShift) {
    throw new CashRegisterError(500, "No se pudo registrar el gasto de caja");
  }

  return updatedShift;
}

export async function closeCashShift(
  user: VerifiedUser,
  input: CloseCashShiftInput,
): Promise<CashShift> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(input.shiftId);
  const closedAt = new Date().toISOString();
  const actorName = actorDisplayName(user);

  const preSnap = await ref.get();
  if (!preSnap.exists) {
    throw new CashRegisterError(404, "El turno de caja no existe");
  }
  const preShift = parseCashShiftDoc(preSnap.id, (preSnap.data() ?? {}) as Record<string, unknown>);
  requireNegocioAccess(user, preShift.negocioId);

  if (preShift.status !== "abierta") {
    throw new CashRegisterError(409, "Este turno de caja ya fue cerrado");
  }

  const salesSnapshot = await fetchOrdersForShiftWindow(preShift.negocioId, preShift.openedAt, closedAt);

  let closedShift: CashShift | null = null;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      throw new CashRegisterError(404, "El turno de caja no existe");
    }
    const current = parseCashShiftDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    requireNegocioAccess(user, current.negocioId);

    if (current.status !== "abierta") {
      throw new CashRegisterError(409, "Este turno de caja ya fue cerrado");
    }

    const reconciliation = calculateCashReconciliation({
      openingBase: current.openingBase,
      sales: salesSnapshot,
      expenses: current.expenses,
      count: input.countBreakdown,
    });

    const patch = {
      status: "cerrada" as const,
      closedAt,
      closedByUid: user.uid,
      closedByName: actorName,
      ...(input.closingNotes?.trim() ? { closingNotes: input.closingNotes.trim() } : {}),
      salesSnapshot,
      countBreakdown: input.countBreakdown,
      reconciliation,
      updatedAt: closedAt,
    };

    transaction.update(ref, patch);
    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "close",
      module: "caja",
      entityId: current.id,
      changes: {
        closedByName: actorName,
        expectedCash: reconciliation.expectedCash,
        declaredCash: reconciliation.declaredCash,
        cashDifference: reconciliation.cashDifference,
        statusLabel: reconciliation.statusLabel,
        totalVentas: salesSnapshot.totalVentas,
        totalExpenses: reconciliation.totalExpenses,
      },
    });

    closedShift = { ...current, ...patch };
  });

  if (!closedShift) {
    throw new CashRegisterError(500, "No se pudo cerrar el turno de caja");
  }

  return closedShift;
}
