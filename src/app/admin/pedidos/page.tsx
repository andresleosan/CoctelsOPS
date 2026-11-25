"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BellOff,
  Bike,
  CloudUpload,
  Columns3,
  LayoutList,
  PlusCircle,
  RefreshCw,
  Search,
  Timer,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { OrderKdsBoard, type DriverOption } from "@/components/admin/OrderKdsBoard";
import { OrderReceiptPrint } from "@/components/admin/OrderReceiptPrint";
import { PaymentProofVerificationControls } from "@/components/admin/PaymentProofVerificationControls";
import { PermissionGate } from "@/components/admin/PermissionGate";
import {
  QuickBarPosModal,
  type PosOrderSubmitResult,
} from "@/components/admin/QuickBarPosModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  applyOfflineMutationsToOrders,
  cacheOrdersSnapshot,
  cacheProductsSnapshot,
  enqueueOfflineOperation,
  getCachedOrdersSnapshot,
  getCachedProductsSnapshot,
  listOfflineQueue,
  removeOfflineQueueItem,
} from "@/lib/offline/db";
import {
  enqueueAndSyncBarOrder,
  isClientOnline,
  registerBackgroundSync,
  subscribeOfflineConnectivity,
  syncOfflineQueue,
} from "@/lib/offline/sync";
import { isDeliveryOrder } from "@/lib/orders/delivery-zones";
import { detectNewPendingOrderIds, getOrderSlaStatus } from "@/lib/orders/kds-sla";
import { getEffectivePaymentVerificationStatus } from "@/lib/orders/payment-verification";
import {
  formatPosPaymentSummary,
  type PosOrderPreview,
} from "@/lib/orders/pos-calculator";
import { getOrderAction } from "@/lib/orders/status-actions";
import type { UserProfile } from "@/types/auth";
import type { Product } from "@/types/catalog";
import type {
  AssignOrderDriverInput,
  CreateOrderInput,
  Order,
  OrderStatus,
  PaymentVerificationStatus,
} from "@/types/orders";

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
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<DriverOption[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState("");
  const [isPosOpen, setIsPosOpen] = useState(false);
  const [posProducts, setPosProducts] = useState<Product[]>([]);
  const [loadingPosProducts, setLoadingPosProducts] = useState(false);
  const [posPrintOrder, setPosPrintOrder] = useState<Order | null>(null);
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

  async function loadPosProducts() {
    setLoadingPosProducts(true);
    try {
      if (!isClientOnline()) {
        const cached = await getCachedProductsSnapshot();
        if (cached.length > 0) setPosProducts(cached);
        return;
      }

      const response = await fetch("/api/productos");
      const body = (await response.json().catch(() => ({}))) as { products?: Product[] };
      if (response.ok && Array.isArray(body.products)) {
        setPosProducts(body.products);
        await cacheProductsSnapshot(body.products);
        return;
      }

      const cached = await getCachedProductsSnapshot();
      if (cached.length > 0) setPosProducts(cached);
    } catch {
      const cached = await getCachedProductsSnapshot();
      if (cached.length > 0) setPosProducts(cached);
    } finally {
      setLoadingPosProducts(false);
    }
  }

  async function handleSubmitPosOrder(
    payload: CreateOrderInput,
    preview: PosOrderPreview,
  ): Promise<PosOrderSubmitResult> {
    if (!user) {
      return { ok: false, error: "Debes iniciar sesión para registrar comandas POS." };
    }

    const result = await enqueueAndSyncBarOrder(payload, {
      getAuthToken: () => user.getIdToken(),
      preview,
    });

    const queueItemResult = result.syncReport?.results.find(
      (entry) => entry.id === result.item.id,
    );

    if (
      !result.synced &&
      queueItemResult?.statusCode &&
      [400, 404, 422].includes(queueItemResult.statusCode)
    ) {
      await removeOfflineQueueItem(result.item.id);
      const remainingQueue = (await listOfflineQueue()).filter((item) => item.status !== "synced");
      setPendingOfflineCount(remainingQueue.length);
      return {
        ok: false,
        error: queueItemResult.error ?? "No se pudo validar el pedido en el servidor.",
      };
    }

    const queue = await listOfflineQueue();
    const activeQueue = queue.filter((item) => item.status !== "synced");
    setPendingOfflineCount(activeQueue.length);

    if (result.synced) {
      const syncedOrder = queueItemResult?.order;
      if (syncedOrder) {
        setOrders((current) => {
          const withoutDuplicate = current.filter((item) => item.id !== syncedOrder.id);
          const next = [syncedOrder, ...withoutDuplicate];
          seenOrderIdsRef.current = new Set(next.map((item) => item.id));
          void cacheOrdersSnapshot(next);
          return next;
        });
      } else {
        await loadOrders(true);
      }
      return { ok: true, synced: true, order: syncedOrder };
    }

    setIsOnline(isClientOnline());
    const baseOrders = orders.filter((item) => !item.id.startsWith("offline-"));
    const projectedOrders = applyOfflineMutationsToOrders(baseOrders, activeQueue);
    const provisionalOrder = projectedOrders.find(
      (item) => item.id === `offline-${result.item.idempotencyKey}`,
    );
    seenOrderIdsRef.current = new Set(projectedOrders.map((item) => item.id));
    setOrders(projectedOrders);
    setOfflineNotice(
      "Modo Offline activo: pedido POS encolado localmente para sincronizar al volver el WiFi.",
    );

    return { ok: true, synced: false, order: provisionalOrder };
  }

  async function loadDrivers() {
    if (!user || !isClientOnline()) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => ({}))) as { users?: UserProfile[] };
      if (!Array.isArray(body.users)) return;
      const drivers = body.users
        .filter((profile) => profile.active && (profile.accountType === "staff" || profile.accountType === "admin"))
        .map((profile) => ({
          uid: profile.uid,
          name: profile.displayName?.trim() || profile.email,
          ...(profile.telefono?.trim() ? { phone: profile.telefono.trim() } : {}),
        }));
      setAvailableDrivers(drivers);
    } catch {
      // Staff without usuarios.read can still enter driver names manually.
    }
  }

  useEffect(() => {
    setIsOnline(isClientOnline());
    void loadOrders();
    void loadPosProducts();
    void loadDrivers();
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeOfflineConnectivity({
      onOnline: () => {
        setIsOnline(true);
        void handleSyncOfflineQueue();
        if (posProducts.length === 0) {
          void loadPosProducts();
        }
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

  const pendingPaymentCount = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status !== "cancelado" &&
          getEffectivePaymentVerificationStatus(order) === "pendiente_verificacion",
      ).length,
    [orders],
  );

  async function verifyOrderPayment(
    order: Order,
    nextStatus: PaymentVerificationStatus,
    reason?: string,
  ) {
    if (!user) return;
    setActionError("");
    setVerifyingOrderId(order.id);
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
      if (!response.ok) {
        throw new ApiResponseError(
          body.error ?? "No se pudo actualizar la verificación del pago.",
        );
      }
      const nextOrders = orders.map((item) =>
        item.id === order.id && body.order ? body.order : item,
      );
      setOrders(nextOrders);
      await cacheOrdersSnapshot(nextOrders);
    } catch (verifyError) {
      setActionError(
        verifyError instanceof Error
          ? verifyError.message
          : "No se pudo actualizar la verificación del pago.",
      );
    } finally {
      setVerifyingOrderId(null);
    }
  }

  async function assignOrderDriverHandler(order: Order, driver: AssignOrderDriverInput) {
    if (!user) return;
    setActionError("");
    setAssigningOrderId(order.id);
    try {
      const response = await fetch(`/api/pedidos/${encodeURIComponent(order.id)}/repartidor`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ driver }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };
      if (!response.ok || !body.order) {
        throw new ApiResponseError(body.error ?? "No se pudo asignar el domiciliario.");
      }
      const nextOrders = orders.map((item) => (item.id === order.id ? body.order! : item));
      setOrders(nextOrders);
      await cacheOrdersSnapshot(nextOrders);
    } catch (assignError) {
      setActionError(
        assignError instanceof Error
          ? assignError.message
          : "No se pudo asignar el domiciliario.",
      );
    } finally {
      setAssigningOrderId(null);
    }
  }

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
              {pendingPaymentCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-amber-950 font-semibold"
                >
                  {pendingPaymentCount} {pendingPaymentCount === 1 ? "pago" : "pagos"} por verificar
                </Badge>
              )}
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
            <PermissionGate permission="pedidos.update">
              <Button
                type="button"
                size="sm"
                data-testid="btn-open-quick-pos"
                onClick={() => {
                  setIsPosOpen(true);
                  if (posProducts.length === 0) {
                    void loadPosProducts();
                  }
                }}
                className="min-h-11 bg-[#E5196E] px-4 font-bold text-white shadow-sm hover:bg-[#c8145f]"
              >
                <PlusCircle className="h-4 w-4" /> POS Barra
              </Button>
            </PermissionGate>

            <Button variant="outline" size="sm" asChild className="min-h-11 border-slate-300 bg-white text-slate-900 hover:bg-slate-50">
              <Link href="/repartidor">
                <Bike className="h-4 w-4 text-cyan-700" /> Tablero Reparto
              </Link>
            </Button>

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
            verifyingOrderId={verifyingOrderId}
            assigningOrderId={assigningOrderId}
            availableDrivers={availableDrivers}
            onAdvanceOrder={updateStatus}
            onVerifyPayment={verifyOrderPayment}
            onAssignDriver={assignOrderDriverHandler}
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
                        {order.paymentMethod && (
                          <Badge
                            variant="outline"
                            className="border-emerald-300 bg-emerald-50 text-xs font-semibold text-emerald-900"
                          >
                            {formatPosPaymentSummary(order.paymentMethod, order.paymentBreakdown)}
                          </Badge>
                        )}
                        {isDeliveryOrder(order) && order.deliveryZoneName && (
                          <Badge
                            variant="outline"
                            className="border-indigo-300 bg-indigo-50 text-xs font-semibold text-indigo-900"
                          >
                            📍 {order.deliveryZoneName}
                          </Badge>
                        )}
                        {isDeliveryOrder(order) && order.assignedDriver && (
                          <Badge
                            variant="outline"
                            className="border-violet-300 bg-violet-50 text-xs font-semibold text-violet-900"
                          >
                            🛵 {order.assignedDriver.name}
                          </Badge>
                        )}
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
                      <PaymentProofVerificationControls
                        compact
                        orderId={order.id}
                        paymentVerificationStatus={order.paymentVerificationStatus}
                        paymentProof={order.paymentProof}
                        paymentVerification={order.paymentVerification}
                        digitalChannel={order.paymentBreakdown?.digitalMethod}
                        digitalReference={order.paymentBreakdown?.digitalReference}
                        isVerifying={verifyingOrderId === order.id}
                        onVerifyPayment={(_orderId, nextStatus, reason) =>
                          verifyOrderPayment(order, nextStatus, reason)
                        }
                      />
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
                      {isDeliveryOrder(order) && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/repartidor/${order.id}`}>
                            <Bike className="h-4 w-4" /> Reparto
                          </Link>
                        </Button>
                      )}
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

        <QuickBarPosModal
          isOpen={isPosOpen}
          onClose={() => setIsPosOpen(false)}
          products={posProducts}
          loadingProducts={loadingPosProducts}
          isOnline={isOnline}
          onSubmitPosOrder={handleSubmitPosOrder}
          onPrintOrder={(orderToPrint) => {
            setIsPosOpen(false);
            setPosPrintOrder(orderToPrint);
          }}
        />

        <OrderReceiptPrint
          order={posPrintOrder}
          isOpen={posPrintOrder !== null}
          onClose={() => setPosPrintOrder(null)}
        />
      </div>
    </AdminGuard>
  );
}
