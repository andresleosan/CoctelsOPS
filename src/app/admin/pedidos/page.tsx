"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BellOff,
  CloudUpload,
  Columns3,
  LayoutList,
  RefreshCw,
  Search,
  Timer,
  WifiOff,
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
import {
  applyOfflineMutationsToOrders,
  cacheOrdersSnapshot,
  enqueueOfflineOperation,
  getCachedOrdersSnapshot,
  listOfflineQueue,
} from "@/lib/offline/db";
import {
  isClientOnline,
  registerBackgroundSync,
  subscribeOfflineConnectivity,
  syncOfflineQueue,
} from "@/lib/offline/sync";
import { detectNewPendingOrderIds, getOrderSlaStatus } from "@/lib/orders/kds-sla";
import { getOrderAction } from "@/lib/orders/status-actions";
import type { Order, OrderStatus } from "@/types/orders";

class ApiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiResponseError";
  }
}

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
  const [isOnline, setIsOnline] = useState(true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState("");
  const seenOrderIdsRef = useRef<Set<string> | null>(null);

  async function loadFromOfflineCache(noticeMessage: string): Promise<boolean> {
    const [cachedOrders, queue] = await Promise.all([
      getCachedOrdersSnapshot(),
      listOfflineQueue(),
    ]);
    const activeQueue = queue.filter((item) => item.status !== "synced");
    setPendingOfflineCount(activeQueue.length);

    if (cachedOrders.length === 0 && activeQueue.length === 0) {
      return false;
    }

    const projected = applyOfflineMutationsToOrders(cachedOrders, activeQueue);
    seenOrderIdsRef.current = new Set(projected.map((item) => item.id));
    setOrders(projected);
    setOfflineNotice(noticeMessage);
    return true;
  }

  async function loadOrders(silent = false) {
    if (!user) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      if (!isClientOnline()) {
        setIsOnline(false);
        const restored = await loadFromOfflineCache(
          "Modo Offline activo: mostrando último respaldo local de barra y comandas en cola.",
        );
        if (!restored) {
          setError("Sin conexión WiFi y sin respaldo local de pedidos todavía.");
        }
        return;
      }

      const response = await fetch("/api/pedidos", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        orders?: Order[];
        error?: string;
      };
      if (!response.ok) {
        throw new ApiResponseError(body.error ?? "No se pudieron cargar los pedidos.");
      }
      const loadedOrders = body.orders ?? [];
      await cacheOrdersSnapshot(loadedOrders);

      const queue = await listOfflineQueue();
      const activeQueue = queue.filter((item) => item.status !== "synced");
      setPendingOfflineCount(activeQueue.length);

      const projectedOrders = applyOfflineMutationsToOrders(loadedOrders, activeQueue);

      if (seenOrderIdsRef.current !== null && soundEnabled) {
        const newPendingIds = detectNewPendingOrderIds(seenOrderIdsRef.current, projectedOrders);
        if (newPendingIds.length > 0) {
          playNewOrderChime();
        }
      }
      seenOrderIdsRef.current = new Set(projectedOrders.map((item) => item.id));
      setOrders(projectedOrders);
      if (activeQueue.length === 0) {
        setOfflineNotice("");
      }
    } catch (loadError) {
      if (!(loadError instanceof ApiResponseError)) {
        const restored = await loadFromOfflineCache(
          "Conexión inestable: operando con caché local de pedidos y cola offline.",
        );
        if (restored) {
          return;
        }
      }
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los pedidos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleSyncOfflineQueue() {
    if (!user || syncingQueue || !isClientOnline()) return;
    const queueBefore = await listOfflineQueue();
    const activeBefore = queueBefore.filter((item) => item.status !== "synced");
    setPendingOfflineCount(activeBefore.length);
    if (activeBefore.length === 0) return;

    setSyncingQueue(true);
    setActionError("");
    try {
      const report = await syncOfflineQueue({
        getAuthToken: () => user.getIdToken(),
      });
      const queueAfter = await listOfflineQueue();
      const activeAfter = queueAfter.filter((item) => item.status !== "synced");
      setPendingOfflineCount(activeAfter.length);

      if (report.synced > 0) {
        setOfflineNotice(
          activeAfter.length > 0
            ? `Sincronizadas ${report.synced} operaciones. Quedan ${activeAfter.length} en cola.`
            : `Cola offline sincronizada (${report.synced} ${report.synced === 1 ? "operación" : "operaciones"}).`,
        );
        await loadOrders(true);
      } else if (report.failed > 0) {
        const firstFailure = report.results.find((result) => result.outcome === "failed")?.error;
        setActionError(firstFailure ?? "No se pudieron sincronizar las comandas en cola.");
      }
    } finally {
      setSyncingQueue(false);
    }
  }

  useEffect(() => {
    setIsOnline(isClientOnline());
    void loadOrders();
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeOfflineConnectivity({
      onOnline: () => {
        setIsOnline(true);
        void handleSyncOfflineQueue();
      },
      onOffline: () => {
        setIsOnline(false);
        setOfflineNotice(
          "Modo Offline activo: los avances de comanda en barra se guardarán localmente.",
        );
      },
      onServiceWorkerSync: () => {
        void handleSyncOfflineQueue();
      },
    });
    return unsubscribe;
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

    const queueOfflineTransition = async (noticeMessage: string) => {
      await enqueueOfflineOperation({
        type: "update_status",
        payload: { orderId: order.id, status: action.nextStatus },
      });
      await registerBackgroundSync();
      const queue = await listOfflineQueue();
      const activeQueue = queue.filter((item) => item.status !== "synced");
      setPendingOfflineCount(activeQueue.length);
      setOrders((current) => applyOfflineMutationsToOrders(current, activeQueue));
      setOfflineNotice(noticeMessage);
    };

    try {
      if (!isClientOnline()) {
        setIsOnline(false);
        await queueOfflineTransition(
          `Sin WiFi: comanda #${order.id} guardada en cola offline (${action.nextStatus.replace("_", " ")}).`,
        );
        return;
      }

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
      if (!response.ok) {
        throw new ApiResponseError(body.error ?? "No se pudo actualizar el pedido.");
      }
      const nextOrders = orders.map((item) =>
        item.id === order.id && body.order ? body.order : item,
      );
      setOrders(nextOrders);
      await cacheOrdersSnapshot(nextOrders);
    } catch (updateError) {
      if (!(updateError instanceof ApiResponseError)) {
        await queueOfflineTransition(
          `Fallo de red: comanda #${order.id} guardada en cola offline para sincronizar al volver el WiFi.`,
        );
        return;
      }
      setActionError(updateError.message);
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
              {!isOnline && (
                <Badge
                  variant="outline"
                  data-testid="badge-offline-mode"
                  className="inline-flex items-center gap-1.5 border-amber-300 bg-amber-50 text-amber-950 font-semibold"
                >
                  <WifiOff className="h-3.5 w-3.5 text-amber-700" />
                  Modo Offline
                </Badge>
              )}
              {pendingOfflineCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="btn-sync-offline-queue"
                  onClick={() => void handleSyncOfflineQueue()}
                  disabled={syncingQueue || !isOnline}
                  className="min-h-10 border-cyan-300 bg-cyan-50 text-cyan-950 font-semibold hover:bg-cyan-100"
                >
                  <CloudUpload className="h-4 w-4 text-cyan-700" />
                  {syncingQueue
                    ? "Sincronizando..."
                    : `Sincronizar cola (${pendingOfflineCount})`}
                </Button>
              )}
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

        {offlineNotice && (
          <div
            role="status"
            data-testid="offline-status-banner"
            className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-950"
          >
            <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
            <span>{offlineNotice}</span>
          </div>
        )}
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
