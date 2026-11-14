import {
  enqueueOfflineOperation,
  getOfflineQueueItem,
  listOfflineQueue,
  removeOfflineQueueItem,
  updateOfflineQueueItem,
  type OfflineActionType,
  type OfflineCreateOrderPayload,
  type OfflineQueueItem,
  type OfflineUpdateStatusPayload,
} from "@/lib/offline/db";
import type { Order, OrderStatus } from "@/types/orders";

export const OFFLINE_SYNC_TAG = "coctels-ops-offline-sync";
export const OFFLINE_SW_MESSAGE_TYPE = "COCTELS_OPS_SYNC_OFFLINE_QUEUE";
export const MAX_OFFLINE_SYNC_ATTEMPTS = 5;

export type OfflineSyncOutcome = "synced" | "failed" | "skipped";

export type OfflineSyncItemResult = {
  id: string;
  idempotencyKey: string;
  type: OfflineActionType;
  outcome: OfflineSyncOutcome;
  statusCode?: number;
  error?: string;
  order?: Order;
};

export type OfflineSyncReport = {
  online: boolean;
  total: number;
  synced: number;
  failed: number;
  skipped: number;
  remaining: number;
  results: OfflineSyncItemResult[];
};

export type SyncOfflineOptions = {
  getAuthToken?: () => Promise<string | null | undefined>;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  onItemSynced?: (item: OfflineQueueItem, order?: Order) => void | Promise<void>;
  ignoreOnlineCheck?: boolean;
};

type SyncManagerLike = {
  register: (tag: string) => Promise<void>;
};

const PERMANENT_HTTP_FAILURE_STATUSES = new Set([400, 404, 422]);

let syncInFlight: Promise<OfflineSyncReport> | null = null;

function extractSyncManager(registration: ServiceWorkerRegistration): SyncManagerLike | null {
  if (!("sync" in registration)) return null;
  const candidate = (registration as { sync?: unknown }).sync;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "register" in candidate &&
    typeof (candidate as { register?: unknown }).register === "function"
  ) {
    return candidate as SyncManagerLike;
  }
  return null;
}

export function isClientOnline(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return true;
  }
  return navigator.onLine;
}

export async function registerBackgroundSync(tag = OFFLINE_SYNC_TAG): Promise<boolean> {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  try {
    const swContainer = navigator.serviceWorker;
    if (typeof swContainer.getRegistration === "function" && typeof swContainer.register === "function") {
      const existing = await swContainer.getRegistration("/");
      if (!existing) {
        await swContainer.register("/sw.js", { scope: "/" }).catch(() => null);
      }
    }

    const registration = await swContainer.ready;
    if (!registration) return false;

    const syncManager = extractSyncManager(registration);
    if (!syncManager) return false;

    await syncManager.register(tag);
    return true;
  } catch {
    return false;
  }
}

function buildRequestForItem(
  item: OfflineQueueItem,
  authToken?: string | null,
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": item.idempotencyKey,
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (item.type === "create_order") {
    const payload = item.payload as OfflineCreateOrderPayload;
    return {
      url: "/api/pedidos",
      init: {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
    };
  }

  const payload = item.payload as OfflineUpdateStatusPayload;
  return {
    url: `/api/pedidos/${encodeURIComponent(payload.orderId)}`,
    init: {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        status: payload.status,
        ...(payload.reason ? { reason: payload.reason } : {}),
      }),
    },
  };
}

async function runSyncOfflineQueue(options: SyncOfflineOptions): Promise<OfflineSyncReport> {
  const allQueue = await listOfflineQueue();
  const pendingItems = allQueue.filter((item) => item.status !== "synced");
  const online = options.ignoreOnlineCheck ? true : isClientOnline();

  if (!online) {
    return {
      online: false,
      total: pendingItems.length,
      synced: 0,
      failed: 0,
      skipped: 0,
      remaining: pendingItems.length,
      results: [],
    };
  }

  if (pendingItems.length === 0) {
    return {
      online: true,
      total: 0,
      synced: 0,
      failed: 0,
      skipped: 0,
      remaining: 0,
      results: [],
    };
  }

  const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_OFFLINE_SYNC_ATTEMPTS);
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchFn !== "function") {
    return {
      online: true,
      total: pendingItems.length,
      synced: 0,
      failed: 0,
      skipped: pendingItems.length,
      remaining: pendingItems.length,
      results: pendingItems.map((item) => ({
        id: item.id,
        idempotencyKey: item.idempotencyKey,
        type: item.type,
        outcome: "skipped",
        error: "Fetch no disponible en este entorno",
      })),
    };
  }

  const eligibleExist = pendingItems.some((item) => item.attempts < maxAttempts);
  const authToken = eligibleExist && options.getAuthToken ? await options.getAuthToken() : undefined;

  const results: OfflineSyncItemResult[] = [];
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of pendingItems) {
    if (item.attempts >= maxAttempts) {
      skipped += 1;
      results.push({
        id: item.id,
        idempotencyKey: item.idempotencyKey,
        type: item.type,
        outcome: "skipped",
        error: item.lastError ?? "Máximo de reintentos alcanzado",
      });
      continue;
    }

    await updateOfflineQueueItem(item.id, { status: "syncing" });

    try {
      const { url, init } = buildRequestForItem(item, authToken);
      const response = await fetchFn(url, init);
      const body = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };

      if (response.ok || response.status === 409) {
        await removeOfflineQueueItem(item.id);
        if (options.onItemSynced) {
          await options.onItemSynced(item, body.order);
        }
        synced += 1;
        results.push({
          id: item.id,
          idempotencyKey: item.idempotencyKey,
          type: item.type,
          outcome: "synced",
          statusCode: response.status,
          order: body.order,
        });
        continue;
      }

      const errorMessage = body.error ?? `Error HTTP ${response.status} al sincronizar`;
      const isPermanent = PERMANENT_HTTP_FAILURE_STATUSES.has(response.status);
      const nextAttempts = isPermanent ? maxAttempts : item.attempts + 1;

      await updateOfflineQueueItem(item.id, {
        status: "failed",
        attempts: nextAttempts,
        lastError: errorMessage,
      });

      failed += 1;
      results.push({
        id: item.id,
        idempotencyKey: item.idempotencyKey,
        type: item.type,
        outcome: "failed",
        statusCode: response.status,
        error: errorMessage,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error de red al sincronizar operación offline";
      await updateOfflineQueueItem(item.id, {
        status: "failed",
        attempts: item.attempts + 1,
        lastError: errorMessage,
      });
      failed += 1;
      results.push({
        id: item.id,
        idempotencyKey: item.idempotencyKey,
        type: item.type,
        outcome: "failed",
        error: errorMessage,
      });
    }
  }

  const remainingItems = (await listOfflineQueue()).filter((item) => item.status !== "synced");

  return {
    online: true,
    total: pendingItems.length,
    synced,
    failed,
    skipped,
    remaining: remainingItems.length,
    results,
  };
}

export async function syncOfflineQueue(
  options: SyncOfflineOptions = {},
): Promise<OfflineSyncReport> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = runSyncOfflineQueue(options).finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export async function enqueueAndSyncOrderStatus(
  orderId: string,
  status: OrderStatus,
  options: SyncOfflineOptions & { reason?: string; idempotencyKey?: string } = {},
): Promise<{ item: OfflineQueueItem; synced: boolean; syncReport?: OfflineSyncReport }> {
  const item = await enqueueOfflineOperation({
    type: "update_status",
    idempotencyKey: options.idempotencyKey,
    payload: {
      orderId,
      status,
      ...(options.reason ? { reason: options.reason } : {}),
    },
  });

  const online = options.ignoreOnlineCheck ? true : isClientOnline();
  if (!online) {
    await registerBackgroundSync();
    return { item, synced: false };
  }

  const syncReport = await syncOfflineQueue(options);
  const stillQueued = await getOfflineQueueItem(item.id);
  if (stillQueued) {
    await registerBackgroundSync();
  }

  return {
    item,
    synced: stillQueued === null,
    syncReport,
  };
}

export async function enqueueAndSyncBarOrder(
  payload: OfflineCreateOrderPayload,
  options: SyncOfflineOptions & { idempotencyKey?: string } = {},
): Promise<{ item: OfflineQueueItem; synced: boolean; syncReport?: OfflineSyncReport }> {
  const item = await enqueueOfflineOperation({
    type: "create_order",
    idempotencyKey: options.idempotencyKey,
    payload,
  });

  const online = options.ignoreOnlineCheck ? true : isClientOnline();
  if (!online) {
    await registerBackgroundSync();
    return { item, synced: false };
  }

  const syncReport = await syncOfflineQueue(options);
  const stillQueued = await getOfflineQueueItem(item.id);
  if (stillQueued) {
    await registerBackgroundSync();
  }

  return {
    item,
    synced: stillQueued === null,
    syncReport,
  };
}

export function subscribeOfflineConnectivity(callbacks: {
  onOnline?: () => void;
  onOffline?: () => void;
  onServiceWorkerSync?: () => void;
}): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleOnline = () => callbacks.onOnline?.();
  const handleOffline = () => callbacks.onOffline?.();
  const handleSwMessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      (data as { type?: unknown }).type === OFFLINE_SW_MESSAGE_TYPE
    ) {
      callbacks.onServiceWorkerSync?.();
    }
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  const swContainer =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker
      : undefined;
  swContainer?.addEventListener?.("message", handleSwMessage);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    swContainer?.removeEventListener?.("message", handleSwMessage);
  };
}
