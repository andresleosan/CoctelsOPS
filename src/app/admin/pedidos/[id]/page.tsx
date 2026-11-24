"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, FlaskConical, MessageCircle, Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { OrderReceiptPrint } from "@/components/admin/OrderReceiptPrint";
import { PaymentProofVerificationControls } from "@/components/admin/PaymentProofVerificationControls";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { getOrderSlaStatus } from "@/lib/orders/kds-sla";
import { formatPosPaymentSummary } from "@/lib/orders/pos-calculator";
import { getOrderAction } from "@/lib/orders/status-actions";
import { buildWhatsAppMessage } from "@/lib/orders/whatsapp-message";
import type { StoreConfiguration } from "@/types/operations";
import type { Order, PaymentVerificationStatus } from "@/types/orders";

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [businessPhone, setBusinessPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [error, setError] = useState("");

  async function loadOrder() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/pedidos/${encodeURIComponent(id)}?view=admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };
      if (!response.ok || !body.order) throw new Error(body.error ?? "No se pudo cargar el pedido.");
      setOrder(body.order);
      try {
        const configurationResponse = await fetch("/api/configuration");
        if (configurationResponse.ok) {
          const configurationBody = (await configurationResponse.json()) as {
            configuration?: StoreConfiguration;
          };
          setBusinessPhone(configurationBody.configuration?.whatsappNumber ?? "");
        }
      } catch {
        /* The order remains usable when business configuration is temporarily unavailable. */
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el pedido.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [id, user]);

  async function advanceOrder() {
    if (!order || !user) return;
    const action = getOrderAction(order.status);
    if (!action || !window.confirm(`¿Confirmas el cambio a ${action.nextStatus.replace("_", " ")}?`))
      return;
    setUpdating(true);
    setError("");
    try {
      const response = await fetch(`/api/pedidos/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ status: action.nextStatus }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };
      if (!response.ok || !body.order) throw new Error(body.error ?? "No se pudo actualizar el pedido.");
      setOrder(body.order);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "No se pudo actualizar el pedido.",
      );
    } finally {
      setUpdating(false);
    }
  }

  async function handleVerifyPayment(
    _orderId: string,
    nextStatus: PaymentVerificationStatus,
    reason?: string,
  ) {
    if (!order || !user) return;
    setVerifyingPayment(true);
    setError("");
    try {
      const response = await fetch(
        `/api/pedidos/${encodeURIComponent(order.id)}/comprobante`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify({
            status: nextStatus,
            ...(reason ? { reason } : {}),
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };
      if (!response.ok || !body.order) {
        throw new Error(body.error ?? "No se pudo verificar el comprobante.");
      }
      setOrder(body.order);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "No se pudo verificar el comprobante.",
      );
    } finally {
      setVerifyingPayment(false);
    }
  }

  return (
    <AdminGuard permission="pedidos.read">
      <div className="space-y-6">
        <Link
          href="/admin/pedidos"
          className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:text-cyan-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a pedidos
        </Link>
        {loading ? (
          <div className="h-80 animate-pulse rounded-xl bg-white" />
        ) : error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-3 border-red-300 bg-white"
              onClick={() => void loadOrder()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          order && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">
                    Detalle de pedido
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-bold text-slate-950">#{order.id}</h1>
                    <Badge variant="outline" className="capitalize text-slate-800">
                      {order.status.replace("_", " ")}
                    </Badge>
                    <Badge variant="secondary" className="inline-flex items-center gap-1 bg-slate-100 text-slate-800">
                      <Clock className="h-3.5 w-3.5" />
                      {getOrderSlaStatus(order.createdAt, order.status).label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Creado {new Date(order.createdAt).toLocaleString("es-CO")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    data-testid="btn-open-print-modal"
                    onClick={() => setIsPrintOpen(true)}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" /> Imprimir Comanda
                  </Button>
                  <PermissionGate permission="pedidos.update">
                    {getOrderAction(order.status) && (
                      <Button onClick={() => void advanceOrder()} disabled={updating}>
                        <CheckCircle2 />{" "}
                        {updating
                          ? "Guardando..."
                          : getOrderAction(order.status)?.label.toLocaleLowerCase()}
                      </Button>
                    )}
                  </PermissionGate>
                  {businessPhone && (
                    <Button variant="outline" asChild>
                      <a
                        href={buildWhatsAppMessage(order, businessPhone)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle /> WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-slate-200 bg-white shadow-sm lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg text-slate-950">
                      Productos y Receta de Preparación
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {order.items.map((item, idx) => (
                      <div
                        key={`${item.productId}-${idx}`}
                        className="flex flex-col gap-1 border-b border-slate-100 pb-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="space-y-1">
                          <span className="font-semibold text-slate-950">
                            {item.quantity} × {item.name}
                          </span>
                          <div className="flex flex-wrap gap-1.5 text-xs text-slate-600">
                            <span className="rounded bg-cyan-50 px-2 py-0.5 font-medium text-cyan-900">
                              Presentación: {item.customization.size}
                            </span>
                            {item.customization.flavors.length > 0 && (
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-800">
                                Sabores: {item.customization.flavors.join(", ")}
                              </span>
                            )}
                            {item.customization.addOns.length > 0 && (
                              <span className="rounded bg-pink-50 px-2 py-0.5 font-medium text-pink-900">
                                Adiciones: {item.customization.addOns.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-semibold text-slate-950">
                          ${item.subtotal.toLocaleString("es-CO")}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 font-bold text-slate-950">
                      <span>Total</span>
                      <span>${order.total.toLocaleString("es-CO")}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg text-slate-950">Entrega</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-slate-800">
                    <p>
                      <strong>Cliente:</strong> {order.customerName}
                    </p>
                    <p>
                      <strong>Teléfono:</strong> {order.phone}
                    </p>
                    <p>
                      <strong>Dirección:</strong> {order.address}
                    </p>
                    {order.notes && (
                      <p>
                        <strong>Notas:</strong> {order.notes}
                      </p>
                    )}
                    {order.paymentMethod && (
                      <p>
                        <strong>Pago:</strong>{" "}
                        {formatPosPaymentSummary(order.paymentMethod, order.paymentBreakdown)}
                      </p>
                    )}
                    <PaymentProofVerificationControls
                      orderId={order.id}
                      paymentVerificationStatus={order.paymentVerificationStatus}
                      paymentProof={order.paymentProof}
                      paymentVerification={order.paymentVerification}
                      digitalChannel={order.paymentBreakdown?.digitalMethod}
                      digitalReference={order.paymentBreakdown?.digitalReference}
                      isVerifying={verifyingPayment}
                      onVerifyPayment={handleVerifyPayment}
                    />
                  </CardContent>
                </Card>
              </div>
              {order.escandallo && (
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                        <FlaskConical className="h-5 w-5 text-cyan-700" />
                        Escandallo y Descuento Automático de Barra
                      </CardTitle>
                      <p className="text-xs text-slate-600">
                        Descontado al pasar a{" "}
                        <span className="font-semibold text-slate-900">
                          {order.escandallo.triggeredOnStatus}
                        </span>{" "}
                        el {new Date(order.escandallo.depletedAt).toLocaleString("es-CO")} (
                        {order.escandallo.coveredItemsCount}/{order.escandallo.totalItemsCount}{" "}
                        ítems con receta)
                      </p>
                    </div>
                    <Badge
                      className={
                        order.escandallo.coverage === "complete"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : "bg-amber-100 text-amber-900 border border-amber-300"
                      }
                    >
                      {order.escandallo.coverage === "complete"
                        ? "Escandallo completo"
                        : "Escandallo parcial"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-600">
                          Venta Pedido
                        </p>
                        <p className="mt-1 text-lg font-extrabold text-slate-950">
                          ${order.escandallo.revenueCop.toLocaleString("es-CO")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-600">
                          Costo Estándar Insumos
                        </p>
                        <p className="mt-1 text-lg font-extrabold text-amber-800">
                          ${order.escandallo.totalCostCop.toLocaleString("es-CO")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-600">
                          Utilidad / Margen Bruto
                        </p>
                        <p className="mt-1 text-lg font-extrabold text-emerald-800">
                          ${order.escandallo.grossProfitCop.toLocaleString("es-CO")} (
                          {order.escandallo.grossMarginPct}%)
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {order.escandallo.items.map((escItem, idx) => (
                        <div
                          key={`${escItem.productId}-${idx}`}
                          className="rounded-xl border border-slate-200 p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-slate-950">
                              {escItem.quantity} × {escItem.productName}{" "}
                              <span className="text-xs font-semibold text-cyan-800">
                                ({escItem.presentation})
                              </span>
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                              <span className="text-amber-800">
                                Costo: ${escItem.totalCostCop.toLocaleString("es-CO")}
                              </span>
                              <span className="text-emerald-800">
                                Margen: {escItem.grossMarginPct}%
                              </span>
                            </div>
                          </div>
                          {escItem.ingredients.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-500">
                              Sin receta estándar asociada a esta presentación.
                            </p>
                          ) : (
                            <ul className="mt-2 space-y-1 text-xs text-slate-700">
                              {escItem.ingredients.map((ing, ingIdx) => (
                                <li
                                  key={`${ing.supplyId}-${ingIdx}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2.5 py-1"
                                >
                                  <span>
                                    <strong className="text-slate-900">{ing.supplyName}</strong>
                                    {ing.addOnName && (
                                      <span className="ml-1.5 rounded bg-pink-100 px-1.5 py-0.5 text-[11px] font-semibold text-pink-900">
                                        +{ing.addOnName}
                                      </span>
                                    )}
                                    : {ing.recipeQuantity} {ing.recipeUnit} (descontado{" "}
                                    {ing.supplyQuantity} {ing.supplyUnit})
                                  </span>
                                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                                    {typeof ing.shortfallQuantity === "number" &&
                                      ing.shortfallQuantity > 0 && (
                                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-900">
                                          Faltante: {ing.shortfallQuantity} {ing.supplyUnit}
                                        </span>
                                      )}
                                    ${ing.costCop.toLocaleString("es-CO")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              <OrderReceiptPrint
                order={order}
                isOpen={isPrintOpen}
                onClose={() => setIsPrintOpen(false)}
              />
            </>
          )
        )}
      </div>
    </AdminGuard>
  );
}
