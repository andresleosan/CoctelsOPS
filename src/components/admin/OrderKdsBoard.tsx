"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Flame, MapPin, MessageSquareWarning, Phone, Printer, Sparkles } from "lucide-react";

import { OrderReceiptPrint } from "@/components/admin/OrderReceiptPrint";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getOrderSlaStatus,
  groupOrdersIntoKdsColumns,
  type KdsColumnKey,
  type SlaLevel,
} from "@/lib/orders/kds-sla";
import { getOrderAction } from "@/lib/orders/status-actions";
import type { Order } from "@/types/orders";

export type OrderKdsBoardProps = {
  orders: Order[];
  nowMs?: number;
  updatingOrderId?: string | null;
  onAdvanceOrder: (order: Order, skipConfirm?: boolean) => void | Promise<void>;
  onPrintOrder?: (order: Order) => void;
};

const SLA_STYLES: Record<SlaLevel, string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  critical: "border-red-400 bg-red-50 text-red-950 font-bold",
  completed: "border-slate-200 bg-slate-100 text-slate-700",
};

const COLUMN_ACCENT_STYLES: Record<KdsColumnKey, string> = {
  nuevos: "border-t-4 border-t-pink-600",
  preparacion: "border-t-4 border-t-cyan-600",
  despacho: "border-t-4 border-t-violet-600",
  finalizados: "border-t-4 border-t-slate-400",
};

export function OrderKdsBoard({
  orders,
  nowMs = Date.now(),
  updatingOrderId = null,
  onAdvanceOrder,
  onPrintOrder,
}: OrderKdsBoardProps) {
  const [activePrintOrder, setActivePrintOrder] = useState<Order | null>(null);
  const columns = groupOrdersIntoKdsColumns(orders);

  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      data-testid="order-kds-board"
      aria-label="Tablero KDS de preparación en barra"
    >
      {columns.map((column) => (
        <section
          key={column.key}
          data-testid={`kds-column-${column.key}`}
          aria-label={column.title}
          className={`flex flex-col rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm ${COLUMN_ACCENT_STYLES[column.key]}`}
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div>
              <h2 className="text-base font-bold text-slate-950">{column.title}</h2>
              <p className="text-xs text-slate-600">{column.subtitle}</p>
            </div>
            <span
              className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-bold text-white"
              aria-label={`${column.orders.length} pedidos en ${column.title}`}
            >
              {column.orders.length}
            </span>
          </div>

          {column.orders.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 p-6 text-center text-xs text-slate-500">
              Sin pedidos en esta estación
            </div>
          ) : (
            <div className="space-y-3">
              {column.orders.map((order) => {
                const sla = getOrderSlaStatus(order.createdAt, order.status, nowMs);
                const action = getOrderAction(order.status);
                const isUpdating = updatingOrderId === order.id;

                return (
                  <Card
                    key={order.id}
                    data-testid={`kds-card-${order.id}`}
                    className={`border bg-white shadow-sm transition-shadow hover:shadow-md ${
                      sla.level === "critical" ? "border-red-300 ring-1 ring-red-200" : "border-slate-200"
                    }`}
                  >
                    <CardHeader className="space-y-2 p-4 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base font-bold text-slate-950">
                            {order.customerName}
                          </CardTitle>
                          <p className="text-xs font-medium text-slate-600">#{order.id}</p>
                        </div>
                        <Badge
                          variant="outline"
                          data-testid={`kds-sla-${order.id}`}
                          className={`inline-flex items-center gap-1 text-[11px] ${SLA_STYLES[sla.level]}`}
                        >
                          {sla.level === "critical" ? (
                            <Flame className="h-3.5 w-3.5 text-red-600" />
                          ) : (
                            <Clock className="h-3.5 w-3.5" />
                          )}
                          {sla.label}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {order.phone}
                        </span>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-800 capitalize">
                          {order.status.replace("_", " ")}
                        </Badge>
                        {order.serviceType === "mesa" || order.tableNumber || order.address.toLowerCase().includes("mesa") ? (
                          <Badge variant="outline" className="border-pink-300 bg-pink-50 text-pink-900 font-bold text-[11px]">
                            🍽️ {order.tableNumber ? (order.tableNumber.toLowerCase().startsWith("mesa") ? order.tableNumber : `Mesa ${order.tableNumber}`) : "Mesa"}
                          </Badge>
                        ) : order.serviceType === "pickup" || order.address.toLowerCase().includes("barra") ? (
                          <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-950 font-bold text-[11px]">
                            🍸 En Barra
                          </Badge>
                        ) : null}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 p-4 pt-2">
                      {/* Receta detallada para el bartender */}
                      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        {order.items.map((item, index) => (
                          <div
                            key={`${item.productId}-${index}`}
                            className="border-b border-slate-200/80 pb-2 last:border-b-0 last:pb-0"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-bold text-slate-950">
                                {item.quantity}x {item.name}
                              </span>
                              <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[11px] font-bold text-cyan-950">
                                {item.customization.size}
                              </span>
                            </div>

                            {item.customization.flavors.length > 0 && (
                              <p className="mt-1 text-xs text-slate-700">
                                <strong className="text-slate-900">Sabores:</strong>{" "}
                                {item.customization.flavors.join(", ")}
                              </p>
                            )}

                            {item.customization.addOns.length > 0 && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-pink-800">
                                <Sparkles className="h-3 w-3 shrink-0" />
                                <span>
                                  <strong>Toppings:</strong> {item.customization.addOns.join(", ")}
                                </span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-700">
                        <p className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                          <span>{order.address}</span>
                        </p>
                        {order.notes && (
                          <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-950">
                            <MessageSquareWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                            <span>
                              <strong>Nota:</strong> {order.notes}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                        <span className="text-sm font-extrabold text-slate-950">
                          ${order.total.toLocaleString("es-CO")}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`btn-kds-print-${order.id}`}
                            className="min-h-11 px-2.5 text-slate-700 hover:text-slate-950"
                            title="Imprimir comanda o etiquetas de vaso"
                            aria-label={`Imprimir comanda pedido ${order.id}`}
                            onClick={() => {
                              if (onPrintOrder) {
                                onPrintOrder(order);
                              } else {
                                setActivePrintOrder(order);
                              }
                            }}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" asChild className="min-h-11 px-3">
                            <Link href={`/admin/pedidos/${order.id}`} aria-label={`Detalle del pedido ${order.id}`}>
                              Detalle <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <PermissionGate permission="pedidos.update">
                            {action && (
                              <Button
                                size="sm"
                                className="min-h-11 bg-slate-900 px-3.5 font-bold text-white hover:bg-slate-800"
                                disabled={isUpdating}
                                onClick={() => void onAdvanceOrder(order, true)}
                              >
                                {isUpdating ? "Guardando..." : action.label}
                              </Button>
                            )}
                          </PermissionGate>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      ))}
      <OrderReceiptPrint
        order={activePrintOrder}
        isOpen={activePrintOrder !== null}
        onClose={() => setActivePrintOrder(null)}
      />
    </div>
  );
}
