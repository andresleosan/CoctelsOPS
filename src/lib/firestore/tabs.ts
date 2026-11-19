import "server-only";

import { randomUUID } from "node:crypto";

import { requireNegocioAccess } from "@/lib/auth/permissions";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import { productFromData } from "@/lib/firestore/products";
import {
  calculateBarTabTotals,
  normalizeTableNumber,
  validateBarTabPayments,
} from "@/lib/tabs/calculator";
import { calculateOrder } from "@/lib/validation/orders";
import type { VerifiedUser } from "@/types/auth";
import type { OrderItem } from "@/types/orders";
import type {
  AddBarTabRoundInput,
  BarTab,
  BarTabPaymentSplit,
  BarTabRound,
  BarTabSplitMode,
  BarTabStatus,
  CancelBarTabInput,
  CloseBarTabInput,
  OpenBarTabInput,
} from "@/types/tabs";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

const COLLECTION = "cuentas_mesas";

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
    });
  }

  return rounds;
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
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).where("negocioId", "==", negocioId).get();
  const tabs = snap.docs.map((doc) => toBarTab(doc.id, doc.data() as Record<string, unknown>));

  return tabs.sort((a, b) => {
    if (a.status === "abierta" && b.status !== "abierta") return -1;
    if (a.status !== "abierta" && b.status === "abierta") return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function openBarTab(actor: VerifiedUser, input: OpenBarTabInput): Promise<BarTab> {
  const negocioId = input.negocioId?.trim() || actor.profile.negocioId?.trim() || DEFAULT_TENANT_ID;
  requireNegocioAccess(actor, negocioId);

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

  const normalizedTarget = tableNumber.toLowerCase();
  const duplicate = openTabsSnap.docs.find((doc) => {
    const existingTable = String(doc.data().tableNumber ?? "").trim().toLowerCase();
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
      if (product.negocioId && product.negocioId !== currentTab.negocioId) {
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
    };

    const nextRounds = [...currentTab.rounds, newRound];
    const totals = calculateBarTabTotals(nextRounds);

    transaction.create(orderRef, orderPayload);
    transaction.create(notificationRef, {
      audience: "admin",
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
