import "server-only";

import { createHash } from "node:crypto";

import { hasPermission } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { getProductById, productFromData } from "@/lib/firestore/products";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import { calculatePromotion, getPromotionByCode, toPromotion } from "@/lib/firestore/promotions";
import { toCustomerOrder } from "@/lib/orders/customer-order";
import {
  assertOrderOwnership,
  assertValidTransition,
  calculateOrder,
  createOrderInputSchema,
  OrderValidationError,
  statusUpdateSchema,
} from "@/lib/validation/orders";
import type { VerifiedUser } from "@/types/auth";
import type { CreateOrderInput, Order, OrderStatus, OrderStatusHistoryEntry, StatusUpdate, CustomerOrder } from "@/types/orders";

export class OrderNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Pedido no encontrado");
    this.name = "OrderNotFoundError";
  }
}

export type OrderCreationOptions = { idempotencyKey?: string };

function stableOrderId(uid: string, idempotencyKey: string): string {
  return createHash("sha256").update(`${uid}:${idempotencyKey}`).digest("hex").slice(0, 32);
}

function orderFingerprint(input: CreateOrderInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function ordersCollection() {
  return getAdminDb().collection("pedidos");
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"].includes(value);
}

function toOrder(id: string, data: Record<string, unknown>): Order {
  if (!isOrderStatus(data.status)) throw new OrderValidationError("El estado del pedido no es valido");
  const status = data.status;
  const statusHistory = Array.isArray(data.statusHistory)
    ? data.statusHistory.flatMap((entry): OrderStatusHistoryEntry[] => {
      if (!entry || typeof entry !== "object") return [];
      const event = entry as Record<string, unknown>;
      if (!isOrderStatus(event.status) || typeof event.at !== "string") return [];
      return [{
        status: event.status,
        at: event.at,
        ...(typeof event.actorUid === "string" ? { actorUid: event.actorUid } : {}),
        ...(typeof event.reason === "string" ? { reason: event.reason } : {}),
      }];
    })
    : undefined;

  return {
    id,
    clienteUid: String(data.clienteUid ?? ""),
    customerName: String(data.customerName ?? ""),
    phone: String(data.phone ?? ""),
    address: String(data.address ?? ""),
    notes: typeof data.notes === "string" ? data.notes : undefined,
    serviceType: typeof data.serviceType === "string" && ["delivery", "mesa", "pickup"].includes(data.serviceType) ? (data.serviceType as Order["serviceType"]) : undefined,
    tableNumber: typeof data.tableNumber === "string" ? data.tableNumber : undefined,
    items: Array.isArray(data.items) ? data.items as Order["items"] : [],
    subtotal: typeof data.subtotal === "number" ? data.subtotal : Number(data.total ?? 0),
    total: typeof data.total === "number" ? data.total : 0,
    status,
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? data.createdAt ?? ""),
    audit: (data.audit ?? {}) as Order["audit"],
    ...(statusHistory?.length ? { statusHistory } : {}),
    promotionCode: typeof data.promotionCode === "string" ? data.promotionCode : undefined,
  };
}

function requireOrderPermission(user: VerifiedUser, permission: "pedidos.read" | "pedidos.update"): void {
  if (!hasPermission(user.profile, permission)) {
    throw new AuthorizationError(403, "No tienes permiso para acceder a los pedidos");
  }
}

export async function createOrder(user: VerifiedUser, input: CreateOrderInput, options: OrderCreationOptions = {}): Promise<Order> {
  const validated = createOrderInputSchema.parse(input);
  const idempotencyKey = options.idempotencyKey?.trim();
  if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
    throw new OrderValidationError("La clave de idempotencia no es válida");
  }
  const products = await Promise.all(validated.items.map((item) => getProductById(item.productId)));
  const availableProducts = products.filter((product): product is NonNullable<typeof product> => product !== null);
  const calculated = calculateOrder(validated, availableProducts);
  let promotionCode: string | undefined;
  let promotionId: string | undefined;
  if (validated.promotionCode) {
    const promotion = await getPromotionByCode(validated.promotionCode);
    if (!promotion) throw new OrderValidationError("La promoción no es válida");
    const promotionResult = calculatePromotion({ promotion, subtotal: calculated.subtotal, now: new Date().toISOString(), items: calculated.items.map((item) => ({ productId: item.productId, category: availableProducts.find((product) => product.id === item.productId)?.category ?? "", subtotal: item.subtotal })) });
    if (!promotionResult.applied) throw new OrderValidationError(`La promoción no es válida: ${promotionResult.reason}`);
    calculated.total = promotionResult.total;
    promotionCode = promotion.code;
    promotionId = promotion.id;
  }
  const now = new Date().toISOString();
  const data = {
    clienteUid: user.uid,
    customerName: validated.customerName,
    phone: validated.phone,
    address: validated.address,
    ...(validated.notes ? { notes: validated.notes } : {}),
    ...(validated.serviceType ? { serviceType: validated.serviceType } : {}),
    ...(validated.tableNumber ? { tableNumber: validated.tableNumber } : {}),
    items: calculated.items,
    subtotal: calculated.subtotal,
    total: calculated.total,
    status: "pendiente" as const,
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: "pendiente" as const, actorUid: user.uid, at: now }],
    audit: { createdByUid: user.uid, createdAt: now },
    ...(promotionCode ? { promotionCode } : {}),
    ...(idempotencyKey ? { idempotencyKey, requestFingerprint: orderFingerprint(validated) } : {}),
  };
  const db = getAdminDb();
  const reference = idempotencyKey
    ? db.collection("pedidos").doc(stableOrderId(user.uid, idempotencyKey))
    : db.collection("pedidos").doc();
  const notificationReference = db.collection("notificaciones").doc();
  const productReferences = new Map(
    [...new Set(validated.items.map((item) => item.productId))].map((productId) => [productId, db.collection("productos").doc(productId)]),
  );
  let orderData = data;
  await db.runTransaction(async (transaction) => {
    const existingOrder = await transaction.get(reference);
    if (existingOrder.exists) {
      const existingData = (existingOrder.data() ?? {}) as Record<string, unknown>;
      if (idempotencyKey && existingData.requestFingerprint && existingData.requestFingerprint !== orderFingerprint(validated)) {
        throw new OrderValidationError("La clave de idempotencia ya fue usada con otros datos");
      }
      orderData = existingData as typeof data;
      return;
    }

    const productSnapshots = await Promise.all([...productReferences.entries()].map(async ([productId, productReference]) => ({
      productId,
      snapshot: await transaction.get(productReference),
    })));
    const transactionProducts = productSnapshots.map(({ productId, snapshot }) => snapshot.exists
      ? productFromData(productId, (snapshot.data() ?? {}) as Record<string, unknown>)
      : null).filter((product): product is NonNullable<typeof product> => product !== null);
    const transactionCalculated = calculateOrder(validated, transactionProducts);
    let transactionTotal = transactionCalculated.total;
    if (promotionId) {
      const promotionReference = db.collection("promociones").doc(promotionId);
      const promotionSnapshot = await transaction.get(promotionReference);
      if (!promotionSnapshot.exists) throw new OrderValidationError("La promoción ya no está disponible");
      const currentPromotion = toPromotion(promotionId, promotionSnapshot.data() as Record<string, unknown>);
      if (currentPromotion.code !== validated.promotionCode?.toUpperCase()) throw new OrderValidationError("La promoción ya no está disponible");
      const promotionItems = transactionCalculated.items.map((item) => ({ productId: item.productId, category: transactionProducts.find((product) => product.id === item.productId)?.category ?? "", subtotal: item.subtotal }));
      const currentResult = calculatePromotion({ promotion: currentPromotion, subtotal: transactionCalculated.subtotal, now: new Date().toISOString(), items: promotionItems });
      if (!currentResult.applied) throw new OrderValidationError(`La promoción ya no es válida: ${currentResult.reason}`);
      transactionTotal = currentResult.total;
      transaction.update(promotionReference, { usageCount: currentPromotion.usageCount + 1, updatedAt: new Date().toISOString() });
    }

    const transactionNow = new Date().toISOString();
    orderData = {
      ...data,
      items: transactionCalculated.items,
      subtotal: transactionCalculated.subtotal,
      total: transactionTotal,
      createdAt: transactionNow,
      updatedAt: transactionNow,
      statusHistory: [{ status: "pendiente" as const, actorUid: user.uid, at: transactionNow }],
      audit: { createdByUid: user.uid, createdAt: transactionNow },
    };
    for (const [productId, productReference] of productReferences) {
      const product = transactionProducts.find((candidate) => candidate.id === productId);
      if (!product) throw new OrderValidationError("Producto no encontrado");
      const quantity = validated.items.filter((item) => item.productId === productId).reduce((sum, item) => sum + item.quantity, 0);
      const resultingStock = product.stock - quantity;
      const movementReference = db.collection("inventario_movimientos").doc();
      transaction.update(productReference, { stock: resultingStock, available: resultingStock > 0, updatedAt: transactionNow });
      transaction.create(movementReference, { productId, type: "salida", quantity, reason: `Pedido ${reference.id}`, actorUid: user.uid, orderId: reference.id, previousStock: product.stock, resultingStock, createdAt: transactionNow });
      writeAuditInTransaction(transaction, { actorUid: user.uid, action: "create", module: "inventario", entityId: productId, changes: { type: "salida", quantity, reason: `Pedido ${reference.id}`, previousStock: product.stock, resultingStock } });
    }
    transaction.create(reference, orderData);
    transaction.create(notificationReference, { audience: "admin", title: "Nuevo pedido", message: `Se recibió el pedido #${reference.id.slice(0, 8)}.`, orderId: reference.id, read: false, createdAt: transactionNow });
    writeAuditInTransaction(transaction, { actorUid: user.uid, action: "create", module: "pedidos", entityId: reference.id, changes: { total: orderData.total, itemCount: orderData.items.length, ...(orderData.promotionCode ? { promotionCode: orderData.promotionCode } : {}) } });
  });

  return { id: reference.id, ...orderData } as Order;
}

export async function listOrders(user: VerifiedUser): Promise<Order[]> {
  requireOrderPermission(user, "pedidos.read");
  const snapshot = await ordersCollection().orderBy("createdAt", "desc").limit(50).get();
  return snapshot.docs.map((document) => toOrder(document.id, (document.data() ?? {}) as Record<string, unknown>));
}

export async function listOwnOrders(user: VerifiedUser): Promise<CustomerOrder[]> {
  const snapshot = await ordersCollection()
    .where("clienteUid", "==", user.uid)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return snapshot.docs.map((document) => toCustomerOrder(toOrder(document.id, (document.data() ?? {}) as Record<string, unknown>)));
}

export async function getCustomerOrder(user: VerifiedUser, id: string): Promise<CustomerOrder> {
  if (!id.trim()) throw new OrderNotFoundError();
  const snapshot = await ordersCollection().doc(id).get();
  if (!snapshot.exists) throw new OrderNotFoundError();
  const order = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
  assertOrderOwnership(user, order.clienteUid);
  return toCustomerOrder(order);
}

export async function getAdminOrder(user: VerifiedUser, id: string): Promise<Order> {
  requireOrderPermission(user, "pedidos.read");
  if (!id.trim()) throw new OrderNotFoundError();
  const snapshot = await ordersCollection().doc(id).get();
  if (!snapshot.exists) throw new OrderNotFoundError();
  return toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
}

export async function updateOrderStatus(user: VerifiedUser, id: string, input: StatusUpdate): Promise<Order> {
  requireOrderPermission(user, "pedidos.update");
  const validated = statusUpdateSchema.parse(input);
  const db = getAdminDb();
  const reference = db.collection("pedidos").doc(id);
  const notification = db.collection("notificaciones").doc();
  let updated: Order | undefined;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new OrderNotFoundError();
    const current = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
    assertValidTransition(current.status, validated.status);
    const now = new Date().toISOString();
    const statusEvent = { status: validated.status, actorUid: user.uid, at: now, ...(validated.reason ? { reason: validated.reason } : {}) };
    const statusHistory: OrderStatusHistoryEntry[] = [...(current.statusHistory ?? []), statusEvent];
    const update = {
      status: validated.status,
      updatedAt: now,
      statusHistory,
      audit: { ...current.audit, updatedByUid: user.uid, updatedAt: now },
    };
    transaction.update(reference, update);
    transaction.create(notification, {
      uid: current.clienteUid,
      orderId: id,
      audience: "customer",
      title: "Actualización de pedido",
      message: `Tu pedido ahora está ${validated.status.replace("_", " ")}.`,
      status: validated.status,
      createdAt: now,
      read: false,
    });
    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "update",
      module: "pedidos",
      entityId: id,
      changes: {
        status: validated.status,
        ...(validated.reason ? { reason: validated.reason } : {}),
      },
    });
    updated = { ...current, ...update, status: validated.status, updatedAt: now, audit: update.audit };
  });

  if (!updated) throw new Error("No fue posible actualizar el pedido");
  return updated;
}
