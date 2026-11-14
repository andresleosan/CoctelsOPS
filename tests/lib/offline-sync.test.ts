import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OFFLINE_ORDERS_CACHE_STORE,
  OFFLINE_QUEUE_STORAGE_KEY,
  OFFLINE_QUEUE_STORE,
  applyOfflineMutationsToOrders,
  cacheOrdersSnapshot,
  clearOfflineDb,
  clearSyncedOfflineItems,
  enqueueOfflineOperation,
  getCachedOrdersSnapshot,
  getOfflineQueueItem,
  listOfflineQueue,
  openOfflineDb,
  removeOfflineQueueItem,
  updateOfflineQueueItem,
} from "@/lib/offline/db";
import {
  MAX_OFFLINE_SYNC_ATTEMPTS,
  OFFLINE_SW_MESSAGE_TYPE,
  OFFLINE_SYNC_TAG,
  enqueueAndSyncBarOrder,
  enqueueAndSyncOrderStatus,
  registerBackgroundSync,
  subscribeOfflineConnectivity,
  syncOfflineQueue,
} from "@/lib/offline/sync";
import type { CreateOrderInput, Order } from "@/types/orders";

function createMockIndexedDb(): {
  factory: IDBFactory;
  stores: Map<string, Map<string, unknown>>;
} {
  const stores = new Map<string, Map<string, unknown>>();
  let initialized = false;

  function makeRequest<T>(executor: () => T, onComplete?: () => void): IDBRequest<T> {
    const request = {
      result: undefined as unknown as T,
      error: null,
      onsuccess: null as ((this: IDBRequest<T>, ev: Event) => unknown) | null,
      onerror: null as ((this: IDBRequest<T>, ev: Event) => unknown) | null,
    } as unknown as IDBRequest<T>;

    queueMicrotask(() => {
      try {
        (request as unknown as { result: T }).result = executor();
        request.onsuccess?.call(request, new Event("success"));
        onComplete?.();
      } catch (err) {
        (request as unknown as { error: DOMException }).error = err as DOMException;
        request.onerror?.call(request, new Event("error"));
      }
    });

    return request;
  }

  const db = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore: (name: string) => {
      if (!stores.has(name)) {
        stores.set(name, new Map<string, unknown>());
      }
      return {
        createIndex: vi.fn(),
      };
    },
    close: vi.fn(),
    transaction: (storeName: string) => {
      const storeMap = stores.get(storeName) ?? new Map<string, unknown>();
      let completeScheduled = false;

      const tx = {
        oncomplete: null as ((this: IDBTransaction, ev: Event) => unknown) | null,
        onerror: null as ((this: IDBTransaction, ev: Event) => unknown) | null,
        onabort: null as ((this: IDBTransaction, ev: Event) => unknown) | null,
        error: null,
        objectStore: () => {
          const scheduleComplete = () => {
            if (completeScheduled) return;
            completeScheduled = true;
            queueMicrotask(() => {
              tx.oncomplete?.call(tx as unknown as IDBTransaction, new Event("complete"));
            });
          };

          return {
            getAll: () => makeRequest(() => Array.from(storeMap.values())),
            get: (key: string) => makeRequest(() => storeMap.get(key)),
            put: (value: { id: string }) =>
              makeRequest(() => {
                storeMap.set(value.id, structuredClone(value));
                return value.id;
              }, scheduleComplete),
            delete: (key: string) =>
              makeRequest(() => {
                storeMap.delete(key);
                return undefined;
              }, scheduleComplete),
            clear: () =>
              makeRequest(() => {
                storeMap.clear();
                return undefined;
              }, scheduleComplete),
          };
        },
      };

      return tx as unknown as IDBTransaction;
    },
  } as unknown as IDBDatabase;

  const factory = {
    open: () => {
      const openRequest = {
        result: db,
        error: null,
        onupgradeneeded: null as ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown) | null,
        onsuccess: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
        onerror: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
        onblocked: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
      } as unknown as IDBOpenDBRequest;

      queueMicrotask(() => {
        if (!initialized) {
          initialized = true;
          openRequest.onupgradeneeded?.call(
            openRequest,
            new Event("upgradeneeded") as IDBVersionChangeEvent,
          );
        }
        openRequest.onsuccess?.call(openRequest, new Event("success"));
      });

      return openRequest;
    },
  } as unknown as IDBFactory;

  return { factory, stores };
}

const sampleBarOrderInput: CreateOrderInput = {
  customerName: "Juliana Vélez",
  phone: "300 444 5566",
  address: "Mesa 7 - Consumo en local",
  serviceType: "mesa",
  tableNumber: "7",
  notes: "Bien escarchado",
  items: [
    {
      productId: "granizado-lulo",
      quantity: 2,
      customization: {
        size: "16 oz",
        flavors: ["Lulo", "Maracuyá"],
        addOns: ["Chamoy"],
      },
    },
  ],
};

const sampleExistingOrder: Order = {
  id: "ord-bar-101",
  clienteUid: "u-bar-1",
  customerName: "Mateo Restrepo",
  phone: "310 222 3344",
  address: "Barra principal",
  items: [
    {
      productId: "mojito-fresa",
      name: "Mojito de Fresa",
      quantity: 1,
      unitPrice: 18000,
      subtotal: 18000,
      customization: {
        size: "16 oz",
        flavors: ["Fresa"],
        addOns: [],
      },
    },
  ],
  subtotal: 18000,
  total: 18000,
  status: "pendiente",
  createdAt: "2026-11-13T21:00:00.000Z",
  updatedAt: "2026-11-13T21:00:00.000Z",
  audit: {
    createdByUid: "u-bar-1",
    createdAt: "2026-11-13T21:00:00.000Z",
  },
};

describe("offline resilience db & sync", () => {
  const originalIndexedDb = globalThis.indexedDB;
  const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(
    window.navigator,
    "serviceWorker",
  );

  function setOnlineState(online: boolean) {
    Object.defineProperty(window.navigator, "onLine", {
      value: online,
      configurable: true,
    });
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    Object.defineProperty(globalThis, "indexedDB", {
      value: undefined,
      configurable: true,
    });
    setOnlineState(true);
    await clearOfflineDb();
  });

  afterEach(async () => {
    await clearOfflineDb();
    Object.defineProperty(globalThis, "indexedDB", {
      value: originalIndexedDb,
      configurable: true,
    });
    if (originalOnLineDescriptor) {
      Object.defineProperty(window.navigator, "onLine", originalOnLineDescriptor);
    }
    if (originalServiceWorkerDescriptor) {
      Object.defineProperty(window.navigator, "serviceWorker", originalServiceWorkerDescriptor);
    } else {
      Reflect.deleteProperty(window.navigator, "serviceWorker");
    }
  });

  it("encola operaciones FIFO, deduplica por idempotencyKey y coalescea cambios de estado del mismo pedido", async () => {
    const firstOrder = await enqueueOfflineOperation({
      type: "create_order",
      idempotencyKey: "bar-key-1",
      payload: sampleBarOrderInput,
    });

    // Duplicate key updates existing item without duplicating
    const deduplicated = await enqueueOfflineOperation({
      type: "create_order",
      idempotencyKey: "bar-key-1",
      payload: { ...sampleBarOrderInput, notes: "Con doble chamoy" },
    });

    expect(deduplicated.id).toBe(firstOrder.id);
    expect((deduplicated.payload as CreateOrderInput).notes).toBe("Con doble chamoy");

    // Two consecutive status taps for the same order coalesce into the latest target status
    const firstTap = await enqueueOfflineOperation({
      type: "update_status",
      payload: { orderId: "ord-bar-101", status: "confirmado" },
    });
    const secondTap = await enqueueOfflineOperation({
      type: "update_status",
      payload: { orderId: "ord-bar-101", status: "preparando", reason: "Barra en marcha" },
    });

    expect(secondTap.id).toBe(firstTap.id);

    const queue = await listOfflineQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].type).toBe("create_order");
    expect(queue[1].type).toBe("update_status");
    expect(queue[1].payload).toEqual({
      orderId: "ord-bar-101",
      status: "preparando",
      reason: "Barra en marcha",
    });

    // Persists in localStorage fallback when indexedDB is unavailable
    const storedRaw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    expect(storedRaw).not.toBeNull();
    expect(JSON.parse(storedRaw ?? "[]")).toHaveLength(2);
  });

  it("persiste y lee cola y snapshot de pedidos directamente en IndexedDB cuando está disponible", async () => {
    const { factory, stores } = createMockIndexedDb();
    Object.defineProperty(globalThis, "indexedDB", {
      value: factory,
      configurable: true,
    });

    const db = await openOfflineDb();
    expect(db).not.toBeNull();
    expect(stores.has(OFFLINE_QUEUE_STORE)).toBe(true);
    expect(stores.has(OFFLINE_ORDERS_CACHE_STORE)).toBe(true);
    db?.close();

    const queued = await enqueueOfflineOperation({
      type: "update_status",
      idempotencyKey: "idb-key-1",
      payload: { orderId: "ord-bar-101", status: "confirmado" },
    });
    expect(stores.get(OFFLINE_QUEUE_STORE)?.size).toBe(1);

    const loadedItem = await getOfflineQueueItem(queued.id);
    expect(loadedItem?.idempotencyKey).toBe("idb-key-1");

    await cacheOrdersSnapshot([sampleExistingOrder]);
    const snapshot = await getCachedOrdersSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].id).toBe("ord-bar-101");

    await updateOfflineQueueItem(queued.id, { status: "synced" });
    const cleared = await clearSyncedOfflineItems();
    expect(cleared).toBe(1);
    expect(await listOfflineQueue()).toHaveLength(0);

    const removedMissing = await removeOfflineQueueItem("non-existent");
    expect(removedMissing).toBe(false);
  });

  it("proyecta cambios pendientes de cola offline sobre el snapshot de pedidos", async () => {
    const createOp = await enqueueOfflineOperation({
      type: "create_order",
      idempotencyKey: "bar-offline-77",
      payload: sampleBarOrderInput,
    });
    const statusOp = await enqueueOfflineOperation({
      type: "update_status",
      payload: { orderId: "ord-bar-101", status: "preparando" },
    });

    const projected = applyOfflineMutationsToOrders([sampleExistingOrder], [createOp, statusOp]);
    expect(projected).toHaveLength(2);
    expect(projected[0].id).toBe("offline-bar-offline-77");
    expect(projected[0].customerName).toBe("Juliana Vélez");
    expect(projected[0].status).toBe("pendiente");

    expect(projected[1].id).toBe("ord-bar-101");
    expect(projected[1].status).toBe("preparando");
    expect(projected[1].statusHistory?.at(-1)?.status).toBe("preparando");
  });

  it("sincroniza la cola en orden FIFO con Idempotency-Key y Bearer token y limpia ítems exitosos", async () => {
    await enqueueOfflineOperation({
      type: "create_order",
      idempotencyKey: "key-order-1",
      payload: sampleBarOrderInput,
    });
    await enqueueOfflineOperation({
      type: "update_status",
      idempotencyKey: "key-status-2",
      payload: { orderId: "ord-bar-101", status: "en_camino" },
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/pedidos") {
        return Promise.resolve(
          new Response(JSON.stringify({ order: { ...sampleExistingOrder, id: "ord-created-1" } }), {
            status: 201,
          }),
        );
      }
      if (url === "/api/pedidos/ord-bar-101") {
        return Promise.resolve(
          new Response(JSON.stringify({ order: { ...sampleExistingOrder, status: "en_camino" } }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    });

    const onItemSynced = vi.fn();
    const report = await syncOfflineQueue({
      getAuthToken: async () => "staff-jwt-token",
      fetchImpl: fetchMock as unknown as typeof fetch,
      onItemSynced,
    });

    expect(report.online).toBe(true);
    expect(report.total).toBe(2);
    expect(report.synced).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.remaining).toBe(0);
    expect(onItemSynced).toHaveBeenCalledTimes(2);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/pedidos",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "idempotency-key": "key-order-1",
          Authorization: "Bearer staff-jwt-token",
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/pedidos/ord-bar-101",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "idempotency-key": "key-status-2",
          Authorization: "Bearer staff-jwt-token",
        }),
        body: JSON.stringify({ status: "en_camino" }),
      }),
    );

    expect(await listOfflineQueue()).toHaveLength(0);
  });

  it("maneja fallos de red/500 para reintento y bloquea errores 422 permanentes sin bucle infinito", async () => {
    const netOp = await enqueueOfflineOperation({
      type: "update_status",
      idempotencyKey: "key-net-fail",
      payload: { orderId: "ord-1", status: "confirmado" },
    });
    const invalidOp = await enqueueOfflineOperation({
      type: "create_order",
      idempotencyKey: "key-422-fail",
      payload: sampleBarOrderInput,
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/pedidos/ord-1") {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      if (url === "/api/pedidos") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Producto agotado o inválido" }), {
            status: 422,
          }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 500 }));
    });

    const firstReport = await syncOfflineQueue({
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxAttempts: MAX_OFFLINE_SYNC_ATTEMPTS,
    });

    expect(firstReport.synced).toBe(0);
    expect(firstReport.failed).toBe(2);
    expect(firstReport.remaining).toBe(2);

    const netAfterFirst = await getOfflineQueueItem(netOp.id);
    const invalidAfterFirst = await getOfflineQueueItem(invalidOp.id);

    expect(netAfterFirst?.status).toBe("failed");
    expect(netAfterFirst?.attempts).toBe(1);
    expect(netAfterFirst?.lastError).toContain("Failed to fetch");

    // 422 permanent error exhausts attempts immediately
    expect(invalidAfterFirst?.status).toBe("failed");
    expect(invalidAfterFirst?.attempts).toBe(MAX_OFFLINE_SYNC_ATTEMPTS);
    expect(invalidAfterFirst?.lastError).toBe("Producto agotado o inválido");

    // Next sync run recovers ord-1 (200) and skips exhausted 422 item
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ order: { ...sampleExistingOrder, id: "ord-1" } }), {
          status: 200,
        }),
      ),
    );

    const secondReport = await syncOfflineQueue({
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxAttempts: MAX_OFFLINE_SYNC_ATTEMPTS,
    });

    expect(secondReport.synced).toBe(1);
    expect(secondReport.skipped).toBe(1);
    expect(secondReport.remaining).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 2 in first run + 1 in second run (422 was skipped)
  });

  it("reintenta HTTP 500, trata 409 como sincronizado por idempotencia y serializa llamadas concurrentes", async () => {
    const itemA = await enqueueOfflineOperation({
      type: "update_status",
      idempotencyKey: "key-500",
      payload: { orderId: "ord-500", status: "confirmado" },
    });
    await enqueueOfflineOperation({
      type: "create_order",
      idempotencyKey: "key-409",
      payload: sampleBarOrderInput,
    });

    let resolveFirstFetch: ((res: Response) => void) | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/pedidos/ord-500") {
        return new Promise<Response>((resolve) => {
          resolveFirstFetch = resolve;
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ error: "Duplicado" }), { status: 409 }));
    });

    // Launch two concurrent syncOfflineQueue calls; second must share the same in-flight promise
    const run1 = syncOfflineQueue({ fetchImpl: fetchMock as unknown as typeof fetch });
    const run2 = syncOfflineQueue({ fetchImpl: fetchMock as unknown as typeof fetch });

    await vi.waitFor(() => {
      expect(resolveFirstFetch).not.toBeNull();
    });
    resolveFirstFetch!(new Response(JSON.stringify({ error: "Temporal" }), { status: 500 }));

    const [report1, report2] = await Promise.all([run1, run2]);
    expect(report1).toBe(report2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(report1.failed).toBe(1);
    expect(report1.synced).toBe(1); // 409 treated as idempotently synced
    expect(report1.remaining).toBe(1);

    const remainingItem = await getOfflineQueueItem(itemA.id);
    expect(remainingItem?.attempts).toBe(1);
    expect(remainingItem?.status).toBe("failed");
  });

  it("registra Background Sync, encola en modo offline y suscribe eventos de conectividad y Service Worker", async () => {
    const syncRegister = vi.fn().mockResolvedValue(undefined);
    const swListeners = new Map<string, Set<(event: MessageEvent) => void>>();

    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue({ scope: "/" }),
        ready: Promise.resolve({
          sync: { register: syncRegister },
        }),
        addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          if (!swListeners.has(type)) swListeners.set(type, new Set());
          swListeners.get(type)?.add(listener);
        },
        removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          swListeners.get(type)?.delete(listener);
        },
      },
      configurable: true,
    });

    const registered = await registerBackgroundSync();
    expect(registered).toBe(true);
    expect(syncRegister).toHaveBeenCalledWith(OFFLINE_SYNC_TAG);

    // Enqueue while offline does not call fetch and queues background sync
    setOnlineState(false);
    const offlineFetch = vi.fn();
    const statusQueued = await enqueueAndSyncOrderStatus("ord-offline-1", "preparando", {
      fetchImpl: offlineFetch as unknown as typeof fetch,
    });
    const orderQueued = await enqueueAndSyncBarOrder(sampleBarOrderInput, {
      fetchImpl: offlineFetch as unknown as typeof fetch,
    });

    expect(statusQueued.synced).toBe(false);
    expect(orderQueued.synced).toBe(false);
    expect(offlineFetch).not.toHaveBeenCalled();

    const offlineSyncBlocked = await syncOfflineQueue({
      fetchImpl: offlineFetch as unknown as typeof fetch,
    });
    expect(offlineSyncBlocked.online).toBe(false);
    expect(offlineSyncBlocked.remaining).toBe(2);

    // Connectivity listener triggers callbacks on online, offline and SW sync message
    const onOnline = vi.fn();
    const onOffline = vi.fn();
    const onServiceWorkerSync = vi.fn();

    const unsubscribe = subscribeOfflineConnectivity({
      onOnline,
      onOffline,
      onServiceWorkerSync,
    });

    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));

    const messageListeners = swListeners.get("message") ?? new Set();
    for (const listener of messageListeners) {
      listener(new MessageEvent("message", { data: { type: OFFLINE_SW_MESSAGE_TYPE } }));
      listener(new MessageEvent("message", { data: { type: "OTHER_MESSAGE" } }));
    }

    expect(onOffline).toHaveBeenCalledTimes(1);
    expect(onOnline).toHaveBeenCalledTimes(1);
    expect(onServiceWorkerSync).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.dispatchEvent(new Event("online"));
    expect(onOnline).toHaveBeenCalledTimes(1);
  });
});
