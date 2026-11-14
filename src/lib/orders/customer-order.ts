import type { CustomerOrder, Order, CustomerStatusHistoryEntry } from "@/types/orders";

export function toCustomerOrder(order: Order): CustomerOrder {
  const visibleOrder: Partial<Order> = { ...order };
  const statusHistory = visibleOrder.statusHistory;
  delete visibleOrder.audit;
  delete visibleOrder.clienteUid;
  delete visibleOrder.statusHistory;
  delete visibleOrder.escandallo;
  delete visibleOrder.suppliesDepletedAt;
  delete visibleOrder.suppliesDepletedOnStatus;
  const visibleHistory: CustomerStatusHistoryEntry[] = (statusHistory?.length ? statusHistory : [{ status: order.status, at: order.updatedAt || order.createdAt }]).map(({ status, at, reason }) => ({
    status,
    at,
    ...(reason ? { reason } : {}),
  }));

  return { ...visibleOrder, statusHistory: visibleHistory } as CustomerOrder;
}
