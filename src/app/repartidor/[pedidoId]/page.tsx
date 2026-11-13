"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import {
  DriverOrderView,
  type DriverDeliveryConfirmation,
} from "@/components/delivery/DriverOrderView";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { Order, OrderStatus } from "@/types/orders";

const LINEAR_DELIVERY_FLOW: readonly OrderStatus[] = [
  "pendiente",
  "confirmado",
  "preparando",
  "en_camino",
  "entregado",
];

function getTransitionSteps(current: OrderStatus, target: OrderStatus): OrderStatus[] {
  const currentIndex = LINEAR_DELIVERY_FLOW.indexOf(current);
  const targetIndex = LINEAR_DELIVERY_FLOW.indexOf(target);
  if (currentIndex === -1 || targetIndex === -1 || currentIndex >= targetIndex) {
    return [];
  }
  return LINEAR_DELIVERY_FLOW.slice(currentIndex + 1, targetIndex + 1);
}

export default function DriverOrderPage() {
  const params = useParams<{ pedidoId?: string; id?: string }>();
  const pedidoId = params.pedidoId ?? params.id ?? "";
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const loadOrder = useCallback(async () => {
    if (!user || !pedidoId) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/pedidos/${encodeURIComponent(pedidoId)}?view=admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };
      if (!response.ok || !body.order) {
        throw new Error(body.error ?? "No se pudo cargar el pedido.");
      }
      setOrder(body.order);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el pedido.");
    } finally {
      setLoading(false);
    }
  }, [pedidoId, user]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const patchOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus, reason: string, token: string): Promise<Order> => {
      const response = await fetch(`/api/pedidos/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, reason }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };
      if (!response.ok || !body.order) {
        throw new Error(body.error ?? "No se pudo actualizar el estado del pedido.");
      }
      return body.order;
    },
    [],
  );

  async function handleStartRoute() {
    if (!order || !user) return;
    const steps = getTransitionSteps(order.status, "en_camino");
    if (steps.length === 0) return;

    setUpdating(true);
    setActionError("");
    try {
      const token = await user.getIdToken();
      let latestOrder = order;
      for (const nextStatus of steps) {
        const reason =
          nextStatus === "en_camino" ? "Repartidor en camino" : "Avance automático de ruta";
        latestOrder = await patchOrderStatus(latestOrder.id, nextStatus, reason, token);
        setOrder(latestOrder);
      }
    } catch (updateError) {
      setActionError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo marcar el pedido en camino.",
      );
    } finally {
      setUpdating(false);
    }
  }

  async function handleConfirmDelivery(confirmation: DriverDeliveryConfirmation) {
    if (!order || !user || !confirmation.paymentCollected) return;
    const steps = getTransitionSteps(order.status, "entregado");
    if (steps.length === 0) return;

    setUpdating(true);
    setActionError("");
    try {
      const token = await user.getIdToken();
      let latestOrder = order;
      for (const nextStatus of steps) {
        const reason =
          nextStatus === "entregado"
            ? `Entregado - Cobro en ${confirmation.paymentMethod}`
            : nextStatus === "en_camino"
              ? "Repartidor en camino"
              : "Avance automático para entrega";
        latestOrder = await patchOrderStatus(latestOrder.id, nextStatus, reason, token);
        setOrder(latestOrder);
      }
    } catch (updateError) {
      setActionError(
        updateError instanceof Error ? updateError.message : "No se pudo confirmar la entrega.",
      );
    } finally {
      setUpdating(false);
    }
  }

  return (
    <AdminGuard permission="pedidos.read">
      <div className="min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              asChild
              className="min-h-11 border-white/15 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
            >
              <Link href="/admin/pedidos">
                <ArrowLeft className="h-4 w-4" /> Pedidos
              </Link>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => void loadOrder()}
              disabled={loading || updating}
              className="min-h-11 border-white/15 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </Button>
          </div>

          {loading ? (
            <div
              aria-label="Cargando pedido de reparto"
              className="space-y-4 animate-pulse motion-reduce:animate-none"
            >
              <div className="h-44 rounded-2xl border border-white/10 bg-slate-900" />
              <div className="h-44 rounded-2xl border border-white/10 bg-slate-900" />
              <div className="h-56 rounded-2xl border border-white/10 bg-slate-900" />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-500/40 bg-red-950/70 p-5 text-sm text-red-100"
            >
              <p className="font-semibold">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadOrder()}
                className="mt-3 min-h-11 border-red-400/50 bg-red-900/40 text-white hover:bg-red-800/60"
              >
                Reintentar
              </Button>
            </div>
          ) : (
            order && (
              <DriverOrderView
                order={order}
                updating={updating}
                error={actionError}
                onStartRoute={handleStartRoute}
                onConfirmDelivery={handleConfirmDelivery}
              />
            )
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
