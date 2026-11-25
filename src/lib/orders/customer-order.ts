import type {
  CustomerOrder,
  CustomerOrderAssignedDriver,
  CustomerOrderPaymentGateway,
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
  const rawPaymentGateway = visibleOrder.paymentGateway;
  const rawAssignedDriver = visibleOrder.assignedDriver;

  delete visibleOrder.audit;
  delete visibleOrder.clienteUid;
  delete visibleOrder.statusHistory;
  delete visibleOrder.escandallo;
  delete visibleOrder.suppliesDepletedAt;
  delete visibleOrder.suppliesDepletedOnStatus;
  delete visibleOrder.paymentProof;
  delete visibleOrder.paymentVerification;
  delete visibleOrder.paymentGateway;
  delete visibleOrder.assignedDriver;

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

  const paymentGateway: CustomerOrderPaymentGateway | undefined = rawPaymentGateway
    ? {
        provider: rawPaymentGateway.provider,
        status: rawPaymentGateway.status,
        confirmedAt: rawPaymentGateway.confirmedAt,
        ...(rawPaymentGateway.channel ? { channel: rawPaymentGateway.channel } : {}),
      }
    : undefined;

  const assignedDriver: CustomerOrderAssignedDriver | undefined = rawAssignedDriver
    ? {
        name: rawAssignedDriver.name,
        assignedAt: rawAssignedDriver.assignedAt,
      }
    : undefined;

  return {
    ...visibleOrder,
    statusHistory: visibleHistory,
    ...(paymentProof ? { paymentProof } : {}),
    ...(paymentVerification ? { paymentVerification } : {}),
    ...(paymentGateway ? { paymentGateway } : {}),
    ...(assignedDriver ? { assignedDriver } : {}),
  } as CustomerOrder;
}
