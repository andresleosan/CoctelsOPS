import type { CreateOrderInput, Order, OrderItem, OrderStatus } from "@/types/orders";

export const OFFLINE_DB_NAME = "coctels_ops_offline_db";
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_QUEUE_STORE = "offline_queue";
export const OFFLINE_ORDERS_CACHE_STORE = "orders_cache";
export const OFFLINE_QUEUE_STORAGE_KEY = "coctels_ops_offline_queue";
export const OFFLINE_ORDERS_CACHE_STORAGE_KEY = "coctels_ops_orders_cache";

export type OfflineActionType = "create_order" | "update_status";
export type OfflineSyncStatus = "pending" | "syncing" | "synced" | "failed";

export type OfflineCreateOrderPayload = CreateOrderInput;

export type OfflineUpdateStatusPayload = {
  orderId: string;
  status: OrderStatus;
  reason?: string;
};

export type OfflinePayload = OfflineCreateOrderPayload | OfflineUpdateStatusPayload;

export type OfflineQueueItem = {
  id: string;
  idempotencyKey: string;
  type: OfflineActionType;
  payload: OfflinePayload;
  status: OfflineSyncStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type EnqueueOfflineInput =
  | {
      type: "create_order";
      payload: OfflineCreateOrderPayload;
      idempotencyKey?: string;
    }
  | {
      type: "update_status";
      payload: OfflineUpdateStatusPayload;
      idempotencyKey?: string;
    };

type OrdersCacheRecord = {
  id: string;
  orders: Order[];
  updatedAt: string;
};

const ORDERS_SNAPSHOT_RECORD_ID = "latest_snapshot";

let monotonicCounter = 0;
let memoryQueueFallback: OfflineQueueItem[] = [];
let memoryOrdersCacheFallback: Order[] = [];

function createMonotonicSuffix(): string {
  monotonicCounter = (monotonicCounter + 1) % 10000;
  return String(monotonicCounter).padStart(4, "0");
}

function createOfflineItemId(): string {
  const timestamp = Date.now().toString(36).padStart(9, "0");
  const counter = createMonotonicSuffix();
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `oq-${timestamp}-${counter}-${randomPart}`;
}

function createOfflineIdempotencyKey(type: OfflineActionType): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${type}-${globalThis.crypto.randomUUID()}`;
  }
  return `${type}-${Date.now().toString(36)}-${createMonotonicSuffix()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneQueueItem(item: OfflineQueueItem): OfflineQueueItem {
  return {
    ...item,
    payload:
      item.type === "create_order"
        ? {
            ...(item.payload as OfflineCreateOrderPayload),
            items: (item.payload as OfflineCreateOrderPayload).items.map((line) => ({
              ...line,
              customization: {
                size: line.customization.size,
                flavors: [...line.customization.flavors],
                addOns: [...line.customization.addOns],
              },
            })),
          }
        : { ...(item.payload as OfflineUpdateStatusPayload) },
  };
}

function sortQueueFifo(items: OfflineQueueItem[]): OfflineQueueItem[] {
  return [...items].sort((a, b) => {
    const byCreated = a.createdAt.localeCompare(b.createdAt);
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}

function isUpdateStatusItem(
  item: OfflineQueueItem,
): item is OfflineQueueItem & { type: "update_status"; payload: OfflineUpdateStatusPayload } {
  return item.type === "update_status" && "orderId" in item.payload && "status" in item.payload;
}

function isCreateOrderItem(
  item: OfflineQueueItem,
): item is OfflineQueueItem & { type: "create_order"; payload: OfflineCreateOrderPayload } {
  return item.type === "create_order" && "items" in item.payload && "customerName" in item.payload;
}

function getStorageSafe(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readQueueFallback(): OfflineQueueItem[] {
  const storage = getStorageSafe();
  if (!storage) {
    return sortQueueFifo(memoryQueueFallback.map(cloneQueueItem));
  }
  try {
    const raw = storage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortQueueFifo(parsed as OfflineQueueItem[]);
  } catch {
    return sortQueueFifo(memoryQueueFallback.map(cloneQueueItem));
  }
}

function writeQueueFallback(items: OfflineQueueItem[]): void {
  const sorted = sortQueueFifo(items.map(cloneQueueItem));
  memoryQueueFallback = sorted;
  const storage = getStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // Keep in-memory fallback when localStorage quota is full or blocked.
  }
}

function readOrdersCacheFallback(): Order[] {
  const storage = getStorageSafe();
  if (!storage) {
    return [...memoryOrdersCacheFallback];
  }
  try {
    const raw = storage.getItem(OFFLINE_ORDERS_CACHE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [...memoryOrdersCacheFallback];
  }
}

function writeOrdersCacheFallback(orders: Order[]): void {
  const copy = orders.map((order) => ({ ...order }));
  memoryOrdersCacheFallback = copy;
  const storage = getStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(OFFLINE_ORDERS_CACHE_STORAGE_KEY, JSON.stringify(copy));
  } catch {
    // Keep in-memory fallback when localStorage is unavailable.
  }
}

function getIndexedDbFactory(): IDBFactory | null {
  if (typeof globalThis === "undefined" || !("indexedDB" in globalThis)) {
    return null;
  }
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

export async function openOfflineDb(): Promise<IDBDatabase | null> {
  const idb = getIndexedDbFactory();
  if (!idb) return null;

  return new Promise((resolve) => {
    try {
      const request = idb.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
          const queueStore = db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: "id" });
          queueStore.createIndex("by_idempotencyKey", "idempotencyKey", { unique: false });
          queueStore.createIndex("by_status", "status", { unique: false });
        }
        if (!db.objectStoreNames.contains(OFFLINE_ORDERS_CACHE_STORE)) {
          db.createObjectStore(OFFLINE_ORDERS_CACHE_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function runIdbRead<T>(
  db: IDBDatabase,
  storeName: string,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Error leyendo IndexedDB"));
    tx.onerror = () => reject(tx.error ?? new Error("Error de transacción en IndexedDB"));
  });
}

function runIdbReadAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);

    if (typeof store.getAll === "function") {
      const request = store.getAll() as IDBRequest<T[]>;
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error ?? new Error("Error leyendo store de IndexedDB"));
      return;
    }

    const items: T[] = [];
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        items.push(cursor.value as T);
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("Error iterando IndexedDB"));
  });
}

function runIdbWrite(
  db: IDBDatabase,
  storeName: string,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const fail = (err: unknown) => {
      if (!settled) {
        settled = true;
        reject(err instanceof Error ? err : new Error("Error escribiendo IndexedDB"));
      }
    };

    tx.oncomplete = finish;
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error);

    try {
      operation(store);
    } catch (error) {
      fail(error);
    }
  });
}

async function readAllQueueItems(): Promise<OfflineQueueItem[]> {
  const db = await openOfflineDb();
  if (!db) {
    return readQueueFallback();
  }
  try {
    const items = await runIdbReadAll<OfflineQueueItem>(db, OFFLINE_QUEUE_STORE);
    return sortQueueFifo(items);
  } catch {
    return readQueueFallback();
  } finally {
    db.close?.();
  }
}

async function putQueueItem(item: OfflineQueueItem): Promise<void> {
  const cloned = cloneQueueItem(item);
  const db = await openOfflineDb();
  if (!db) {
    const current = readQueueFallback();
    const index = current.findIndex((existing) => existing.id === cloned.id);
    if (index >= 0) {
      current[index] = cloned;
    } else {
      current.push(cloned);
    }
    writeQueueFallback(current);
    return;
  }

  try {
    await runIdbWrite(db, OFFLINE_QUEUE_STORE, (store) => {
      store.put(cloned);
    });
  } finally {
    db.close?.();
  }
}

export async function listOfflineQueue(filter?: {
  status?: OfflineSyncStatus;
}): Promise<OfflineQueueItem[]> {
  const items = await readAllQueueItems();
  if (!filter?.status) {
    return items;
  }
  return items.filter((item) => item.status === filter.status);
}

export async function getOfflineQueueItem(id: string): Promise<OfflineQueueItem | null> {
  const db = await openOfflineDb();
  if (!db) {
    return readQueueFallback().find((item) => item.id === id) ?? null;
  }
  try {
    const item = await runIdbRead<OfflineQueueItem | undefined>(db, OFFLINE_QUEUE_STORE, (store) =>
      store.get(id),
    );
    return item ? cloneQueueItem(item) : null;
  } catch {
    return readQueueFallback().find((item) => item.id === id) ?? null;
  } finally {
    db.close?.();
  }
}

export async function enqueueOfflineOperation(
  input: EnqueueOfflineInput,
): Promise<OfflineQueueItem> {
  const now = new Date().toISOString();
  const explicitKey = input.idempotencyKey?.trim();
  const idempotencyKey = explicitKey || createOfflineIdempotencyKey(input.type);
  const existingQueue = await readAllQueueItems();

  // 1. Deduplicate by idempotencyKey when not yet synced.
  const sameKeyItem = existingQueue.find(
    (item) => item.idempotencyKey === idempotencyKey && item.status !== "synced",
  );
  if (sameKeyItem) {
    const updated: OfflineQueueItem = {
      ...sameKeyItem,
      payload: input.payload,
      status: "pending",
      lastError: undefined,
      updatedAt: now,
    };
    await putQueueItem(updated);
    return cloneQueueItem(updated);
  }

  // 2. Coalesce consecutive status updates for the same orderId while offline.
  if (input.type === "update_status") {
    const sameOrderStatusItem = existingQueue.find(
      (item) =>
        isUpdateStatusItem(item) &&
        (item.status === "pending" || item.status === "failed") &&
        item.payload.orderId === input.payload.orderId,
    );
    if (sameOrderStatusItem) {
      const coalesced: OfflineQueueItem = {
        ...sameOrderStatusItem,
        idempotencyKey: explicitKey || sameOrderStatusItem.idempotencyKey,
        payload: { ...input.payload },
        status: "pending",
        attempts: 0,
        lastError: undefined,
        updatedAt: now,
      };
      await putQueueItem(coalesced);
      return cloneQueueItem(coalesced);
    }
  }

  const created: OfflineQueueItem = {
    id: createOfflineItemId(),
    idempotencyKey,
    type: input.type,
    payload: input.payload,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  await putQueueItem(created);
  return cloneQueueItem(created);
}

export async function updateOfflineQueueItem(
  id: string,
  patch: Partial<Pick<OfflineQueueItem, "status" | "attempts" | "lastError" | "payload" | "updatedAt">>,
): Promise<OfflineQueueItem | null> {
  const existing = await getOfflineQueueItem(id);
  if (!existing) return null;

  const updated: OfflineQueueItem = {
    ...existing,
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };

  await putQueueItem(updated);
  return cloneQueueItem(updated);
}

export async function removeOfflineQueueItem(id: string): Promise<boolean> {
  const existing = await getOfflineQueueItem(id);
  if (!existing) return false;

  const db = await openOfflineDb();
  if (!db) {
    const next = readQueueFallback().filter((item) => item.id !== id);
    writeQueueFallback(next);
    return true;
  }

  try {
    await runIdbWrite(db, OFFLINE_QUEUE_STORE, (store) => {
      store.delete(id);
    });
    return true;
  } finally {
    db.close?.();
  }
}

export async function clearSyncedOfflineItems(): Promise<number> {
  const items = await readAllQueueItems();
  const synced = items.filter((item) => item.status === "synced");
  if (synced.length === 0) return 0;

  const db = await openOfflineDb();
  if (!db) {
    writeQueueFallback(items.filter((item) => item.status !== "synced"));
    return synced.length;
  }

  try {
    await runIdbWrite(db, OFFLINE_QUEUE_STORE, (store) => {
      for (const item of synced) {
        store.delete(item.id);
      }
    });
    return synced.length;
  } finally {
    db.close?.();
  }
}

export async function clearOfflineDb(): Promise<void> {
  memoryQueueFallback = [];
  memoryOrdersCacheFallback = [];

  const storage = getStorageSafe();
  if (storage) {
    try {
      storage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
      storage.removeItem(OFFLINE_ORDERS_CACHE_STORAGE_KEY);
    } catch {
      // Ignore storage errors on cleanup.
    }
  }

  const db = await openOfflineDb();
  if (!db) return;

  try {
    await runIdbWrite(db, OFFLINE_QUEUE_STORE, (store) => {
      store.clear();
    });
    await runIdbWrite(db, OFFLINE_ORDERS_CACHE_STORE, (store) => {
      store.clear();
    });
  } finally {
    db.close?.();
  }
}

export async function cacheOrdersSnapshot(orders: Order[]): Promise<void> {
  const snapshot = orders.map((order) => ({ ...order }));
  const db = await openOfflineDb();
  if (!db) {
    writeOrdersCacheFallback(snapshot);
    return;
  }

  try {
    const record: OrdersCacheRecord = {
      id: ORDERS_SNAPSHOT_RECORD_ID,
      orders: snapshot,
      updatedAt: new Date().toISOString(),
    };
    await runIdbWrite(db, OFFLINE_ORDERS_CACHE_STORE, (store) => {
      store.put(record);
    });
  } catch {
    writeOrdersCacheFallback(snapshot);
  } finally {
    db.close?.();
  }
}

export async function getCachedOrdersSnapshot(): Promise<Order[]> {
  const db = await openOfflineDb();
  if (!db) {
    return readOrdersCacheFallback();
  }

  try {
    const record = await runIdbRead<OrdersCacheRecord | undefined>(
      db,
      OFFLINE_ORDERS_CACHE_STORE,
      (store) => store.get(ORDERS_SNAPSHOT_RECORD_ID),
    );
    return Array.isArray(record?.orders) ? record.orders : [];
  } catch {
    return readOrdersCacheFallback();
  } finally {
    db.close?.();
  }
}

function buildProvisionalOrder(
  item: OfflineQueueItem & { type: "create_order"; payload: OfflineCreateOrderPayload },
): Order {
  const orderItems: OrderItem[] = item.payload.items.map((line) => ({
    productId: line.productId,
    name: line.productId,
    quantity: line.quantity,
    unitPrice: 0,
    subtotal: 0,
    customization: {
      size: line.customization.size,
      flavors: [...line.customization.flavors],
      addOns: [...line.customization.addOns],
    },
  }));

  return {
    id: `offline-${item.idempotencyKey}`,
    clienteUid: "offline-bar",
    customerName: item.payload.customerName,
    phone: item.payload.phone,
    address: item.payload.address,
    notes: item.payload.notes,
    serviceType: item.payload.serviceType,
    tableNumber: item.payload.tableNumber,
    items: orderItems,
    subtotal: 0,
    total: 0,
    status: "pendiente",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    audit: {
      createdByUid: "offline-bar",
      createdAt: item.createdAt,
    },
    statusHistory: [
      {
        status: "pendiente",
        at: item.createdAt,
        reason: "Registrado en modo offline",
      },
    ],
  };
}

export function applyOfflineMutationsToOrders(
  orders: Order[],
  queue: OfflineQueueItem[],
): Order[] {
  const activeQueue = sortQueueFifo(queue).filter((item) => item.status !== "synced");
  if (activeQueue.length === 0) {
    return orders.map((order) => ({ ...order }));
  }

  const projectedExisting = orders.map((order) => ({
    ...order,
    statusHistory: order.statusHistory ? [...order.statusHistory] : undefined,
  }));
  const provisionalOrders: Order[] = [];

  for (const item of activeQueue) {
    if (isCreateOrderItem(item)) {
      const provisionalId = `offline-${item.idempotencyKey}`;
      const alreadyExists =
        projectedExisting.some((order) => order.id === provisionalId) ||
        provisionalOrders.some((order) => order.id === provisionalId);
      if (!alreadyExists) {
        provisionalOrders.push(buildProvisionalOrder(item));
      }
      continue;
    }

    if (isUpdateStatusItem(item)) {
      const applyUpdate = (target: Order) => ({
        ...target,
        status: item.payload.status,
        updatedAt: item.updatedAt,
        statusHistory: [
          ...(target.statusHistory ?? []),
          {
            status: item.payload.status,
            at: item.updatedAt,
            reason: item.payload.reason ?? "Pendiente de sincronizar (offline)",
          },
        ],
      });

      const existingIdx = projectedExisting.findIndex((order) => order.id === item.payload.orderId);
      if (existingIdx >= 0) {
        projectedExisting[existingIdx] = applyUpdate(projectedExisting[existingIdx]);
        continue;
      }

      const provisionalIdx = provisionalOrders.findIndex(
        (order) => order.id === item.payload.orderId,
      );
      if (provisionalIdx >= 0) {
        provisionalOrders[provisionalIdx] = applyUpdate(provisionalOrders[provisionalIdx]);
      }
    }
  }

  return [...provisionalOrders.reverse(), ...projectedExisting];
}
