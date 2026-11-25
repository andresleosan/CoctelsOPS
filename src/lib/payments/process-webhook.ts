import "server-only";

import { createHash } from "node:crypto";

import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import type { NormalizedPaymentWebhookEvent } from "@/lib/payments/webhook-signature";
import type {
  OrderPaymentBreakdown,
  OrderPaymentGateway,
  OrderPaymentVerification,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentGatewayStatus,
  PaymentVerificationStatus,
} from "@/types/orders";

export type WebhookProcessOutcome =
  | {
      outcome: "processed";
      orderId: string;
      transactionId: string;
      status: PaymentGatewayStatus;
      paymentVerificationStatus: PaymentVerificationStatus;
      orderStatus: OrderStatus;
    }
  | {
      outcome: "duplicate";
      orderId: string;
      transactionId: string;
      status: PaymentGatewayStatus;
    }
  | {
      outcome: "order_not_found";
      orderId: string;
      transactionId: string;
      status: PaymentGatewayStatus;
    }
  | {
      outcome: "amount_mismatch";
      orderId: string;
      transactionId: string;
      status: PaymentGatewayStatus;
    }
  | {
      outcome: "ignored";
      reason: "order_cancelled" | "already_verified";
      orderId: string;
      transactionId: string;
      status: PaymentGatewayStatus;
    };

function buildDedupeDocId(event: NormalizedPaymentWebhookEvent): string {
  const raw = `${event.provider}_${event.eventId}_${event.status}`;
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (safe.length <= 140) return safe;
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 24);
  return `${safe.slice(0, 100)}_${hash}`;
}

function providerLabel(provider: NormalizedPaymentWebhookEvent["provider"]): string {
  return provider === "wompi" ? "Pasarela Wompi" : "Pasarela Bold";
}

function formatCopSimple(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-CO")}`;
}

export async function processPaymentWebhookEvent(
  event: NormalizedPaymentWebhookEvent,
): Promise<WebhookProcessOutcome> {
  const db = getAdminDb();
  const dedupeId = buildDedupeDocId(event);
  const dedupeRef = db.collection("payment_webhook_events").doc(dedupeId);
  const orderRef = db.collection("pedidos").doc(event.orderId);
  const customerNotificationRef = db.collection("notificaciones").doc();
  const adminNotificationRef = db.collection("notificaciones").doc();

  let result: WebhookProcessOutcome | null = null;

  await db.runTransaction(async (transaction) => {
    // Firestore invariant: all reads before any write
    const [dedupeSnap, orderSnap] = await Promise.all([
      transaction.get(dedupeRef),
      transaction.get(orderRef),
    ]);

    if (dedupeSnap.exists) {
      result = {
        outcome: "duplicate",
        orderId: event.orderId,
        transactionId: event.transactionId,
        status: event.status,
      };
      return;
    }

    if (!orderSnap.exists) {
      result = {
        outcome: "order_not_found",
        orderId: event.orderId,
        transactionId: event.transactionId,
        status: event.status,
      };
      return;
    }

    const orderData = (orderSnap.data() ?? {}) as Record<string, unknown>;
    const orderStatus = (typeof orderData.status === "string"
      ? orderData.status
      : "pendiente") as OrderStatus;
    const orderTotal =
      typeof orderData.total === "number" && Number.isFinite(orderData.total)
        ? Math.max(0, Math.round(orderData.total))
        : 0;
    const clienteUid =
      typeof orderData.clienteUid === "string" ? orderData.clienteUid.trim() : "";
    const negocioId =
      typeof orderData.negocioId === "string" && orderData.negocioId.trim()
        ? orderData.negocioId.trim()
        : undefined;
    const currentPaymentMethod =
      typeof orderData.paymentMethod === "string" ? orderData.paymentMethod : undefined;
    const currentVerificationStatus =
      typeof orderData.paymentVerificationStatus === "string"
        ? (orderData.paymentVerificationStatus as PaymentVerificationStatus)
        : undefined;
    const existingGateway =
      orderData.paymentGateway && typeof orderData.paymentGateway === "object"
        ? (orderData.paymentGateway as Record<string, unknown>)
        : undefined;
    const currentGatewayTxId =
      existingGateway && typeof existingGateway.transactionId === "string"
        ? existingGateway.transactionId
        : undefined;

    const now = new Date().toISOString();
    const label = providerLabel(event.provider);
    const actorUid = `webhook:${event.provider}`;

    const paymentGateway: OrderPaymentGateway = {
      provider: event.provider,
      transactionId: event.transactionId,
      eventId: event.eventId,
      status: event.status,
      amountCop: event.amountCop,
      currency: event.currency,
      channel: event.digitalChannel,
      ...(event.tipAmountCop !== undefined ? { tipAmountCop: event.tipAmountCop } : {}),
      confirmedAt: event.confirmedAt,
      rawStatus: event.rawStatus,
    };

    if (orderStatus === "cancelado" && event.status === "approved") {
      transaction.create(dedupeRef, {
        provider: event.provider,
        eventId: event.eventId,
        transactionId: event.transactionId,
        orderId: event.orderId,
        status: event.status,
        outcome: "ignored_cancelled",
        processedAt: now,
      });
      writeAuditInTransaction(transaction, {
        actorUid,
        action: "webhook_ignored_cancelled",
        module: "pedidos",
        entityId: event.orderId,
        changes: {
          provider: event.provider,
          transactionId: event.transactionId,
          amountCop: event.amountCop,
        },
      });
      result = {
        outcome: "ignored",
        reason: "order_cancelled",
        orderId: event.orderId,
        transactionId: event.transactionId,
        status: event.status,
      };
      return;
    }

    if (event.status === "approved") {
      if (event.amountCop < orderTotal) {
        const mismatchReason = `Monto recibido por ${label} (${formatCopSimple(event.amountCop)}) es menor al total del pedido (${formatCopSimple(orderTotal)}).`;
        const paymentVerification: OrderPaymentVerification = {
          status: "rechazado",
          updatedAt: now,
          updatedByUid: actorUid,
          updatedByName: label,
          reason: mismatchReason,
        };

        transaction.update(orderRef, {
          paymentVerificationStatus: "rechazado",
          paymentVerification,
          paymentGateway,
          updatedAt: now,
        });

        transaction.create(adminNotificationRef, {
          audience: "admin",
          ...(negocioId ? { negocioId } : {}),
          orderId: event.orderId,
          title: "Pago online con monto insuficiente",
          message: `Pedido #${event.orderId.slice(0, 8)}: ${mismatchReason}`,
          read: false,
          createdAt: now,
        });

        transaction.create(dedupeRef, {
          provider: event.provider,
          eventId: event.eventId,
          transactionId: event.transactionId,
          orderId: event.orderId,
          status: event.status,
          outcome: "amount_mismatch",
          processedAt: now,
        });

        writeAuditInTransaction(transaction, {
          actorUid,
          action: "webhook_amount_mismatch",
          module: "pedidos",
          entityId: event.orderId,
          changes: {
            provider: event.provider,
            transactionId: event.transactionId,
            receivedCop: event.amountCop,
            expectedCop: orderTotal,
          },
        });

        result = {
          outcome: "amount_mismatch",
          orderId: event.orderId,
          transactionId: event.transactionId,
          status: event.status,
        };
        return;
      }

      const paymentVerification: OrderPaymentVerification = {
        status: "verificado",
        updatedAt: now,
        updatedByUid: actorUid,
        updatedByName: label,
      };

      const rawHistory = Array.isArray(orderData.statusHistory)
        ? (orderData.statusHistory as OrderStatusHistoryEntry[])
        : [];
      const shouldPromoteOrder = orderStatus === "pendiente";
      const nextOrderStatus: OrderStatus = shouldPromoteOrder ? "confirmado" : orderStatus;
      const nextHistory: OrderStatusHistoryEntry[] | undefined = shouldPromoteOrder
        ? [
            ...rawHistory,
            {
              status: "confirmado",
              actorUid,
              at: now,
              reason: `Pago confirmado automáticamente vía ${label} (${event.transactionId})`,
            },
          ]
        : undefined;

      const nextBreakdown: OrderPaymentBreakdown | undefined =
        currentPaymentMethod !== "mixto"
          ? {
              cashAmount: 0,
              cashReceived: 0,
              changeAmount: 0,
              digitalAmount: orderTotal,
              digitalMethod: event.digitalChannel,
              digitalReference: event.transactionId,
            }
          : undefined;

      const existingAudit =
        orderData.audit && typeof orderData.audit === "object"
          ? (orderData.audit as Record<string, unknown>)
          : {};

      transaction.update(orderRef, {
        paymentVerificationStatus: "verificado",
        paymentVerification,
        paymentGateway,
        ...(currentPaymentMethod !== "mixto" ? { paymentMethod: event.digitalChannel } : {}),
        ...(nextBreakdown ? { paymentBreakdown: nextBreakdown } : {}),
        ...(shouldPromoteOrder ? { status: "confirmado", statusHistory: nextHistory } : {}),
        audit: {
          ...existingAudit,
          updatedByUid: actorUid,
          updatedAt: now,
        },
        updatedAt: now,
      });

      if (clienteUid) {
        transaction.create(customerNotificationRef, {
          uid: clienteUid,
          ...(negocioId ? { negocioId } : {}),
          orderId: event.orderId,
          audience: "customer",
          title: "Pago online confirmado",
          message: `Tu pago vía ${label} del pedido #${event.orderId.slice(0, 8)} fue verificado.`,
          read: false,
          createdAt: now,
        });
      }

      transaction.create(adminNotificationRef, {
        audience: "admin",
        ...(negocioId ? { negocioId } : {}),
        orderId: event.orderId,
        title: "Pago online verificado",
        message: `${label} confirmó ${formatCopSimple(event.amountCop)} para el pedido #${event.orderId.slice(0, 8)}.`,
        read: false,
        createdAt: now,
      });

      transaction.create(dedupeRef, {
        provider: event.provider,
        eventId: event.eventId,
        transactionId: event.transactionId,
        orderId: event.orderId,
        status: event.status,
        outcome: "processed",
        processedAt: now,
      });

      writeAuditInTransaction(transaction, {
        actorUid,
        action: "webhook_payment_approved",
        module: "pedidos",
        entityId: event.orderId,
        changes: {
          provider: event.provider,
          transactionId: event.transactionId,
          amountCop: event.amountCop,
          promotedToConfirmado: shouldPromoteOrder,
        },
      });

      result = {
        outcome: "processed",
        orderId: event.orderId,
        transactionId: event.transactionId,
        status: event.status,
        paymentVerificationStatus: "verificado",
        orderStatus: nextOrderStatus,
      };
      return;
    }

    if (event.status === "declined" || event.status === "voided" || event.status === "error") {
      const isVoidingSameTransaction =
        event.status === "voided" && currentGatewayTxId === event.transactionId;
      if (currentVerificationStatus === "verificado" && !isVoidingSameTransaction) {
        transaction.create(dedupeRef, {
          provider: event.provider,
          eventId: event.eventId,
          transactionId: event.transactionId,
          orderId: event.orderId,
          status: event.status,
          outcome: "ignored_already_verified",
          processedAt: now,
        });
        result = {
          outcome: "ignored",
          reason: "already_verified",
          orderId: event.orderId,
          transactionId: event.transactionId,
          status: event.status,
        };
        return;
      }

      const rejectReason = `Transacción ${event.rawStatus} reportada por ${label}.`;
      const paymentVerification: OrderPaymentVerification = {
        status: "rechazado",
        updatedAt: now,
        updatedByUid: actorUid,
        updatedByName: label,
        reason: rejectReason,
      };

      transaction.update(orderRef, {
        paymentVerificationStatus: "rechazado",
        paymentVerification,
        paymentGateway,
        updatedAt: now,
      });

      if (clienteUid) {
        transaction.create(customerNotificationRef, {
          uid: clienteUid,
          ...(negocioId ? { negocioId } : {}),
          orderId: event.orderId,
          audience: "customer",
          title: "Pago online no aprobado",
          message: `El pago del pedido #${event.orderId.slice(0, 8)} fue reportado como ${event.rawStatus} en ${label}.`,
          read: false,
          createdAt: now,
        });
      }

      transaction.create(dedupeRef, {
        provider: event.provider,
        eventId: event.eventId,
        transactionId: event.transactionId,
        orderId: event.orderId,
        status: event.status,
        outcome: "processed",
        processedAt: now,
      });

      writeAuditInTransaction(transaction, {
        actorUid,
        action: "webhook_payment_rejected",
        module: "pedidos",
        entityId: event.orderId,
        changes: {
          provider: event.provider,
          transactionId: event.transactionId,
          rawStatus: event.rawStatus,
        },
      });

      result = {
        outcome: "processed",
        orderId: event.orderId,
        transactionId: event.transactionId,
        status: event.status,
        paymentVerificationStatus: "rechazado",
        orderStatus,
      };
      return;
    }

    // Pending status
    if (currentVerificationStatus === "verificado") {
      transaction.create(dedupeRef, {
        provider: event.provider,
        eventId: event.eventId,
        transactionId: event.transactionId,
        orderId: event.orderId,
        status: event.status,
        outcome: "ignored_already_verified",
        processedAt: now,
      });
      result = {
        outcome: "ignored",
        reason: "already_verified",
        orderId: event.orderId,
        transactionId: event.transactionId,
        status: event.status,
      };
      return;
    }

    transaction.update(orderRef, {
      paymentVerificationStatus: "pendiente_verificacion",
      paymentGateway,
      updatedAt: now,
    });

    transaction.create(dedupeRef, {
      provider: event.provider,
      eventId: event.eventId,
      transactionId: event.transactionId,
      orderId: event.orderId,
      status: event.status,
      outcome: "processed",
      processedAt: now,
    });

    writeAuditInTransaction(transaction, {
      actorUid,
      action: "webhook_payment_pending",
      module: "pedidos",
      entityId: event.orderId,
      changes: {
        provider: event.provider,
        transactionId: event.transactionId,
        rawStatus: event.rawStatus,
      },
    });

    result = {
      outcome: "processed",
      orderId: event.orderId,
      transactionId: event.transactionId,
      status: event.status,
      paymentVerificationStatus: "pendiente_verificacion",
      orderStatus,
    };
  });

  if (!result) {
    throw new Error("No fue posible procesar el webhook de pago");
  }

  return result;
}
