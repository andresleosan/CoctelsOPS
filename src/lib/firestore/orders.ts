import "server-only";

import { createHash } from "node:crypto";

import { hasPermission, isGlobalAdmin, requireNegocioAccess } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { getProductById, productFromData } from "@/lib/firestore/products";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import { getStoreConfiguration } from "@/lib/firestore/configuration";
import { getNegocioById } from "@/lib/firestore/tenant";
import {
  calculateEarnedPoints,
  calculateLoyaltyRedemption,
  getUserLoyaltySummary,
} from "@/lib/firestore/loyalty";
import { calculatePromotion, getPromotionByCode, toPromotion } from "@/lib/firestore/promotions";
import { prepareOrderSupplyDepletion } from "@/lib/firestore/recipes";
import { toCustomerOrder } from "@/lib/orders/customer-order";
import {
  calculateDeliveryQuote,
  findDeliveryZone,
  isDeliveryOrder,
  resolveDeliveryZones,
} from "@/lib/orders/delivery-zones";
import {
  getEffectivePaymentVerificationStatus,
  isDigitalTransferMethod,
} from "@/lib/orders/payment-verification";
import { validateOrderSchedule } from "@/lib/orders/store-schedule";
import {
  assertOrderOwnership,
  assertValidTransition,
  assignOrderDriverSchema,
  calculateOrder,
  createOrderInputSchema,
  OrderValidationError,
  statusUpdateSchema,
  orderRatingSchema,
  verifyOrderPaymentSchema,
} from "@/lib/validation/orders";
import type { VerifiedUser } from "@/types/auth";
import type { DeliveryZoneConfig, StoreConfiguration } from "@/types/operations";
import type { OrderEscandalloSummary } from "@/types/recipes";
import { DEFAULT_TENANT_ID } from "@/types/tenant";
import {
  ORDER_FULFILLMENT_MODES,
  PAYMENT_GATEWAY_PROVIDERS,
  PAYMENT_GATEWAY_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
  POS_DIGITAL_CHANNELS,
  POS_PAYMENT_METHODS,
  type AssignOrderDriverInput,
  type CreateOrderInput,
  type CustomerOrder,
  type Order,
  type OrderAssignedDriver,
  type OrderFulfillmentMode,
  type OrderPaymentBreakdown,
  type OrderPaymentGateway,
  type OrderPaymentProof,
  type OrderPaymentVerification,
  type OrderRating,
  type OrderRatingInput,
  type OrderStatus,
  type OrderStatusHistoryEntry,
  type PaymentGatewayProvider,
  type PaymentGatewayStatus,
  type PaymentProofContentType,
  type PaymentVerificationStatus,
  type PosDigitalChannel,
  type PosPaymentMethod,
  type StatusUpdate,
  type VerifyOrderPaymentInput,
} from "@/types/orders";

export class OrderNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Pedido no encontrado");
    this.name = "OrderNotFoundError";
  }
}

export type OrderCreationOptions = { idempotencyKey?: string; now?: Date };

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

function isPosPaymentMethod(value: unknown): value is PosPaymentMethod {
  return typeof value === "string" && (POS_PAYMENT_METHODS as readonly string[]).includes(value);
}

function isPosDigitalChannel(value: unknown): value is PosDigitalChannel {
  return typeof value === "string" && (POS_DIGITAL_CHANNELS as readonly string[]).includes(value);
}

function isPaymentVerificationStatus(value: unknown): value is PaymentVerificationStatus {
  return (
    typeof value === "string" &&
    (PAYMENT_VERIFICATION_STATUSES as readonly string[]).includes(value)
  );
}

function isPaymentGatewayProvider(value: unknown): value is PaymentGatewayProvider {
  return (
    typeof value === "string" &&
    (PAYMENT_GATEWAY_PROVIDERS as readonly string[]).includes(value)
  );
}

function isPaymentGatewayStatus(value: unknown): value is PaymentGatewayStatus {
  return (
    typeof value === "string" &&
    (PAYMENT_GATEWAY_STATUSES as readonly string[]).includes(value)
  );
}

export function parseOrderPaymentGateway(raw: unknown): OrderPaymentGateway | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  if (
    !isPaymentGatewayProvider(candidate.provider) ||
    !isPaymentGatewayStatus(candidate.status) ||
    typeof candidate.transactionId !== "string" ||
    !candidate.transactionId.trim()
  ) {
    return undefined;
  }
  const amountCop =
    typeof candidate.amountCop === "number" && Number.isFinite(candidate.amountCop)
      ? Math.max(0, Math.round(candidate.amountCop))
      : 0;
  const tipAmountCop =
    typeof candidate.tipAmountCop === "number" &&
    Number.isFinite(candidate.tipAmountCop) &&
    candidate.tipAmountCop >= 0
      ? Math.round(candidate.tipAmountCop)
      : undefined;

  return {
    provider: candidate.provider,
    transactionId: candidate.transactionId.trim(),
    eventId: typeof candidate.eventId === "string" ? candidate.eventId : candidate.transactionId.trim(),
    status: candidate.status,
    amountCop,
    currency: typeof candidate.currency === "string" && candidate.currency.trim() ? candidate.currency.trim() : "COP",
    ...(isPosDigitalChannel(candidate.channel) ? { channel: candidate.channel } : {}),
    ...(tipAmountCop !== undefined ? { tipAmountCop } : {}),
    confirmedAt: typeof candidate.confirmedAt === "string" ? candidate.confirmedAt : "",
    ...(typeof candidate.rawStatus === "string" && candidate.rawStatus.trim()
      ? { rawStatus: candidate.rawStatus.trim() }
      : {}),
  };
}

function isProofContentType(value: unknown): value is PaymentProofContentType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function parsePaymentProof(raw: unknown): OrderPaymentProof | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.url !== "string" || !candidate.url.trim()) return undefined;
  return {
    url: candidate.url,
    key: typeof candidate.key === "string" ? candidate.key : "",
    contentType: isProofContentType(candidate.contentType) ? candidate.contentType : "image/jpeg",
    uploadedAt: typeof candidate.uploadedAt === "string" ? candidate.uploadedAt : "",
    uploadedByUid: typeof candidate.uploadedByUid === "string" ? candidate.uploadedByUid : "",
    ...(isPosDigitalChannel(candidate.channel) ? { channel: candidate.channel } : {}),
    ...(typeof candidate.reference === "string" && candidate.reference.trim()
      ? { reference: candidate.reference.trim() }
      : {}),
  };
}

function parsePaymentVerification(raw: unknown): OrderPaymentVerification | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  if (!isPaymentVerificationStatus(candidate.status)) return undefined;
  return {
    status: candidate.status,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
    ...(typeof candidate.updatedByUid === "string" && candidate.updatedByUid
      ? { updatedByUid: candidate.updatedByUid }
      : {}),
    ...(typeof candidate.updatedByName === "string" && candidate.updatedByName
      ? { updatedByName: candidate.updatedByName }
      : {}),
    ...(typeof candidate.reason === "string" && candidate.reason.trim()
      ? { reason: candidate.reason.trim() }
      : {}),
  };
}

function parsePaymentBreakdown(raw: unknown): OrderPaymentBreakdown | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  const cashAmount = typeof candidate.cashAmount === "number" && Number.isFinite(candidate.cashAmount) ? Math.max(0, Math.round(candidate.cashAmount)) : 0;
  const cashReceived = typeof candidate.cashReceived === "number" && Number.isFinite(candidate.cashReceived) ? Math.max(0, Math.round(candidate.cashReceived)) : 0;
  const changeAmount = typeof candidate.changeAmount === "number" && Number.isFinite(candidate.changeAmount) ? Math.max(0, Math.round(candidate.changeAmount)) : 0;
  const digitalAmount = typeof candidate.digitalAmount === "number" && Number.isFinite(candidate.digitalAmount) ? Math.max(0, Math.round(candidate.digitalAmount)) : 0;

  return {
    cashAmount,
    cashReceived,
    changeAmount,
    digitalAmount,
    ...(isPosDigitalChannel(candidate.digitalMethod) ? { digitalMethod: candidate.digitalMethod } : {}),
    ...(typeof candidate.digitalReference === "string" && candidate.digitalReference.trim()
      ? { digitalReference: candidate.digitalReference.trim() }
      : {}),
  };
}

function sanitizePaymentBreakdown(breakdown: OrderPaymentBreakdown): OrderPaymentBreakdown {
  const cashAmount = Math.max(0, Math.round(breakdown.cashAmount));
  const cashReceived = Math.max(0, Math.round(breakdown.cashReceived));
  const digitalAmount = Math.max(0, Math.round(breakdown.digitalAmount));
  const changeAmount = Math.max(0, cashReceived - cashAmount);
  const cleanReference = breakdown.digitalReference?.trim();

  return {
    cashAmount,
    cashReceived,
    changeAmount,
    digitalAmount,
    ...(breakdown.digitalMethod ? { digitalMethod: breakdown.digitalMethod } : {}),
    ...(cleanReference ? { digitalReference: cleanReference } : {}),
  };
}

function parseEscandalloSummary(raw: unknown): OrderEscandalloSummary | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.totalCostCop !== "number" ||
    typeof candidate.revenueCop !== "number" ||
    !Array.isArray(candidate.items)
  ) {
    return undefined;
  }
  return candidate as OrderEscandalloSummary;
}

function parseAssignedDriver(raw: unknown): OrderAssignedDriver | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return undefined;
  return {
    ...(typeof candidate.uid === "string" && candidate.uid.trim()
      ? { uid: candidate.uid.trim() }
      : {}),
    name: candidate.name.trim(),
    ...(typeof candidate.phone === "string" && candidate.phone.trim()
      ? { phone: candidate.phone.trim() }
      : {}),
    assignedAt: typeof candidate.assignedAt === "string" ? candidate.assignedAt : "",
    assignedByUid: typeof candidate.assignedByUid === "string" ? candidate.assignedByUid : "",
  };
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
    ...(typeof data.loyaltyRewardId === "string"
      ? { loyaltyRewardId: data.loyaltyRewardId as Order["loyaltyRewardId"] }
      : {}),
    ...(typeof data.loyaltyPointsEarned === "number"
      ? { loyaltyPointsEarned: data.loyaltyPointsEarned }
      : {}),
    ...(typeof data.loyaltyPointsRedeemed === "number"
      ? { loyaltyPointsRedeemed: data.loyaltyPointsRedeemed }
      : {}),
    ...(typeof data.loyaltyDiscount === "number"
      ? { loyaltyDiscount: data.loyaltyDiscount }
      : {}),
    ...(isPosPaymentMethod(data.paymentMethod)
      ? { paymentMethod: data.paymentMethod }
      : {}),
    ...(parsePaymentBreakdown(data.paymentBreakdown)
      ? { paymentBreakdown: parsePaymentBreakdown(data.paymentBreakdown) }
      : {}),
    ...(isPaymentVerificationStatus(data.paymentVerificationStatus)
      ? { paymentVerificationStatus: data.paymentVerificationStatus }
      : {}),
    ...(parsePaymentProof(data.paymentProof)
      ? { paymentProof: parsePaymentProof(data.paymentProof) }
      : {}),
    ...(parsePaymentVerification(data.paymentVerification)
      ? { paymentVerification: parsePaymentVerification(data.paymentVerification) }
      : {}),
    ...(parseOrderPaymentGateway(data.paymentGateway)
      ? { paymentGateway: parseOrderPaymentGateway(data.paymentGateway) }
      : {}),
    ...(typeof data.deliveryZoneId === "string" && data.deliveryZoneId.trim()
      ? { deliveryZoneId: data.deliveryZoneId.trim() }
      : {}),
    ...(typeof data.deliveryZoneName === "string" && data.deliveryZoneName.trim()
      ? { deliveryZoneName: data.deliveryZoneName.trim() }
      : {}),
    ...(typeof data.deliveryFee === "number" &&
    Number.isFinite(data.deliveryFee) &&
    data.deliveryFee >= 0
      ? { deliveryFee: Math.round(data.deliveryFee) }
      : {}),
    ...(typeof data.estimatedDeliveryMinutes === "number" &&
    Number.isFinite(data.estimatedDeliveryMinutes) &&
    data.estimatedDeliveryMinutes > 0
      ? { estimatedDeliveryMinutes: Math.round(data.estimatedDeliveryMinutes) }
      : {}),
    ...(typeof data.fulfillmentMode === "string" &&
    (ORDER_FULFILLMENT_MODES as readonly string[]).includes(data.fulfillmentMode)
      ? { fulfillmentMode: data.fulfillmentMode as OrderFulfillmentMode }
      : {}),
    ...(typeof data.scheduledFor === "string" && data.scheduledFor.trim()
      ? { scheduledFor: data.scheduledFor.trim() }
      : {}),
    ...(parseAssignedDriver(data.assignedDriver)
      ? { assignedDriver: parseAssignedDriver(data.assignedDriver) }
      : {}),
    ...(data.rating && typeof data.rating === "object" && typeof (data.rating as Record<string, unknown>).stars === "number"
      ? {
          rating: {
            stars: (data.rating as Record<string, unknown>).stars as number,
            tags: Array.isArray((data.rating as Record<string, unknown>).tags)
              ? ((data.rating as Record<string, unknown>).tags as unknown[]).filter((t): t is string => typeof t === "string")
              : [],
            comment: typeof (data.rating as Record<string, unknown>).comment === "string"
              ? ((data.rating as Record<string, unknown>).comment as string)
              : undefined,
            createdAt: String((data.rating as Record<string, unknown>).createdAt ?? ""),
          },
        }
      : {}),
    ...(typeof data.negocioId === "string" && data.negocioId.trim()
      ? { negocioId: data.negocioId.trim() }
      : {}),
    ...(typeof data.suppliesDepletedAt === "string" && data.suppliesDepletedAt.trim()
      ? { suppliesDepletedAt: data.suppliesDepletedAt }
      : {}),
    ...(data.suppliesDepletedOnStatus === "preparando" || data.suppliesDepletedOnStatus === "entregado"
      ? { suppliesDepletedOnStatus: data.suppliesDepletedOnStatus }
      : {}),
    ...(parseEscandalloSummary(data.escandallo)
      ? { escandallo: parseEscandalloSummary(data.escandallo) }
      : {}),
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
    const promotionResult = calculatePromotion({
      promotion,
      subtotal: calculated.subtotal,
      now: new Date().toISOString(),
      items: calculated.items.map((item) => ({
        productId: item.productId,
        category: availableProducts.find((product) => product.id === item.productId)?.category ?? "",
        subtotal: item.subtotal,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
    if (!promotionResult.applied) throw new OrderValidationError(`La promoción no es válida: ${promotionResult.reason}`);
    calculated.total = promotionResult.total;
    promotionCode = promotion.code;
    promotionId = promotion.id;
  }
  let loyaltyPointsRedeemed: number | undefined;
  let loyaltyDiscount: number | undefined;
  if (validated.loyaltyRewardId) {
    const loyaltySummary = await getUserLoyaltySummary(user.uid);
    const redemption = calculateLoyaltyRedemption({
      rewardId: validated.loyaltyRewardId,
      availablePoints: loyaltySummary.availablePoints,
      subtotalAfterPromo: calculated.total,
    });
    if (!redemption.applied) {
      throw new OrderValidationError(
        `No fue posible canjear la recompensa: ${redemption.reason ?? "condiciones no cumplidas"}`
      );
    }
    calculated.total = redemption.total;
    loyaltyPointsRedeemed = redemption.pointsCost;
    loyaltyDiscount = redemption.discount;
  }
  const derivedNegocioId = availableProducts
    .map((product) => (typeof product.negocioId === "string" ? product.negocioId.trim() : ""))
    .find(Boolean);

  let effectiveConfig: StoreConfiguration;
  if (derivedNegocioId && derivedNegocioId !== DEFAULT_TENANT_ID) {
    const negocio = await getNegocioById(derivedNegocioId);
    effectiveConfig = negocio?.configuracion
      ? { ...negocio.configuracion }
      : await getStoreConfiguration({ allowDefaults: true });
  } else {
    effectiveConfig = await getStoreConfiguration({ allowDefaults: true });
  }

  const isInternalBarStaff = Boolean(
    user.profile?.active &&
      (user.profile.accountType === "admin" || user.profile.accountType === "staff"),
  );
  const scheduleNow = options.now ?? new Date();
  const scheduleValidation = validateOrderSchedule({
    config: effectiveConfig,
    scheduledFor: validated.scheduledFor,
    serviceType: validated.serviceType ?? "delivery",
    now: scheduleNow,
  });

  if (!scheduleValidation.allowed && !(isInternalBarStaff && !validated.scheduledFor)) {
    throw new OrderValidationError(scheduleValidation.reason);
  }

  const resolvedFulfillmentMode: OrderFulfillmentMode = scheduleValidation.allowed
    ? scheduleValidation.fulfillmentMode
    : "now";
  const resolvedScheduledFor =
    scheduleValidation.allowed && scheduleValidation.fulfillmentMode === "scheduled"
      ? scheduleValidation.scheduledFor
      : undefined;

  const sanitizedPaymentBreakdown = validated.paymentBreakdown
    ? sanitizePaymentBreakdown(validated.paymentBreakdown)
    : undefined;
  const wantsDeliveryZone =
    validated.serviceType !== "mesa" &&
    validated.serviceType !== "pickup" &&
    Boolean(validated.deliveryZoneId?.trim() || validated.deliveryZoneName?.trim());
  let matchedDeliveryZone: DeliveryZoneConfig | null = null;
  const fallbackDeliveryMinutes = effectiveConfig.estimatedDeliveryMinutes ?? 45;
  if (wantsDeliveryZone) {
    matchedDeliveryZone = findDeliveryZone(resolveDeliveryZones(effectiveConfig), {
      id: validated.deliveryZoneId,
      name: validated.deliveryZoneName,
    });
    if (!matchedDeliveryZone) {
      throw new OrderValidationError("La zona de entrega seleccionada no está disponible");
    }
  }
  const initialDeliveryQuote = matchedDeliveryZone
    ? calculateDeliveryQuote({
        serviceType: validated.serviceType ?? "delivery",
        zone: matchedDeliveryZone,
        subtotalCop: calculated.subtotal,
        fallbackEstimatedMinutes: fallbackDeliveryMinutes,
      })
    : null;
  const now = new Date().toISOString();
  const data = {
    clienteUid: user.uid,
    customerName: validated.customerName,
    phone: validated.phone,
    address: validated.address,
    ...(derivedNegocioId ? { negocioId: derivedNegocioId } : {}),
    ...(validated.notes ? { notes: validated.notes } : {}),
    ...(validated.serviceType ? { serviceType: validated.serviceType } : {}),
    ...(validated.tableNumber ? { tableNumber: validated.tableNumber } : {}),
    fulfillmentMode: resolvedFulfillmentMode,
    ...(resolvedScheduledFor ? { scheduledFor: resolvedScheduledFor } : {}),
    ...(matchedDeliveryZone && initialDeliveryQuote
      ? {
          deliveryZoneId: matchedDeliveryZone.id,
          deliveryZoneName: matchedDeliveryZone.name,
          deliveryFee: initialDeliveryQuote.feeCop,
          estimatedDeliveryMinutes: initialDeliveryQuote.estimatedMinutes,
        }
      : {}),
    items: calculated.items,
    subtotal: calculated.subtotal,
    total: calculated.total + (initialDeliveryQuote?.feeCop ?? 0),
    status: "pendiente" as const,
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: "pendiente" as const, actorUid: user.uid, at: now }],
    audit: { createdByUid: user.uid, createdAt: now },
    ...(promotionCode ? { promotionCode } : {}),
    ...(validated.loyaltyRewardId
      ? {
          loyaltyRewardId: validated.loyaltyRewardId,
          loyaltyPointsRedeemed,
          loyaltyDiscount,
        }
      : {}),
    ...(validated.paymentMethod ? { paymentMethod: validated.paymentMethod } : {}),
    ...(sanitizedPaymentBreakdown ? { paymentBreakdown: sanitizedPaymentBreakdown } : {}),
    ...(isDigitalTransferMethod(validated.paymentMethod)
      ? { paymentVerificationStatus: "pendiente_verificacion" as const }
      : {}),
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
      const promotionItems = transactionCalculated.items.map((item) => ({
        productId: item.productId,
        category: transactionProducts.find((product) => product.id === item.productId)?.category ?? "",
        subtotal: item.subtotal,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
      const currentResult = calculatePromotion({ promotion: currentPromotion, subtotal: transactionCalculated.subtotal, now: new Date().toISOString(), items: promotionItems });
      if (!currentResult.applied) throw new OrderValidationError(`La promoción ya no es válida: ${currentResult.reason}`);
      transactionTotal = currentResult.total;
      transaction.update(promotionReference, { usageCount: currentPromotion.usageCount + 1, updatedAt: new Date().toISOString() });
    }
    if (validated.loyaltyRewardId && typeof loyaltyDiscount === "number") {
      transactionTotal = Math.max(0, transactionTotal - Math.min(loyaltyDiscount, transactionTotal));
    }
    const transactionDeliveryQuote = matchedDeliveryZone
      ? calculateDeliveryQuote({
          serviceType: validated.serviceType ?? "delivery",
          zone: matchedDeliveryZone,
          subtotalCop: transactionCalculated.subtotal,
          fallbackEstimatedMinutes: fallbackDeliveryMinutes,
        })
      : null;
    if (transactionDeliveryQuote) {
      transactionTotal += transactionDeliveryQuote.feeCop;
    }

    const transactionNow = new Date().toISOString();
    const transactionNegocioId = transactionProducts
      .map((product) => (typeof product.negocioId === "string" ? product.negocioId.trim() : ""))
      .find(Boolean);
    orderData = {
      ...data,
      items: transactionCalculated.items,
      subtotal: transactionCalculated.subtotal,
      total: transactionTotal,
      ...(matchedDeliveryZone && transactionDeliveryQuote
        ? {
            deliveryZoneId: matchedDeliveryZone.id,
            deliveryZoneName: matchedDeliveryZone.name,
            deliveryFee: transactionDeliveryQuote.feeCop,
            estimatedDeliveryMinutes: transactionDeliveryQuote.estimatedMinutes,
          }
        : {}),
      ...(transactionNegocioId ? { negocioId: transactionNegocioId } : {}),
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
    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "create",
      module: "pedidos",
      entityId: reference.id,
      changes: {
        total: orderData.total,
        itemCount: orderData.items.length,
        ...(orderData.promotionCode ? { promotionCode: orderData.promotionCode } : {}),
        ...(resolvedScheduledFor
          ? { fulfillmentMode: resolvedFulfillmentMode, scheduledFor: resolvedScheduledFor }
          : {}),
        ...(matchedDeliveryZone && transactionDeliveryQuote
          ? {
              deliveryZoneName: matchedDeliveryZone.name,
              deliveryFee: transactionDeliveryQuote.feeCop,
            }
          : {}),
      },
    });
  });

  return { id: reference.id, ...orderData } as Order;
}

export async function listOrders(user: VerifiedUser): Promise<Order[]> {
  requireOrderPermission(user, "pedidos.read");
  const staffNegocioId = !isGlobalAdmin(user) ? user.profile?.negocioId?.trim() : undefined;
  if (staffNegocioId && staffNegocioId !== DEFAULT_TENANT_ID) {
    const snapshot = await ordersCollection()
      .where("negocioId", "==", staffNegocioId)
      .get();
    return snapshot.docs
      .map((document) => toOrder(document.id, (document.data() ?? {}) as Record<string, unknown>))
      .filter((order) => (order.negocioId?.trim() || DEFAULT_TENANT_ID) === staffNegocioId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  }

  const snapshot = await ordersCollection().orderBy("createdAt", "desc").limit(50).get();
  const orders = snapshot.docs.map((document) =>
    toOrder(document.id, (document.data() ?? {}) as Record<string, unknown>),
  );
  if (staffNegocioId === DEFAULT_TENANT_ID) {
    return orders.filter(
      (order) => (order.negocioId?.trim() || DEFAULT_TENANT_ID) === DEFAULT_TENANT_ID,
    );
  }
  return orders;
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

function assertStaffOrderTenantAccess(
  user: VerifiedUser,
  order: Pick<Order, "negocioId">,
): void {
  if (isGlobalAdmin(user)) return;
  const orderNegocioId = order.negocioId?.trim() || DEFAULT_TENANT_ID;
  const staffNegocioId = user.profile?.negocioId?.trim();
  if (staffNegocioId || orderNegocioId !== DEFAULT_TENANT_ID) {
    requireNegocioAccess(user, orderNegocioId);
  }
}

export async function getAdminOrder(user: VerifiedUser, id: string): Promise<Order> {
  requireOrderPermission(user, "pedidos.read");
  if (!id.trim()) throw new OrderNotFoundError();
  const snapshot = await ordersCollection().doc(id).get();
  if (!snapshot.exists) throw new OrderNotFoundError();
  const order = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
  assertStaffOrderTenantAccess(user, order);
  return order;
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
    assertStaffOrderTenantAccess(user, current);
    assertValidTransition(current.status, validated.status);
    const now = new Date().toISOString();
    const statusEvent = { status: validated.status, actorUid: user.uid, at: now, ...(validated.reason ? { reason: validated.reason } : {}) };
    const statusHistory: OrderStatusHistoryEntry[] = [...(current.statusHistory ?? []), statusEvent];
    const loyaltyPointsEarned =
      validated.status === "entregado"
        ? calculateEarnedPoints(current.total)
        : current.loyaltyPointsEarned;
    const shouldDepleteSupplies =
      (validated.status === "preparando" || validated.status === "entregado") &&
      !current.suppliesDepletedAt;
    const targetNegocioId =
      current.negocioId?.trim() || user.profile.negocioId?.trim() || DEFAULT_TENANT_ID;
    const preparedDepletion = shouldDepleteSupplies
      ? await prepareOrderSupplyDepletion({
          db,
          transaction,
          order: current,
          actorUid: user.uid,
          targetStatus: validated.status as "preparando" | "entregado",
          negocioId: targetNegocioId,
          now,
        })
      : null;
    const update = {
      status: validated.status,
      updatedAt: now,
      statusHistory,
      audit: { ...current.audit, updatedByUid: user.uid, updatedAt: now },
      ...(typeof loyaltyPointsEarned === "number" ? { loyaltyPointsEarned } : {}),
      ...(preparedDepletion
        ? {
            suppliesDepletedAt: now,
            suppliesDepletedOnStatus: validated.status as "preparando" | "entregado",
            escandallo: preparedDepletion.escandallo,
          }
        : {}),
    };
    transaction.update(reference, update);
    if (preparedDepletion) {
      preparedDepletion.applyWrites(transaction);
    }
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

export async function rateCustomerOrder(
  user: VerifiedUser,
  id: string,
  input: OrderRatingInput
): Promise<OrderRating> {
  if (!id?.trim()) throw new OrderNotFoundError();
  const validated = orderRatingSchema.parse(input);
  const db = getAdminDb();
  const reference = db.collection("pedidos").doc(id.trim());
  let savedRating: OrderRating | undefined;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new OrderNotFoundError();
    const current = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);

    assertOrderOwnership(user, current.clienteUid);

    if (current.status !== "entregado") {
      throw new OrderValidationError("Solo los pedidos entregados pueden ser calificados");
    }

    const now = new Date().toISOString();
    const ratingRecord: OrderRating = {
      stars: validated.stars,
      tags: validated.tags ?? [],
      ...(validated.comment ? { comment: validated.comment } : {}),
      createdAt: now,
    };

    transaction.update(reference, {
      rating: ratingRecord,
      updatedAt: now,
    });

    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "rate",
      module: "pedidos",
      entityId: id.trim(),
      changes: {
        stars: validated.stars,
        tagsCount: validated.tags?.length ?? 0,
        hasComment: Boolean(validated.comment),
      },
    });

    savedRating = ratingRecord;
  });

  if (!savedRating) throw new Error("No fue posible guardar la calificación");
  return savedRating;
}

function actorDisplayName(user: VerifiedUser): string {
  return (
    user.profile?.displayName?.trim() ||
    user.token?.name?.trim() ||
    user.profile?.email?.trim() ||
    user.uid
  );
}

function assertPaymentProofUploadAllowed(user: VerifiedUser, order: Order): { isStaff: boolean } {
  const isOwner = user.uid === order.clienteUid;
  const isStaff = Boolean(user.profile && hasPermission(user.profile, "pedidos.update"));
  if (!isOwner && !isStaff) {
    throw new AuthorizationError(403, "No tienes permiso para adjuntar comprobante a este pedido");
  }
  if (isStaff && !isOwner) {
    assertStaffOrderTenantAccess(user, order);
  }
  if (order.status === "cancelado") {
    throw new OrderValidationError("No se puede adjuntar comprobante a un pedido cancelado");
  }
  const currentVerificationStatus = getEffectivePaymentVerificationStatus(order);
  if (!isStaff && currentVerificationStatus === "verificado") {
    throw new OrderValidationError("El pago de este pedido ya fue verificado");
  }
  return { isStaff };
}

export async function getOrderForPaymentProofUpload(
  user: VerifiedUser,
  id: string,
): Promise<Order> {
  const cleanId = id?.trim();
  if (!cleanId) throw new OrderNotFoundError();
  const snapshot = await ordersCollection().doc(cleanId).get();
  if (!snapshot.exists) throw new OrderNotFoundError();
  const order = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
  assertPaymentProofUploadAllowed(user, order);
  return order;
}

export async function getOrderForOnlinePayment(
  user: VerifiedUser,
  id: string,
): Promise<Order> {
  const cleanId = id?.trim();
  if (!cleanId) throw new OrderNotFoundError();
  const snapshot = await ordersCollection().doc(cleanId).get();
  if (!snapshot.exists) throw new OrderNotFoundError();
  const order = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);

  const isOwner = user.uid === order.clienteUid;
  const isStaff = Boolean(user.profile && hasPermission(user.profile, "pedidos.update"));
  if (!isOwner && !isStaff) {
    throw new AuthorizationError(403, "No tienes permiso para iniciar un pago para este pedido");
  }
  if (isStaff && !isOwner) {
    assertStaffOrderTenantAccess(user, order);
  }
  return order;
}

export async function attachOrderPaymentProof(
  user: VerifiedUser,
  id: string,
  input: {
    url: string;
    key: string;
    contentType: PaymentProofContentType;
    channel?: PosDigitalChannel;
    reference?: string;
  },
): Promise<{ order: Order; previousProofKey?: string }> {
  const cleanId = id?.trim();
  if (!cleanId) throw new OrderNotFoundError();
  const db = getAdminDb();
  const reference = db.collection("pedidos").doc(cleanId);
  const notificationReference = db.collection("notificaciones").doc();

  let updatedOrder: Order | undefined;
  let previousProofKey: string | undefined;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new OrderNotFoundError();
    const current = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
    assertPaymentProofUploadAllowed(user, current);

    previousProofKey = current.paymentProof?.key?.trim() || undefined;
    const now = new Date().toISOString();
    const cleanReference = input.reference?.trim() || undefined;
    const resolvedChannel =
      input.channel ??
      (isDigitalTransferMethod(current.paymentMethod)
        ? current.paymentMethod
        : current.paymentBreakdown?.digitalMethod);

    const paymentProof: OrderPaymentProof = {
      url: input.url,
      key: input.key,
      contentType: input.contentType,
      uploadedAt: now,
      uploadedByUid: user.uid,
      ...(resolvedChannel ? { channel: resolvedChannel } : {}),
      ...(cleanReference ? { reference: cleanReference } : {}),
    };

    const paymentVerification: OrderPaymentVerification = {
      status: "pendiente_verificacion",
      updatedAt: now,
      updatedByUid: user.uid,
    };

    const audit = { ...current.audit, updatedByUid: user.uid, updatedAt: now };

    let nextPaymentMethod = current.paymentMethod;
    let nextPaymentBreakdown = current.paymentBreakdown;

    if (!isDigitalTransferMethod(current.paymentMethod) && current.paymentMethod !== "mixto") {
      const targetChannel: PosDigitalChannel = resolvedChannel ?? "transferencia";
      nextPaymentMethod = targetChannel;
      const existingRef = cleanReference ?? current.paymentBreakdown?.digitalReference;
      nextPaymentBreakdown = {
        cashAmount: 0,
        cashReceived: 0,
        changeAmount: 0,
        digitalAmount: current.paymentBreakdown?.digitalAmount || current.total,
        digitalMethod: targetChannel,
        ...(existingRef ? { digitalReference: existingRef } : {}),
      };
    } else if (isDigitalTransferMethod(current.paymentMethod) && (input.channel || cleanReference)) {
      const targetChannel = input.channel ?? current.paymentMethod;
      nextPaymentMethod = targetChannel;
      const existingRef = cleanReference ?? current.paymentBreakdown?.digitalReference;
      nextPaymentBreakdown = {
        cashAmount: current.paymentBreakdown?.cashAmount ?? 0,
        cashReceived: current.paymentBreakdown?.cashReceived ?? 0,
        changeAmount: current.paymentBreakdown?.changeAmount ?? 0,
        digitalAmount: current.paymentBreakdown?.digitalAmount ?? current.total,
        digitalMethod: targetChannel,
        ...(existingRef ? { digitalReference: existingRef } : {}),
      };
    } else if (current.paymentMethod === "mixto" && current.paymentBreakdown && cleanReference) {
      nextPaymentBreakdown = {
        ...current.paymentBreakdown,
        digitalReference: cleanReference,
      };
    }

    const update = {
      paymentProof,
      paymentVerificationStatus: "pendiente_verificacion" as const,
      paymentVerification,
      updatedAt: now,
      audit,
      ...(nextPaymentMethod ? { paymentMethod: nextPaymentMethod } : {}),
      ...(nextPaymentBreakdown ? { paymentBreakdown: nextPaymentBreakdown } : {}),
    };

    transaction.update(reference, update);
    transaction.create(notificationReference, {
      audience: "admin",
      title: "Comprobante recibido",
      message: `Se adjuntó comprobante de pago para el pedido #${cleanId.slice(0, 8)}.`,
      orderId: cleanId,
      read: false,
      createdAt: now,
    });
    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "upload_payment_proof",
      module: "pedidos",
      entityId: cleanId,
      changes: {
        paymentVerificationStatus: "pendiente_verificacion",
        ...(resolvedChannel ? { channel: resolvedChannel } : {}),
        ...(cleanReference ? { reference: cleanReference } : {}),
      },
    });

    updatedOrder = {
      ...current,
      ...update,
    };
  });

  if (!updatedOrder) throw new Error("No fue posible registrar el comprobante");
  return { order: updatedOrder, previousProofKey };
}

export async function updateOrderPaymentVerification(
  user: VerifiedUser,
  id: string,
  input: VerifyOrderPaymentInput,
): Promise<Order> {
  requireOrderPermission(user, "pedidos.update");
  const cleanId = id?.trim();
  if (!cleanId) throw new OrderNotFoundError();
  const validated = verifyOrderPaymentSchema.parse(input);
  const db = getAdminDb();
  const reference = db.collection("pedidos").doc(cleanId);
  const notificationReference = db.collection("notificaciones").doc();
  let updated: Order | undefined;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new OrderNotFoundError();
    const current = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
    assertStaffOrderTenantAccess(user, current);
    if (current.status === "cancelado" && validated.status === "verificado") {
      throw new OrderValidationError("No se puede aprobar el pago de un pedido cancelado");
    }

    const now = new Date().toISOString();
    const actorName = actorDisplayName(user);
    const paymentVerification: OrderPaymentVerification = {
      status: validated.status,
      updatedAt: now,
      updatedByUid: user.uid,
      updatedByName: actorName,
      ...(validated.reason ? { reason: validated.reason } : {}),
    };
    const audit = { ...current.audit, updatedByUid: user.uid, updatedAt: now };

    const update = {
      paymentVerificationStatus: validated.status,
      paymentVerification,
      updatedAt: now,
      audit,
    };

    transaction.update(reference, update);
    const notificationMessage =
      validated.status === "verificado"
        ? `Tu pago del pedido #${cleanId.slice(0, 8)} fue verificado.`
        : validated.status === "rechazado"
          ? `Tu comprobante del pedido #${cleanId.slice(0, 8)} fue rechazado${validated.reason ? `: ${validated.reason}` : "."}`
          : `El pago de tu pedido #${cleanId.slice(0, 8)} quedó pendiente de verificación.`;

    transaction.create(notificationReference, {
      uid: current.clienteUid,
      orderId: cleanId,
      audience: "customer",
      title: "Estado de pago actualizado",
      message: notificationMessage,
      read: false,
      createdAt: now,
    });
    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "verify_payment",
      module: "pedidos",
      entityId: cleanId,
      changes: {
        paymentVerificationStatus: validated.status,
        ...(validated.reason ? { reason: validated.reason } : {}),
      },
    });

    updated = {
      ...current,
      ...update,
    };
  });

  if (!updated) throw new Error("No fue posible actualizar la verificación del pago");
  return updated;
}

export async function assignOrderDriver(
  user: VerifiedUser,
  id: string,
  driverInput: AssignOrderDriverInput,
): Promise<Order> {
  requireOrderPermission(user, "pedidos.update");
  const cleanId = id?.trim();
  if (!cleanId) throw new OrderNotFoundError();
  const { driver } = assignOrderDriverSchema.parse({ driver: driverInput });
  const db = getAdminDb();
  const reference = db.collection("pedidos").doc(cleanId);
  let updated: Order | undefined;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new OrderNotFoundError();
    const current = toOrder(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
    assertStaffOrderTenantAccess(user, current);
    if (current.status === "cancelado" || current.status === "entregado") {
      throw new OrderValidationError(
        "No se puede asignar domiciliario a un pedido entregado o cancelado",
      );
    }
    if (!isDeliveryOrder(current)) {
      throw new OrderValidationError(
        "Solo los pedidos a domicilio pueden asignarse a un domiciliario",
      );
    }

    const now = new Date().toISOString();
    const audit = { ...current.audit, updatedByUid: user.uid, updatedAt: now };

    if (!driver) {
      transaction.update(reference, {
        assignedDriver: null,
        updatedAt: now,
        audit,
      });
      writeAuditInTransaction(transaction, {
        actorUid: user.uid,
        action: "unassign_driver",
        module: "pedidos",
        entityId: cleanId,
      });
      const { assignedDriver: _removed, ...restCurrent } = current;
      void _removed;
      updated = {
        ...restCurrent,
        updatedAt: now,
        audit,
      };
      return;
    }

    const assignedDriver: OrderAssignedDriver = {
      ...(driver.uid ? { uid: driver.uid } : {}),
      name: driver.name.trim(),
      ...(driver.phone ? { phone: driver.phone.trim() } : {}),
      assignedAt: now,
      assignedByUid: user.uid,
    };

    transaction.update(reference, {
      assignedDriver,
      updatedAt: now,
      audit,
    });
    writeAuditInTransaction(transaction, {
      actorUid: user.uid,
      action: "assign_driver",
      module: "pedidos",
      entityId: cleanId,
      changes: {
        driverName: assignedDriver.name,
        ...(assignedDriver.uid ? { driverUid: assignedDriver.uid } : {}),
      },
    });
    updated = {
      ...current,
      assignedDriver,
      updatedAt: now,
      audit,
    };
  });

  if (!updated) throw new Error("No fue posible asignar el domiciliario");
  return updated;
}
