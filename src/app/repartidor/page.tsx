"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bike, RefreshCw, Timer } from "lucide-react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { DriverQueueBoard } from "@/components/delivery/DriverQueueBoard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { Order, OrderStatus } from "@/types/orders";

const LINEAR_DELIVERY_FLOW: readonly OrderStatus[] = [
  "pendiente",
  "confirmado",
  "preparando",
  "en_camino",
];

function getStepsToInTransit(current: OrderStatus): OrderStatus[] {
  const currentIndex = LINEAR_DELIVERY_FLOW.indexOf(current);
  const targetIndex = LINEAR_DELIVERY_FLOW.indexOf("en_camino");
  if (currentIndex === -1 || currentIndex >= targetIndex) return [];
  return LINEAR_DELIVERY_FLOW.slice(currentIndex + 1, targetIndex + 1);
}

export default function DriverQueuePage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [claimingOrderId, setClaimingOrderId] = useState<string | null>(null);
  const [startingRouteOrderId, setStartingRouteOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const loadOrders = useCallback(
    async (silent = false) => {
      if (!user) return;
      if (!silent) setLoading(true);
      setError("");
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/pedidos", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await response.json().catch(() => ({}))) as {
          orders?: Order[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "No se pudo cargar la cola de reparto.");
        }
        setOrders(body.orders ?? []);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "No se pudo cargar la cola de reparto.",
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!autoRefresh || !user) return;
    const timer = window.setInterval(() => {
      void loadOrders(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadOrders, user]);

  async function handleClaimOrder(order: Order) {
    if (!user) return;
    setClaimingOrderId(order.id);
    setActionError("");
    try {
      const token = await user.getIdToken();
      const driverName = user.displayName?.trim() || user.email?.trim() || "Repartidor";
      const response = await fetch(`/api/pedidos/${encodeURIComponent(order.id)}/repartidor`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          driver: {
            uid: user.uid,
            name: driverName,
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };
      if (!response.ok || !body.order) {
        throw new Error(body.error ?? "No se pudo asignar el pedido.");
      }
      setOrders((current) => current.map((item) => (item.id === order.id ? body.order! : item)));
    } catch (claimError) {
      setActionError(
        claimError instanceof Error ? claimError.message : "No se pudo asignar el pedido.",
      );
    } finally {
      setClaimingOrderId(null);
    }
  }

  async function handleStartRoute(order: Order) {
    if (!user) return;
    const steps = getStepsToInTransit(order.status);
    if (steps.length === 0) return;

    setStartingRouteOrderId(order.id);
    setActionError("");
    try {
      const token = await user.getIdToken();
      let latestOrder = order;
      for (const nextStatus of steps) {
        const response = await fetch(`/api/pedidos/${encodeURIComponent(order.id)}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: nextStatus,
            reason:
              nextStatus === "en_camino" ? "Repartidor en camino" : "Avance automático de ruta",
          }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          order?: Order;
          error?: string;
        };
        if (!response.ok || !body.order) {
          throw new Error(body.error ?? "No se pudo marcar en camino.");
        }
        latestOrder = body.order;
        setOrders((current) =>
          current.map((item) => (item.id === order.id ? latestOrder : item)),
        );
      }
    } catch (routeError) {
      setActionError(
        routeError instanceof Error ? routeError.message : "No se pudo marcar en camino.",
      );
    } finally {
      setStartingRouteOrderId(null);
    }
  }

  return (
    <AdminGuard permission="pedidos.read">
      <div className="min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E5196E]/40 bg-[#E5196E]/15 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-pink-200">
                <Bike className="h-3.5 w-3.5" /> Cola de Reparto
              </div>
              <h1 className="mt-2 font-headline text-3xl font-black uppercase tracking-tight text-white">
                Tablero del Repartidor
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Visualiza domicilios activos por zona, toma pedidos disponibles y abre cada entrega en 1 tap.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                asChild
                className="min-h-11 border-white/15 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
              >
                <Link href="/admin/pedidos">
                  <ArrowLeft className="h-4 w-4" /> Panel Pedidos
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={autoRefresh}
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={`min-h-11 border-white/15 ${
                  autoRefresh
                    ? "bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Timer className="h-4 w-4" /> Auto 15s
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadOrders()}
                disabled={loading}
                className="min-h-11 border-white/15 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
              </Button>
            </div>
          </header>

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-500/40 bg-red-950/70 p-4 text-sm text-red-100"
            >
              {error}
            </div>
          )}

          {actionError && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-500/40 bg-amber-950/70 p-4 text-sm text-amber-100"
            >
              {actionError}
            </div>
          )}

          {loading ? (
            <div
              aria-label="Cargando cola de entregas"
              className="grid grid-cols-1 gap-4 animate-pulse motion-reduce:animate-none lg:grid-cols-2"
            >
              <div className="h-52 rounded-2xl border border-white/10 bg-slate-900" />
              <div className="h-52 rounded-2xl border border-white/10 bg-slate-900" />
            </div>
          ) : (
            <DriverQueueBoard
              orders={orders}
              currentUid={user?.uid}
              currentName={user?.displayName ?? user?.email ?? undefined}
              claimingOrderId={claimingOrderId}
              startingRouteOrderId={startingRouteOrderId}
              onClaimOrder={handleClaimOrder}
              onStartRoute={handleStartRoute}
            />
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
