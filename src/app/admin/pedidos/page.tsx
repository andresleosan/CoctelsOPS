"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BellOff,
  Columns3,
  LayoutList,
  RefreshCw,
  Search,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { OrderKdsBoard } from "@/components/admin/OrderKdsBoard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { detectNewPendingOrderIds, getOrderSlaStatus } from "@/lib/orders/kds-sla";
import { getOrderAction } from "@/lib/orders/status-actions";
import type { Order, OrderStatus } from "@/types/orders";

const statuses: Array<OrderStatus | "todos"> = [
  "todos",
  "pendiente",
  "confirmado",
  "preparando",
  "en_camino",
  "entregado",
  "cancelado",
];

function playNewOrderChime(): void {
  if (typeof window === "undefined") return;
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(587.33, now); // D5
    oscillator.frequency.setValueAtTime(880, now + 0.12); // A5
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.45);
  } catch {
    // Web Audio API can be blocked before user interaction; fail silently.
  }
}

export default function AdminOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "todos">("todos");
  const [viewMode, setViewMode] = useState<"lista" | "kds">("lista");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const seenOrderIdsRef = useRef<Set<string> | null>(null);

  async function loadOrders(silent = false) {
    if (!user) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pedidos", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        orders?: Order[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los pedidos.");
      const loadedOrders = body.orders ?? [];

      if (seenOrderIdsRef.current !== null && soundEnabled) {
        const newPendingIds = detectNewPendingOrderIds(seenOrderIdsRef.current, loadedOrders);
        if (newPendingIds.length > 0) {
          playNewOrderChime();
        }
      }
      seenOrderIdsRef.current = new Set(loadedOrders.map((item) => item.id));
      setOrders(loadedOrders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los pedidos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [user]);

  useEffect(() => {
    if (!autoRefresh || !user) return;
    const timer = window.setInterval(() => {
      void loadOrders(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, user, soundEnabled]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matchesStatus = status === "todos" || order.status === status;
        const normalized = query.trim().toLocaleLowerCase();
        const matchesQuery =
          !normalized ||
          order.customerName.toLocaleLowerCase().includes(normalized) ||
          order.phone.includes(normalized) ||
          order.id.toLocaleLowerCase().includes(normalized);
        return matchesStatus && matchesQuery;
      }),
    [orders, query, status],
  );

  const activeBarCount = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === "pendiente" ||
          order.status === "confirmado" ||
          order.status === "preparando",
      ).length,
    [orders],
  );

  async function updateStatus(order: Order, skipConfirm = false) {
    const action = getOrderAction(order.status);
    if (!action || !user) return;
    if (
      !skipConfirm &&
      !window.confirm(
        `¿Quieres marcar el pedido de ${order.customerName} como ${action.nextStatus.replace("_", " ")}?`,
      )
    ) {
      return;
    }
    setActionError("");
    setUpdatingOrderId(order.id);
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
      if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar el pedido.");
      setOrders((current) =>
        current.map((item) => (item.id === order.id && body.order ? body.order : item)),
      );
    } catch (updateError) {
      setActionError(
        updateError instanceof Error ? updateError.message : "No se pudo actualizar el pedido.",
      );
    } finally {
      setUpdatingOrderId(null);
    }
  }

  return (
    <AdminGuard permission="pedidos.read">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Operaciones</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-950">Pedidos</h1>
              <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-950">
                {activeBarCount} activos en barra
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Gestiona el estado de cada pedido y supervisa las recetas en barra con semáforo SLA.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
              role="group"
              aria-label="Modo de visualización de pedidos"
            >
              <Button
                type="button"
                variant={viewMode === "lista" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("lista")}
                className="min-h-9"
              >
                <LayoutList className="h-4 w-4" /> Vista Lista
              </Button>
              <Button
                type="button"
                variant={viewMode === "kds" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("kds")}
                className="min-h-9"
              >
                <Columns3 className="h-4 w-4" /> Tablero KDS
              </Button>
            </div>

            <Button
              type="button"
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh((prev) => !prev)}
              aria-pressed={autoRefresh}
              className="min-h-10"
            >
              <Timer className="h-4 w-4" /> Auto 15s
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSoundEnabled((prev) => !prev)}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? "Silenciar alerta sonora" : "Activar alerta sonora"}
              className="min-h-10"
            >
              {soundEnabled ? <Bell className="h-4 w-4 text-cyan-700" /> : <BellOff className="h-4 w-4 text-slate-400" />}
              {soundEnabled ? "Sonido activo" : "Silenciado"}
            </Button>

            <Button
              variant="outline"
              onClick={() => void loadOrders()}
              disabled={loading}
              className="min-h-10"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} /> Actualizar
            </Button>
          </div>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, teléfono o pedido"
                className="pl-9 text-slate-900"
                aria-label="Buscar pedidos"
              />
            </div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as OrderStatus | "todos")}
              className="h-10 rounded-md border border-input bg-white px-3 text-sm text-slate-800"
              aria-label="Filtrar por estado"
            >
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item === "todos" ? "Todos los estados" : item.replace("_", " ")}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {actionError && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="p-10 text-center text-sm text-slate-500">
              No encontramos pedidos con estos filtros.
            </CardContent>
          </Card>
        ) : viewMode === "kds" ? (
          <OrderKdsBoard
            orders={filteredOrders}
            updatingOrderId={updatingOrderId}
            onAdvanceOrder={updateStatus}
          />
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const action = getOrderAction(order.status);
              const sla = getOrderSlaStatus(order.createdAt, order.status);
              return (
                <Card key={order.id} className="border-slate-200 bg-white shadow-sm">
                  <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{order.customerName}</p>
                        <Badge variant="outline" className="capitalize text-slate-800">
                          {order.status.replace("_", " ")}
                        </Badge>
                        <Badge variant="secondary" className="bg-slate-100 text-xs text-slate-700">
                          {sla.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        #{order.id} · {order.phone} · {order.items.length} productos
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {order.items.map((item, idx) => (
                          <span
                            key={`${item.productId}-${idx}`}
                            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-800"
                          >
                            {item.quantity}x {item.name} ({item.customization.size}
                            {item.customization.flavors.length > 0
                              ? ` · ${item.customization.flavors.join(", ")}`
                              : ""}
                            )
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-slate-600">{order.address}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <span className="font-bold text-slate-900">
                        ${order.total.toLocaleString("es-CO")}
                      </span>
                      <PermissionGate permission="pedidos.update">
                        {action && (
                          <Button
                            size="sm"
                            disabled={updatingOrderId === order.id}
                            onClick={() => void updateStatus(order, false)}
                          >
                            {action.label.toLocaleLowerCase()}
                          </Button>
                        )}
                      </PermissionGate>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/pedidos/${order.id}`}>
                          Detalle <ArrowRight />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
