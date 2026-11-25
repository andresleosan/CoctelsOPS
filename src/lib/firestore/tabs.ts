import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { requireNegocioAccess, resolveAuthorizedNegocioId } from "@/lib/auth/permissions";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import { productFromData } from "@/lib/firestore/products";
import {
  calculateBarTabTotals,
  calculateEqualSplitShares,
  canonicalizeTableNumber,
  getTableLookupKey,
  isPickupTableIdentifier,
  normalizeTableNumber,
  toPublicTableTab,
  validateBarTabPayments,
} from "@/lib/tabs/calculator";
import { calculateOrder } from "@/lib/validation/orders";
import type { VerifiedUser } from "@/types/auth";
import {
  ORDER_STATUSES,
  POS_PAYMENT_METHODS,
  type OrderItem,
  type OrderStatus,
  type PosPaymentMethod,
} from "@/types/orders";
import type {
  AddBarTabRoundInput,
  BarTab,
  BarTabBillRequest,
  BarTabPaymentSplit,
  BarTabRound,
  BarTabRoundSource,
  BarTabSplitMode,
  BarTabStatus,
  CancelBarTabInput,
  CloseBarTabInput,
  OpenBarTabInput,
  PublicAddTableRoundInput,
  PublicRequestBillInput,
  PublicTableTab,
  PublicTableTabRound,
} from "@/types/tabs";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

const COLLECTION = "cuentas_mesas";
const TABLE_RATE_LIMIT_COLLECTION = "table_rate_limits";
export const TABLE_RATE_LIMIT_MAX_REQUESTS = 20;
export const TABLE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export class BarTabError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BarTabError";
    this.status = status;
  }
}

function actorDisplayName(user: VerifiedUser): string {
  return (
    user.profile.displayName?.trim() ||
    user.token.name?.trim() ||
    user.profile.email?.trim() ||
    user.uid
  );
}

function parseStatus(value: unknown): BarTabStatus {
  if (value === "cerrada" || value === "cancelada") return value;
  return "abierta";
}

function parseSplitMode(value: unknown): BarTabSplitMode | undefined {
  if (value === "single" || value === "equal" || value === "custom") return value;
  return undefined;
}

function parseRounds(raw: unknown): BarTabRound[] {
  if (!Array.isArray(raw)) return [];
  const rounds: BarTabRound[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const roundNumber = typeof item.roundNumber === "number" ? item.roundNumber : rounds.length + 1;
    const orderId = typeof item.orderId === "string" ? item.orderId : "";
    const items = Array.isArray(item.items) ? (item.items as OrderItem[]) : [];
    const subtotal = typeof item.subtotal === "number" ? item.subtotal : 0;
    const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();
    const createdByUid = typeof item.createdByUid === "string" ? item.createdByUid : "";
    const source: BarTabRoundSource | undefined =
      item.source === "staff" || item.source === "cliente_qr" ? item.source : undefined;
    const idempotencyKey =
      typeof item.idempotencyKey === "string" && item.idempotencyKey.trim()
        ? item.idempotencyKey.trim()
        : undefined;

    rounds.push({
      roundNumber,
      orderId,
      items,
      subtotal,
      ...(typeof item.notes === "string" && item.notes.trim() ? { notes: item.notes.trim() } : {}),
      createdAt,
      createdByUid,
      ...(typeof item.createdByName === "string" && item.createdByName.trim()
        ? { createdByName: item.createdByName.trim() }
        : {}),
      ...(source ? { source } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  }

  return rounds;
}

function parseBillRequest(raw: unknown): BarTabBillRequest | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.requestedAt !== "string" || !candidate.requestedAt.trim()) {
    return undefined;
  }

  const splitMode = candidate.splitMode === "equal" ? "equal" : "single";
  const guestCount =
    typeof candidate.guestCount === "number" && Number.isFinite(candidate.guestCount) && candidate.guestCount > 0
      ? Math.round(candidate.guestCount)
      : 1;
  const perPersonAmount =
    typeof candidate.perPersonAmount === "number" &&
    Number.isFinite(candidate.perPersonAmount) &&
    candidate.perPersonAmount >= 0
      ? Math.round(candidate.perPersonAmount)
      : undefined;
  const preferredMethod =
    typeof candidate.preferredMethod === "string" &&
    (POS_PAYMENT_METHODS as readonly string[]).includes(candidate.preferredMethod)
      ? (candidate.preferredMethod as PosPaymentMethod)
      : undefined;

  return {
    requestedAt: candidate.requestedAt,
    splitMode,
    guestCount,
    ...(perPersonAmount !== undefined ? { perPersonAmount } : {}),
    ...(preferredMethod ? { preferredMethod } : {}),
    ...(typeof candidate.notes === "string" && candidate.notes.trim()
      ? { notes: candidate.notes.trim() }
      : {}),
  };
}

function parsePayments(raw: unknown): BarTabPaymentSplit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const payments: BarTabPaymentSplit[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const method = item.method;
    if (
      method !== "efectivo" &&
      method !== "transferencia" &&
      method !== "nequi" &&
      method !== "daviplata" &&
      method !== "qr"
    ) {
      continue;
    }

    payments.push({
      id: typeof item.id === "string" ? item.id : randomUUID(),
      label: typeof item.label === "string" ? item.label : "Pago",
      method,
      amount: typeof item.amount === "number" ? item.amount : 0,
      ...(typeof item.reference === "string" && item.reference.trim()
        ? { reference: item.reference.trim() }
        : {}),
      paidAt: typeof item.paidAt === "string" ? item.paidAt : new Date().toISOString(),
    });
  }

  return payments;
}

function toBarTab(id: string, data: Record<string, unknown>): BarTab {
  const rounds = parseRounds(data.rounds);
  const totals = calculateBarTabTotals(rounds);
  const billRequest = parseBillRequest(data.billRequest);

  return {
    id,
    negocioId:
      typeof data.negocioId === "string" && data.negocioId.trim()
        ? data.negocioId.trim()
        : DEFAULT_TENANT_ID,
    tableNumber: typeof data.tableNumber === "string" ? data.tableNumber : "Mesa",
    ...(typeof data.customerName === "string" && data.customerName.trim()
      ? { customerName: data.customerName.trim() }
      : {}),
    guestCount: typeof data.guestCount === "number" && data.guestCount > 0 ? data.guestCount : 1,
    status: parseStatus(data.status),
    rounds,
    subtotal: typeof data.subtotal === "number" ? data.subtotal : totals.subtotal,
    total: typeof data.total === "number" ? data.total : totals.total,
    ...(parseSplitMode(data.splitMode) ? { splitMode: parseSplitMode(data.splitMode) } : {}),
    ...(parsePayments(data.payments) ? { payments: parsePayments(data.payments) } : {}),
    ...(billRequest ? { billRequest } : {}),
    openedAt: typeof data.openedAt === "string" ? data.openedAt : new Date().toISOString(),
    openedByUid: typeof data.openedByUid === "string" ? data.openedByUid : "",
    openedByName: typeof data.openedByName === "string" ? data.openedByName : "Staff",
    ...(typeof data.closedAt === "string" ? { closedAt: data.closedAt } : {}),
    ...(typeof data.closedByUid === "string" ? { closedByUid: data.closedByUid } : {}),
    ...(typeof data.closedByName === "string" ? { closedByName: data.closedByName } : {}),
    ...(typeof data.closingNotes === "string" && data.closingNotes.trim()
      ? { closingNotes: data.closingNotes.trim() }
      : {}),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

export async function listBarTabs(negocioId: string): Promise<BarTab[]> {
  const cleanNegocioId = negocioId.trim() || DEFAULT_TENANT_ID;
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).where("negocioId", "==", cleanNegocioId).get();
  const tabs = snap.docs
    .map((doc) => toBarTab(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((tab) => tab.negocioId === cleanNegocioId);

  return tabs.sort((a, b) => {
    if (a.status === "abierta" && b.status !== "abierta") return -1;
    if (a.status !== "abierta" && b.status === "abierta") return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function listBarTabsForCaller(
  caller: VerifiedUser,
  negocioId?: string | null,
): Promise<BarTab[]> {
  const targetNegocioId = resolveAuthorizedNegocioId(caller, negocioId);
  return listBarTabs(targetNegocioId);
}

export async function openBarTab(actor: VerifiedUser, input: OpenBarTabInput): Promise<BarTab> {
  const negocioId = resolveAuthorizedNegocioId(actor, input.negocioId);

  const tableNumber = normalizeTableNumber(input.tableNumber);
  if (!tableNumber) {
    throw new BarTabError(422, "El número o nombre de mesa es obligatorio");
  }

  const db = getAdminDb();
  const openTabsSnap = await db
    .collection(COLLECTION)
    .where("negocioId", "==", negocioId)
    .where("status", "==", "abierta")
    .get();

  const normalizedTarget = getTableLookupKey(tableNumber);
  const duplicate = openTabsSnap.docs.find((doc) => {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const docNegocioId =
      typeof data.negocioId === "string" && data.negocioId.trim()
        ? data.negocioId.trim()
        : DEFAULT_TENANT_ID;
    if (docNegocioId !== negocioId) return false;
    const existingTable = getTableLookupKey(String(data.tableNumber ?? ""));
    return existingTable === normalizedTarget;
  });

  if (duplicate) {
    throw new BarTabError(409, `La mesa "${tableNumber}" ya tiene una cuenta abierta.`);
  }

  const now = new Date().toISOString();
  const ref = db.collection(COLLECTION).doc();
  const payload = {
    negocioId,
    tableNumber,
    ...(input.customerName?.trim() ? { customerName: input.customerName.trim() } : {}),
    guestCount: Math.max(1, Math.min(30, Math.round(input.guestCount ?? 1))),
    status: "abierta" as const,
    rounds: [],
    subtotal: 0,
    total: 0,
    openedAt: now,
    openedByUid: actor.uid,
    openedByName: actorDisplayName(actor),
    updatedAt: now,
  };

  await db.runTransaction(async (transaction) => {
    transaction.create(ref, payload);
    writeAuditInTransaction(transaction, {
      actorUid: actor.uid,
      action: "create",
      module: "pedidos",
      entityId: ref.id,
      changes: {
        action: "open_bar_tab",
        negocioId,
        tableNumber,
        guestCount: payload.guestCount,
      },
    });
  });

  return toBarTab(ref.id, payload);
}

export async function addRoundToBarTab(
  actor: VerifiedUser,
  input: AddBarTabRoundInput,
): Promise<{ tab: BarTab; orderId: string; round: BarTabRound }> {
  const db = getAdminDb();
  const tabRef = db.collection(COLLECTION).doc(input.tabId);
  const orderRef = db.collection("pedidos").doc();
  const notificationRef = db.collection("notificaciones").doc();

  const uniqueProductIds = [...new Set(input.items.map((item) => item.productId))];
  const productRefs = uniqueProductIds.map((productId) => ({
    productId,
    ref: db.collection("productos").doc(productId),
  }));

  let updatedTab: BarTab | null = null;
  let createdRound: BarTabRound | null = null;

  await db.runTransaction(async (transaction) => {
    const tabSnap = await transaction.get(tabRef);
    if (!tabSnap.exists) {
      throw new BarTabError(404, "Cuenta de mesa no encontrada");
    }

    const currentTab = toBarTab(tabSnap.id, (tabSnap.data() ?? {}) as Record<string, unknown>);
    requireNegocioAccess(actor, currentTab.negocioId);

    if (currentTab.status !== "abierta") {
      throw new BarTabError(409, "Solo se pueden agregar rondas a una cuenta abierta");
    }

    const productSnapshots = await Promise.all(
      productRefs.map(async ({ productId, ref }) => ({
        productId,
        ref,
        snapshot: await transaction.get(ref),
      })),
    );

    const availableProducts = productSnapshots
      .map(({ productId, snapshot }) =>
        snapshot.exists
          ? productFromData(productId, (snapshot.data() ?? {}) as Record<string, unknown>)
          : null,
      )
      .filter((product): product is NonNullable<typeof product> => product !== null);

    const customerName = currentTab.customerName || `Mesa ${currentTab.tableNumber}`;
    const roundNumber = currentTab.rounds.length + 1;
    const roundNote = input.notes?.trim()
      ? `Cuenta ${currentTab.tableNumber} · Ronda #${roundNumber} — ${input.notes.trim()}`
      : `Cuenta ${currentTab.tableNumber} · Ronda #${roundNumber}`;

    const calculated = calculateOrder(
      {
        customerName,
        phone: "0000000",
        address: `Mesa ${currentTab.tableNumber}`,
        serviceType: "mesa",
        tableNumber: currentTab.tableNumber,
        notes: roundNote,
        items: input.items,
      },
      availableProducts,
    );

    const now = new Date().toISOString();
    const actorName = actorDisplayName(actor);

    for (const { productId, ref } of productRefs) {
      const product = availableProducts.find((candidate) => candidate.id === productId);
      if (!product) {
        throw new BarTabError(422, "Producto no encontrado en el catálogo");
      }
      const effectiveProductNegocioId = product.negocioId?.trim() || DEFAULT_TENANT_ID;
      if (effectiveProductNegocioId !== currentTab.negocioId) {
        throw new BarTabError(403, "El producto no pertenece a este local");
      }
      const quantity = input.items
        .filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + item.quantity, 0);
      const resultingStock = product.stock - quantity;
      const movementRef = db.collection("inventario_movimientos").doc();

      transaction.update(ref, {
        stock: resultingStock,
        available: resultingStock > 0,
        updatedAt: now,
      });
      transaction.create(movementRef, {
        negocioId: currentTab.negocioId,
        productId,
        type: "salida",
        quantity,
        reason: `Cuenta ${currentTab.tableNumber} Ronda #${roundNumber} (${orderRef.id})`,
        actorUid: actor.uid,
        orderId: orderRef.id,
        previousStock: product.stock,
        resultingStock,
        createdAt: now,
      });
    }

    const orderPayload = {
      clienteUid: actor.uid,
      customerName,
      phone: "0000000",
      address: `Mesa ${currentTab.tableNumber}`,
      negocioId: currentTab.negocioId,
      notes: roundNote,
      serviceType: "mesa" as const,
      tableNumber: currentTab.tableNumber,
      barTabId: currentTab.id,
      barTabRoundNumber: roundNumber,
      items: calculated.items,
      subtotal: calculated.subtotal,
      total: calculated.total,
      status: "pendiente" as const,
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ status: "pendiente" as const, actorUid: actor.uid, at: now }],
      audit: { createdByUid: actor.uid, createdAt: now },
    };

    const newRound: BarTabRound = {
      roundNumber,
      orderId: orderRef.id,
      items: calculated.items,
      subtotal: calculated.subtotal,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      createdAt: now,
      createdByUid: actor.uid,
      createdByName: actorName,
      source: "staff",
    };

    const nextRounds = [...currentTab.rounds, newRound];
    const totals = calculateBarTabTotals(nextRounds);

    transaction.create(orderRef, orderPayload);
    transaction.create(notificationRef, {
      audience: "admin",
      negocioId: currentTab.negocioId,
      title: `Ronda #${roundNumber} · ${currentTab.tableNumber}`,
      message: `Nueva ronda de ${calculated.items.length} ítem(s) enviada al KDS.`,
      orderId: orderRef.id,
      read: false,
      createdAt: now,
    });
    transaction.update(tabRef, {
      rounds: nextRounds,
      subtotal: totals.subtotal,
      total: totals.total,
      updatedAt: now,
    });
    writeAuditInTransaction(transaction, {
      actorUid: actor.uid,
      action: "update",
      module: "pedidos",
      entityId: currentTab.id,
      changes: {
        action: "add_bar_tab_round",
        negocioId: currentTab.negocioId,
        roundNumber,
        orderId: orderRef.id,
        roundSubtotal: calculated.subtotal,
        tabTotal: totals.total,
      },
    });

    createdRound = newRound;
    updatedTab = {
      ...currentTab,
      rounds: nextRounds,
      subtotal: totals.subtotal,
      total: totals.total,
      updatedAt: now,
    };
  });

  if (!updatedTab || !createdRound) {
    throw new BarTabError(500, "No se pudo registrar la ronda en la cuenta");
  }

  return { tab: updatedTab, orderId: orderRef.id, round: createdRound };
}

export async function closeBarTab(actor: VerifiedUser, input: CloseBarTabInput): Promise<BarTab> {
  const db = getAdminDb();
  const tabRef = db.collection(COLLECTION).doc(input.tabId);
  let closedTab: BarTab | null = null;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(tabRef);
    if (!snap.exists) {
      throw new BarTabError(404, "Cuenta de mesa no encontrada");
    }

    const currentTab = toBarTab(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    requireNegocioAccess(actor, currentTab.negocioId);

    if (currentTab.status !== "abierta") {
      throw new BarTabError(409, "Esta cuenta ya fue cerrada o cancelada");
    }
    if (currentTab.rounds.length === 0 || currentTab.total <= 0) {
      throw new BarTabError(
        422,
        "La cuenta no tiene rondas registradas. Cancela la mesa si no hubo consumo.",
      );
    }

    const validation = validateBarTabPayments(currentTab.total, input.payments);
    if (!validation.isCovered) {
      throw new BarTabError(
        422,
        `El total pagado ($${validation.totalPaid.toLocaleString("es-CO")}) no cubre el saldo de la cuenta ($${validation.total.toLocaleString("es-CO")}).`,
      );
    }

    const now = new Date().toISOString();
    const actorName = actorDisplayName(actor);
    const payments: BarTabPaymentSplit[] = input.payments.map((payment, index) => ({
      id: randomUUID(),
      label: payment.label?.trim() || `Pago ${index + 1}`,
      method: payment.method,
      amount: Math.round(payment.amount),
      ...(payment.reference?.trim() ? { reference: payment.reference.trim() } : {}),
      paidAt: now,
    }));

    const guestCount =
      typeof input.guestCount === "number" && input.guestCount > 0
        ? Math.round(input.guestCount)
        : currentTab.guestCount;

    transaction.update(tabRef, {
      status: "cerrada",
      splitMode: input.splitMode,
      guestCount,
      payments,
      closedAt: now,
      closedByUid: actor.uid,
      closedByName: actorName,
      ...(input.closingNotes?.trim() ? { closingNotes: input.closingNotes.trim() } : {}),
      updatedAt: now,
    });

    writeAuditInTransaction(transaction, {
      actorUid: actor.uid,
      action: "update",
      module: "pedidos",
      entityId: currentTab.id,
      changes: {
        action: "close_bar_tab",
        negocioId: currentTab.negocioId,
        tableNumber: currentTab.tableNumber,
        total: currentTab.total,
        splitMode: input.splitMode,
        paymentsCount: payments.length,
      },
    });

    closedTab = {
      ...currentTab,
      status: "cerrada",
      splitMode: input.splitMode,
      guestCount,
      payments,
      closedAt: now,
      closedByUid: actor.uid,
      closedByName: actorName,
      ...(input.closingNotes?.trim() ? { closingNotes: input.closingNotes.trim() } : {}),
      updatedAt: now,
    };
  });

  if (!closedTab) {
    throw new BarTabError(500, "No se pudo cerrar la cuenta de la mesa");
  }

  return closedTab;
}

export async function cancelBarTab(actor: VerifiedUser, input: CancelBarTabInput): Promise<BarTab> {
  const db = getAdminDb();
  const tabRef = db.collection(COLLECTION).doc(input.tabId);
  let cancelledTab: BarTab | null = null;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(tabRef);
    if (!snap.exists) {
      throw new BarTabError(404, "Cuenta de mesa no encontrada");
    }

    const currentTab = toBarTab(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    requireNegocioAccess(actor, currentTab.negocioId);

    if (currentTab.status !== "abierta") {
      throw new BarTabError(409, "Solo se pueden cancelar cuentas abiertas");
    }
    if (currentTab.rounds.length > 0) {
      throw new BarTabError(
        409,
        "La mesa ya tiene rondas enviadas al KDS; debes cerrarla con su pago correspondiente.",
      );
    }

    const now = new Date().toISOString();
    const actorName = actorDisplayName(actor);

    transaction.update(tabRef, {
      status: "cancelada",
      closedAt: now,
      closedByUid: actor.uid,
      closedByName: actorName,
      ...(input.reason?.trim() ? { closingNotes: input.reason.trim() } : {}),
      updatedAt: now,
    });

    writeAuditInTransaction(transaction, {
      actorUid: actor.uid,
      action: "update",
      module: "pedidos",
      entityId: currentTab.id,
      changes: {
        action: "cancel_bar_tab",
        negocioId: currentTab.negocioId,
        tableNumber: currentTab.tableNumber,
        reason: input.reason?.trim() || "Cancelada sin consumo",
      },
    });

    cancelledTab = {
      ...currentTab,
      status: "cancelada",
      closedAt: now,
      closedByUid: actor.uid,
      closedByName: actorName,
      ...(input.reason?.trim() ? { closingNotes: input.reason.trim() } : {}),
      updatedAt: now,
    };
  });

  if (!cancelledTab) {
    throw new BarTabError(500, "No se pudo cancelar la cuenta");
  }

  return cancelledTab;
}

function parseOrderStatus(value: unknown): OrderStatus | undefined {
  if (typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value)) {
    return value as OrderStatus;
  }
  return undefined;
}

function assertPublicTableName(rawMesaId: string): { canonicalTable: string; targetKey: string } {
  if (isPickupTableIdentifier(rawMesaId)) {
    throw new BarTabError(422, "El modo retiro en barra no utiliza cuenta de mesa en vivo.");
  }

  const canonicalTable = canonicalizeTableNumber(rawMesaId);
  if (!canonicalTable) {
    throw new BarTabError(422, "El identificador de mesa es obligatorio");
  }

  return {
    canonicalTable,
    targetKey: getTableLookupKey(canonicalTable),
  };
}

async function loadOrderStatusMapInTransaction(
  db: Firestore,
  transaction: FirebaseFirestore.Transaction,
  rounds: BarTabRound[],
  negocioId: string,
): Promise<Map<string, OrderStatus>> {
  const statusMap = new Map<string, OrderStatus>();
  const uniqueOrderIds = [...new Set(rounds.map((r) => r.orderId).filter((id) => Boolean(id?.trim())))];
  if (uniqueOrderIds.length === 0) return statusMap;

  const snapshots = await Promise.all(
    uniqueOrderIds.map(async (orderId) => ({
      orderId,
      snap: await transaction.get(db.collection("pedidos").doc(orderId)).catch(() => null),
    })),
  );

  for (const { orderId, snap } of snapshots) {
    if (!snap || !snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const orderNegocioId =
      typeof data.negocioId === "string" && data.negocioId.trim()
        ? data.negocioId.trim()
        : DEFAULT_TENANT_ID;
    if (orderNegocioId !== negocioId) continue;
    const status = parseOrderStatus(data.status);
    if (status) {
      statusMap.set(orderId, status);
    }
  }

  return statusMap;
}

async function loadOrderStatusMap(
  db: Firestore,
  rounds: BarTabRound[],
  negocioId: string,
): Promise<Map<string, OrderStatus>> {
  const statusMap = new Map<string, OrderStatus>();
  const uniqueOrderIds = [...new Set(rounds.map((r) => r.orderId).filter((id) => Boolean(id?.trim())))];
  if (uniqueOrderIds.length === 0) return statusMap;

  const snapshots = await Promise.all(
    uniqueOrderIds.map(async (orderId) => ({
      orderId,
      snap: await db.collection("pedidos").doc(orderId).get().catch(() => null),
    })),
  );

  for (const { orderId, snap } of snapshots) {
    if (!snap || !snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const orderNegocioId =
      typeof data.negocioId === "string" && data.negocioId.trim()
        ? data.negocioId.trim()
        : DEFAULT_TENANT_ID;
    if (orderNegocioId !== negocioId) continue;
    const status = parseOrderStatus(data.status);
    if (status) {
      statusMap.set(orderId, status);
    }
  }

  return statusMap;
}

export async function reserveTableActionRateLimit(options: {
  db: Firestore;
  digest: string;
  now?: Date;
}): Promise<boolean> {
  const now = options.now ?? new Date();
  const nowTimestamp = Timestamp.fromDate(now);
  const reference = options.db.collection(TABLE_RATE_LIMIT_COLLECTION).doc(options.digest);

  return options.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists) {
      transaction.create(reference, {
        windowStartedAt: nowTimestamp,
        count: 1,
        updatedAt: nowTimestamp,
      });
      return true;
    }

    const data = snapshot.data() as {
      windowStartedAt: Timestamp;
      count: number;
    };
    const windowIsActive =
      now.getTime() - data.windowStartedAt.toDate().getTime() < TABLE_RATE_LIMIT_WINDOW_MS;

    if (windowIsActive && data.count >= TABLE_RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }

    transaction.update(reference, {
      windowStartedAt: windowIsActive ? data.windowStartedAt : nowTimestamp,
      count: windowIsActive ? data.count + 1 : 1,
      updatedAt: nowTimestamp,
    });
    return true;
  });
}

export async function getPublicTableTab(
  negocioId: string,
  rawMesaId: string,
): Promise<{ tableNumber: string; tab: PublicTableTab | null }> {
  const { canonicalTable, targetKey } = assertPublicTableName(rawMesaId);
  const cleanNegocioId = negocioId.trim() || DEFAULT_TENANT_ID;
  const db = getAdminDb();

  const openTabsSnap = await db
    .collection(COLLECTION)
    .where("negocioId", "==", cleanNegocioId)
    .where("status", "==", "abierta")
    .get();

  const matchedDoc = openTabsSnap.docs.find((doc) => {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const docNegocioId =
      typeof data.negocioId === "string" && data.negocioId.trim()
        ? data.negocioId.trim()
        : DEFAULT_TENANT_ID;
    return (
      docNegocioId === cleanNegocioId &&
      getTableLookupKey(String(data.tableNumber ?? "")) === targetKey
    );
  });

  if (!matchedDoc) {
    return { tableNumber: canonicalTable, tab: null };
  }

  const tab = toBarTab(matchedDoc.id, (matchedDoc.data() ?? {}) as Record<string, unknown>);
  const statusMap = await loadOrderStatusMap(db, tab.rounds, cleanNegocioId);

  return {
    tableNumber: tab.tableNumber,
    tab: toPublicTableTab(tab, statusMap),
  };
}

export async function addPublicRoundToTableTab(
  input: PublicAddTableRoundInput,
): Promise<{
  tab: PublicTableTab;
  orderId: string;
  round: PublicTableTabRound;
  createdTab: boolean;
  idempotentReplay: boolean;
}> {
  const { canonicalTable, targetKey } = assertPublicTableName(input.tableNumber);
  const negocioId = input.negocioId.trim() || DEFAULT_TENANT_ID;
  const cleanIdempotencyKey = input.idempotencyKey?.trim() || undefined;
  const db = getAdminDb();

  const orderRef = cleanIdempotencyKey
    ? db
        .collection("pedidos")
        .doc(
          `qr_${createHash("sha256")
            .update(`${negocioId}:${targetKey}:${cleanIdempotencyKey}`)
            .digest("hex")
            .slice(0, 28)}`,
        )
    : db.collection("pedidos").doc();

  const uniqueProductIds = [...new Set(input.items.map((item) => item.productId))];
  const productRefs = uniqueProductIds.map((productId) => ({
    productId,
    ref: db.collection("productos").doc(productId),
  }));

  let result: {
    tab: PublicTableTab;
    orderId: string;
    round: PublicTableTabRound;
    createdTab: boolean;
    idempotentReplay: boolean;
  } | null = null;

  await db.runTransaction(async (transaction) => {
    const openTabsQuery = db
      .collection(COLLECTION)
      .where("negocioId", "==", negocioId)
      .where("status", "==", "abierta");

    const openTabsSnap = await transaction.get(openTabsQuery);
    const existingTabDoc = openTabsSnap.docs.find((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const docNegocioId =
        typeof data.negocioId === "string" && data.negocioId.trim()
          ? data.negocioId.trim()
          : DEFAULT_TENANT_ID;
      return (
        docNegocioId === negocioId &&
        getTableLookupKey(String(data.tableNumber ?? "")) === targetKey
      );
    });
    const existingTab = existingTabDoc
      ? toBarTab(existingTabDoc.id, (existingTabDoc.data() ?? {}) as Record<string, unknown>)
      : null;

    const existingOrderSnap = cleanIdempotencyKey ? await transaction.get(orderRef) : null;

    if (cleanIdempotencyKey && existingTab) {
      const existingRound = existingTab.rounds.find(
        (round) => round.idempotencyKey === cleanIdempotencyKey,
      );
      if (existingRound) {
        const statusMap = await loadOrderStatusMapInTransaction(
          db,
          transaction,
          existingTab.rounds,
          negocioId,
        );
        const publicTab = toPublicTableTab(existingTab, statusMap);
        const publicRound =
          publicTab.rounds.find((round) => round.roundNumber === existingRound.roundNumber) ??
          publicTab.rounds[publicTab.rounds.length - 1];

        result = {
          tab: publicTab,
          orderId: existingRound.orderId,
          round: publicRound,
          createdTab: false,
          idempotentReplay: true,
        };
        return;
      }
    }

    if (existingOrderSnap?.exists) {
      const orderData = (existingOrderSnap.data() ?? {}) as Record<string, unknown>;
      const orderNegocioId =
        typeof orderData.negocioId === "string" && orderData.negocioId.trim()
          ? orderData.negocioId.trim()
          : DEFAULT_TENANT_ID;
      if (orderNegocioId !== negocioId) {
        throw new BarTabError(403, "Esta ronda pertenece a otro local.");
      }
      const linkedTabId = typeof orderData.barTabId === "string" ? orderData.barTabId.trim() : "";
      if (linkedTabId) {
        const linkedTabSnap = await transaction.get(db.collection(COLLECTION).doc(linkedTabId));
        if (linkedTabSnap.exists) {
          const linkedTab = toBarTab(
            linkedTabSnap.id,
            (linkedTabSnap.data() ?? {}) as Record<string, unknown>,
          );
          if (linkedTab.negocioId !== negocioId) {
            throw new BarTabError(403, "Esta cuenta pertenece a otro local.");
          }
          const statusMap = await loadOrderStatusMapInTransaction(
            db,
            transaction,
            linkedTab.rounds,
            negocioId,
          );
          const publicTab = toPublicTableTab(linkedTab, statusMap);
          const matchedRound =
            publicTab.rounds.find((round) => round.orderId === orderRef.id) ??
            publicTab.rounds[publicTab.rounds.length - 1];
          if (matchedRound) {
            result = {
              tab: publicTab,
              orderId: orderRef.id,
              round: matchedRound,
              createdTab: false,
              idempotentReplay: true,
            };
            return;
          }
        }
      }
      throw new BarTabError(409, "Esta ronda ya fue procesada previamente.");
    }

    const existingRoundStatuses = existingTab
      ? await loadOrderStatusMapInTransaction(db, transaction, existingTab.rounds, negocioId)
      : new Map<string, OrderStatus>();

    const productSnapshots = await Promise.all(
      productRefs.map(async ({ productId, ref }) => ({
        productId,
        ref,
        snapshot: await transaction.get(ref),
      })),
    );

    const productsById = new Map<string, ReturnType<typeof productFromData>>();
    for (const { productId, snapshot } of productSnapshots) {
      if (!snapshot.exists) {
        throw new BarTabError(422, "Producto no encontrado en el catálogo");
      }
      const product = productFromData(
        productId,
        (snapshot.data() ?? {}) as Record<string, unknown>,
      );
      const effectiveProductNegocioId = product.negocioId?.trim() || DEFAULT_TENANT_ID;
      if (effectiveProductNegocioId !== negocioId) {
        throw new BarTabError(403, "El producto no pertenece a este local");
      }
      productsById.set(productId, product);
    }

    const availableProducts = [...productsById.values()];
    const tabTableNumber = existingTab ? existingTab.tableNumber : canonicalTable;
    const roundNumber = existingTab ? existingTab.rounds.length + 1 : 1;
    const cleanCustomerName = input.customerName?.trim() || undefined;
    const resolvedCustomerName = existingTab?.customerName || cleanCustomerName || tabTableNumber;
    const roundNote = input.notes?.trim()
      ? `Cuenta ${tabTableNumber} · Ronda QR #${roundNumber} — ${input.notes.trim()}`
      : `Cuenta ${tabTableNumber} · Ronda QR #${roundNumber}`;

    const calculated = calculateOrder(
      {
        customerName: resolvedCustomerName,
        phone: "0000000",
        address: `${tabTableNumber} - Consumo en local`,
        serviceType: "mesa",
        tableNumber: tabTableNumber,
        notes: roundNote,
        items: input.items,
      },
      availableProducts,
    );

    const now = new Date().toISOString();
    const actorUid =
      input.actorUid?.trim() || `qr_mesa:${targetKey.replace(/[^a-z0-9]+/g, "-")}`;
    const actorName = input.actorName?.trim() || cleanCustomerName || tabTableNumber;

    // Todas las lecturas finalizaron: ahora ejecutamos únicamente escrituras atómicas.
    for (const { productId, ref } of productRefs) {
      const product = productsById.get(productId)!;
      const quantity = input.items
        .filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + item.quantity, 0);
      const resultingStock = product.stock - quantity;
      const movementRef = db.collection("inventario_movimientos").doc();

      transaction.update(ref, {
        stock: resultingStock,
        available: resultingStock > 0,
        updatedAt: now,
      });
      transaction.create(movementRef, {
        negocioId,
        productId,
        type: "salida",
        quantity,
        reason: `Cuenta ${tabTableNumber} Ronda QR #${roundNumber} (${orderRef.id})`,
        actorUid,
        orderId: orderRef.id,
        previousStock: product.stock,
        resultingStock,
        createdAt: now,
      });
    }

    const tabRef = existingTabDoc ? existingTabDoc.ref : db.collection(COLLECTION).doc();
    const notificationRef = db.collection("notificaciones").doc();

    const orderPayload = {
      clienteUid: actorUid,
      customerName: resolvedCustomerName,
      phone: "0000000",
      address: `${tabTableNumber} - Consumo en local`,
      negocioId,
      notes: roundNote,
      serviceType: "mesa" as const,
      tableNumber: tabTableNumber,
      barTabId: tabRef.id,
      barTabRoundNumber: roundNumber,
      source: "cliente_qr" as const,
      items: calculated.items,
      subtotal: calculated.subtotal,
      total: calculated.total,
      status: "pendiente" as const,
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ status: "pendiente" as const, actorUid, at: now }],
      audit: { createdByUid: actorUid, createdAt: now },
    };

    const newRound: BarTabRound = {
      roundNumber,
      orderId: orderRef.id,
      items: calculated.items,
      subtotal: calculated.subtotal,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      createdAt: now,
      createdByUid: actorUid,
      createdByName: actorName,
      source: "cliente_qr",
      ...(cleanIdempotencyKey ? { idempotencyKey: cleanIdempotencyKey } : {}),
    };

    const nextRounds = existingTab ? [...existingTab.rounds, newRound] : [newRound];
    const totals = calculateBarTabTotals(nextRounds);
    const updatedCustomerName =
      existingTab && !existingTab.customerName && cleanCustomerName ? cleanCustomerName : undefined;
    const guestCount = existingTab
      ? existingTab.guestCount
      : Math.max(1, Math.min(20, Math.round(input.guestCount ?? 1)));

    transaction.create(orderRef, orderPayload);
    transaction.create(notificationRef, {
      audience: "admin",
      negocioId,
      title: `Ronda QR #${roundNumber} · ${tabTableNumber}`,
      message: `El cliente pidió ${calculated.items.length} ítem(s) desde ${tabTableNumber}.`,
      orderId: orderRef.id,
      tabId: tabRef.id,
      read: false,
      createdAt: now,
    });

    let resultingTab: BarTab;

    if (existingTab) {
      transaction.update(tabRef, {
        rounds: nextRounds,
        subtotal: totals.subtotal,
        total: totals.total,
        ...(updatedCustomerName ? { customerName: updatedCustomerName } : {}),
        updatedAt: now,
      });

      resultingTab = {
        ...existingTab,
        ...(updatedCustomerName ? { customerName: updatedCustomerName } : {}),
        rounds: nextRounds,
        subtotal: totals.subtotal,
        total: totals.total,
        updatedAt: now,
      };
    } else {
      const tabPayload = {
        negocioId,
        tableNumber: canonicalTable,
        ...(cleanCustomerName ? { customerName: cleanCustomerName } : {}),
        guestCount,
        status: "abierta" as const,
        rounds: nextRounds,
        subtotal: totals.subtotal,
        total: totals.total,
        openedAt: now,
        openedByUid: actorUid,
        openedByName: actorName,
        updatedAt: now,
      };

      transaction.create(tabRef, tabPayload);
      resultingTab = toBarTab(tabRef.id, tabPayload);
    }

    writeAuditInTransaction(transaction, {
      actorUid,
      action: existingTab ? "update" : "create",
      module: "pedidos",
      entityId: tabRef.id,
      changes: {
        action: "add_public_qr_round",
        negocioId,
        tableNumber: tabTableNumber,
        roundNumber,
        orderId: orderRef.id,
        roundSubtotal: calculated.subtotal,
        tabTotal: totals.total,
      },
    });

    existingRoundStatuses.set(orderRef.id, "pendiente");
    const publicTab = toPublicTableTab(resultingTab, existingRoundStatuses);
    const publicRound = publicTab.rounds[publicTab.rounds.length - 1];

    result = {
      tab: publicTab,
      orderId: orderRef.id,
      round: publicRound,
      createdTab: !existingTab,
      idempotentReplay: false,
    };
  });

  if (!result) {
    throw new BarTabError(500, "No se pudo registrar la ronda en la mesa");
  }

  return result;
}

export async function requestTableBill(
  input: PublicRequestBillInput,
): Promise<{ tab: PublicTableTab }> {
  const { canonicalTable, targetKey } = assertPublicTableName(input.tableNumber);
  const negocioId = input.negocioId.trim() || DEFAULT_TENANT_ID;
  const db = getAdminDb();

  let updatedPublicTab: PublicTableTab | null = null;

  await db.runTransaction(async (transaction) => {
    const openTabsQuery = db
      .collection(COLLECTION)
      .where("negocioId", "==", negocioId)
      .where("status", "==", "abierta");

    const openTabsSnap = await transaction.get(openTabsQuery);
    const existingTabDoc = openTabsSnap.docs.find((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const docNegocioId =
        typeof data.negocioId === "string" && data.negocioId.trim()
          ? data.negocioId.trim()
          : DEFAULT_TENANT_ID;
      return (
        docNegocioId === negocioId &&
        getTableLookupKey(String(data.tableNumber ?? "")) === targetKey
      );
    });

    if (!existingTabDoc) {
      throw new BarTabError(404, "No hay una cuenta abierta para esta mesa.");
    }

    const currentTab = toBarTab(
      existingTabDoc.id,
      (existingTabDoc.data() ?? {}) as Record<string, unknown>,
    );

    if (currentTab.rounds.length === 0 || currentTab.total <= 0) {
      throw new BarTabError(422, "Agrega al menos una ronda antes de solicitar la cuenta.");
    }

    const statusMap = await loadOrderStatusMapInTransaction(
      db,
      transaction,
      currentTab.rounds,
      currentTab.negocioId,
    );
    const safeGuests =
      input.splitMode === "equal"
        ? Math.max(2, Math.min(20, Math.round(input.guestCount)))
        : Math.max(1, currentTab.guestCount);
    const perPersonAmount =
      input.splitMode === "equal"
        ? calculateEqualSplitShares(currentTab.total, safeGuests)[0]
        : currentTab.total;

    const now = new Date().toISOString();
    const actorUid =
      input.actorUid?.trim() || `qr_mesa:${targetKey.replace(/[^a-z0-9]+/g, "-")}`;
    const billRequest: BarTabBillRequest = {
      requestedAt: now,
      splitMode: input.splitMode,
      guestCount: safeGuests,
      perPersonAmount,
      ...(input.preferredMethod ? { preferredMethod: input.preferredMethod } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    };

    const notificationRef = db.collection("notificaciones").doc();
    const splitText =
      input.splitMode === "equal"
        ? `Cuenta dividida entre ${safeGuests} personas (~$${perPersonAmount.toLocaleString("es-CO")} c/u)`
        : "Pago completo";

    transaction.update(existingTabDoc.ref, {
      billRequest,
      guestCount: safeGuests,
      updatedAt: now,
    });
    transaction.create(notificationRef, {
      audience: "admin",
      negocioId: currentTab.negocioId,
      title: `Cuenta solicitada · ${currentTab.tableNumber}`,
      message: `${splitText} · Total: $${currentTab.total.toLocaleString("es-CO")}`,
      tabId: currentTab.id,
      read: false,
      createdAt: now,
    });
    writeAuditInTransaction(transaction, {
      actorUid,
      action: "update",
      module: "pedidos",
      entityId: currentTab.id,
      changes: {
        action: "request_table_bill",
        negocioId: currentTab.negocioId,
        tableNumber: canonicalTable,
        splitMode: input.splitMode,
        guestCount: safeGuests,
        perPersonAmount,
        ...(input.preferredMethod ? { preferredMethod: input.preferredMethod } : {}),
      },
    });

    updatedPublicTab = toPublicTableTab(
      {
        ...currentTab,
        billRequest,
        guestCount: safeGuests,
        updatedAt: now,
      },
      statusMap,
    );
  });

  if (!updatedPublicTab) {
    throw new BarTabError(500, "No se pudo solicitar la cuenta de la mesa");
  }

  return { tab: updatedPublicTab };
}
