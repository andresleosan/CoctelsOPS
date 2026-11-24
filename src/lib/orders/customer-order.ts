import type {
  CustomerOrder,
  CustomerOrderPaymentProof,
  CustomerOrderPaymentVerification,
  CustomerStatusHistoryEntry,
  Order,
} from "@/types/orders";

export function toCustomerOrder(order: Order): CustomerOrder {
  const visibleOrder: Partial<Order> = { ...order };
  const statusHistory = visibleOrder.statusHistory;
  const rawPaymentProof = visibleOrder.paymentProof;
  const rawPaymentVerification = visibleOrder.paymentVerification;

  delete visibleOrder.audit;
  delete visibleOrder.clienteUid;
  delete visibleOrder.statusHistory;
  delete visibleOrder.escandallo;
  delete visibleOrder.suppliesDepletedAt;
  delete visibleOrder.suppliesDepletedOnStatus;
  delete visibleOrder.paymentProof;
  delete visibleOrder.paymentVerification;

  const visibleHistory: CustomerStatusHistoryEntry[] = (
    statusHistory?.length
      ? statusHistory
      : [{ status: order.status, at: order.updatedAt || order.createdAt }]
  ).map(({ status, at, reason }) => ({
    status,
    at,
    ...(reason ? { reason } : {}),
  }));

  const paymentProof: CustomerOrderPaymentProof | undefined = rawPaymentProof
    ? {
        url: rawPaymentProof.url,
        uploadedAt: rawPaymentProof.uploadedAt,
        ...(rawPaymentProof.channel ? { channel: rawPaymentProof.channel } : {}),
        ...(rawPaymentProof.reference ? { reference: rawPaymentProof.reference } : {}),
      }
    : undefined;

  const paymentVerification: CustomerOrderPaymentVerification | undefined = rawPaymentVerification
    ? {
        status: rawPaymentVerification.status,
        updatedAt: rawPaymentVerification.updatedAt,
        ...(rawPaymentVerification.reason ? { reason: rawPaymentVerification.reason } : {}),
      }
    : undefined;

  return {
    ...visibleOrder,
    statusHistory: visibleHistory,
    ...(paymentProof ? { paymentProof } : {}),
    ...(paymentVerification ? { paymentVerification } : {}),
  } as CustomerOrder;
}
