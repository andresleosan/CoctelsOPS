import type { DeliveryZoneConfig, StoreConfiguration } from "@/types/operations";
import type { Order, ServiceType } from "@/types/orders";

export type DeliveryQuote = {
  feeCop: number;
  estimatedMinutes: number;
  isFreeByThreshold: boolean;
  freeDeliveryRemainingCop: number;
  zoneId?: string;
  zoneName?: string;
};

export type DriverQueueStatusFilter = "activos" | "listos" | "en_camino" | "entregados";
export type DriverQueueAssigneeFilter = "todos" | "mios" | "sin_asignar";

export type DriverQueueFilterOptions = {
  statusFilter?: DriverQueueStatusFilter;
  assigneeFilter?: DriverQueueAssigneeFilter;
  currentUid?: string;
  currentName?: string;
  zoneFilter?: string;
};

export type DriverQueueSummary = {
  totalActive: number;
  readyForPickup: number;
  inTransit: number;
  deliveredCount: number;
  unassignedCount: number;
  pendingCollectionCop: number;
};

export function slugifyDeliveryZoneId(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "zona";
}

function normalizeZoneConfig(
  raw: Partial<DeliveryZoneConfig>,
  fallbackEstimatedMinutes: number,
): DeliveryZoneConfig | null {
  const cleanName = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!cleanName) return null;
  const cleanId =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : slugifyDeliveryZoneId(cleanName);
  const feeCop =
    typeof raw.feeCop === "number" && Number.isFinite(raw.feeCop)
      ? Math.max(0, Math.round(raw.feeCop))
      : 0;
  const estimatedMinutes =
    typeof raw.estimatedMinutes === "number" && Number.isFinite(raw.estimatedMinutes)
      ? Math.max(5, Math.min(240, Math.round(raw.estimatedMinutes)))
      : Math.max(5, Math.min(240, Math.round(fallbackEstimatedMinutes || 45)));
  const freeDeliveryMinCop =
    typeof raw.freeDeliveryMinCop === "number" &&
    Number.isFinite(raw.freeDeliveryMinCop) &&
    raw.freeDeliveryMinCop > 0
      ? Math.round(raw.freeDeliveryMinCop)
      : undefined;

  return {
    id: cleanId,
    name: cleanName,
    feeCop,
    estimatedMinutes,
    ...(freeDeliveryMinCop ? { freeDeliveryMinCop } : {}),
    active: raw.active !== false,
  };
}

export function resolveDeliveryZones(
  configuration:
    | Pick<StoreConfiguration, "deliveryZones" | "deliveryZoneRates" | "estimatedDeliveryMinutes">
    | null
    | undefined,
  options: { includeInactive?: boolean } = {},
): DeliveryZoneConfig[] {
  if (!configuration) return [];
  const fallbackMinutes = Math.max(5, Math.round(configuration.estimatedDeliveryMinutes || 45));

  if (Array.isArray(configuration.deliveryZoneRates) && configuration.deliveryZoneRates.length > 0) {
    const normalized = configuration.deliveryZoneRates
      .map((zone) => normalizeZoneConfig(zone, fallbackMinutes))
      .filter((zone): zone is DeliveryZoneConfig => zone !== null);

    return options.includeInactive ? normalized : normalized.filter((zone) => zone.active);
  }

  return (configuration.deliveryZones ?? [])
    .map((zoneName): DeliveryZoneConfig | null => {
      const cleanName = zoneName.trim();
      if (!cleanName) return null;
      return {
        id: slugifyDeliveryZoneId(cleanName),
        name: cleanName,
        feeCop: 0,
        estimatedMinutes: fallbackMinutes,
        active: true,
      };
    })
    .filter((zone): zone is DeliveryZoneConfig => zone !== null);
}

export function hasConfiguredDynamicZones(
  configuration:
    | Pick<StoreConfiguration, "deliveryZoneRates">
    | null
    | undefined,
): boolean {
  return Boolean(
    configuration?.deliveryZoneRates?.some((zone) => zone.active !== false && zone.name.trim().length > 0),
  );
}

export function syncLegacyDeliveryZones(rates: DeliveryZoneConfig[]): string[] {
  const activeNames = rates
    .filter((zone) => zone.active !== false)
    .map((zone) => zone.name.trim())
    .filter(Boolean);

  if (activeNames.length > 0) return activeNames;
  return rates.map((zone) => zone.name.trim()).filter(Boolean);
}

export function findDeliveryZone(
  zones: DeliveryZoneConfig[],
  identifier: { id?: string; name?: string },
): DeliveryZoneConfig | null {
  const cleanId = identifier.id?.trim().toLowerCase();
  if (cleanId) {
    const byId = zones.find((zone) => zone.id.trim().toLowerCase() === cleanId);
    if (byId) return byId;
  }

  const cleanName = identifier.name?.trim().toLowerCase();
  if (cleanName) {
    const byName = zones.find((zone) => zone.name.trim().toLowerCase() === cleanName);
    if (byName) return byName;
  }

  return null;
}

export function calculateDeliveryQuote(params: {
  serviceType?: ServiceType;
  zone?: DeliveryZoneConfig | null;
  subtotalCop: number;
  fallbackEstimatedMinutes?: number;
}): DeliveryQuote {
  const serviceType = params.serviceType ?? "delivery";
  if (serviceType === "mesa" || serviceType === "pickup") {
    return {
      feeCop: 0,
      estimatedMinutes: 0,
      isFreeByThreshold: false,
      freeDeliveryRemainingCop: 0,
    };
  }

  const subtotal = Math.max(0, Math.round(params.subtotalCop));
  const fallbackMinutes = Math.max(5, Math.round(params.fallbackEstimatedMinutes ?? 45));
  const zone = params.zone;

  if (!zone) {
    return {
      feeCop: 0,
      estimatedMinutes: fallbackMinutes,
      isFreeByThreshold: false,
      freeDeliveryRemainingCop: 0,
    };
  }

  const baseFee = Math.max(0, Math.round(zone.feeCop));
  const threshold =
    typeof zone.freeDeliveryMinCop === "number" && zone.freeDeliveryMinCop > 0
      ? Math.round(zone.freeDeliveryMinCop)
      : 0;

  if (baseFee > 0 && threshold > 0 && subtotal >= threshold) {
    return {
      feeCop: 0,
      estimatedMinutes: zone.estimatedMinutes,
      isFreeByThreshold: true,
      freeDeliveryRemainingCop: 0,
      zoneId: zone.id,
      zoneName: zone.name,
    };
  }

  return {
    feeCop: baseFee,
    estimatedMinutes: zone.estimatedMinutes,
    isFreeByThreshold: false,
    freeDeliveryRemainingCop:
      baseFee > 0 && threshold > 0 ? Math.max(0, threshold - subtotal) : 0,
    zoneId: zone.id,
    zoneName: zone.name,
  };
}

export function isDeliveryOrder(
  order: Pick<Order, "serviceType" | "tableNumber" | "address">,
): boolean {
  if (order.serviceType === "delivery") return true;
  if (order.serviceType === "mesa" || order.serviceType === "pickup") return false;
  if (order.tableNumber?.trim()) return false;

  const lowerAddress = order.address.trim().toLowerCase();
  if (
    lowerAddress.includes("mesa") ||
    lowerAddress.includes("barra") ||
    lowerAddress.includes("consumo en local")
  ) {
    return false;
  }

  return true;
}

function isAssignedToCurrentDriver(
  order: Order,
  currentUid?: string,
  currentName?: string,
): boolean {
  if (!order.assignedDriver) return false;
  if (currentUid && order.assignedDriver.uid && order.assignedDriver.uid === currentUid) {
    return true;
  }
  if (currentName) {
    return (
      order.assignedDriver.name.trim().toLowerCase() === currentName.trim().toLowerCase()
    );
  }
  return false;
}

export function filterDeliveryQueueOrders(
  orders: Order[],
  options: DriverQueueFilterOptions = {},
): Order[] {
  const {
    statusFilter = "activos",
    assigneeFilter = "todos",
    currentUid,
    currentName,
    zoneFilter,
  } = options;

  const cleanZone = zoneFilter?.trim().toLowerCase();

  const filtered = orders.filter((order) => {
    if (!isDeliveryOrder(order)) return false;

    if (statusFilter === "activos") {
      if (order.status === "entregado" || order.status === "cancelado") return false;
    } else if (statusFilter === "listos") {
      if (
        order.status !== "pendiente" &&
        order.status !== "confirmado" &&
        order.status !== "preparando"
      ) {
        return false;
      }
    } else if (statusFilter === "en_camino") {
      if (order.status !== "en_camino") return false;
    } else if (statusFilter === "entregados") {
      if (order.status !== "entregado") return false;
    }

    if (assigneeFilter === "sin_asignar" && order.assignedDriver) {
      return false;
    }
    if (
      assigneeFilter === "mios" &&
      !isAssignedToCurrentDriver(order, currentUid, currentName)
    ) {
      return false;
    }

    if (cleanZone && cleanZone !== "todas") {
      const orderZone = (order.deliveryZoneName ?? "").trim().toLowerCase();
      if (orderZone !== cleanZone) return false;
    }

    return true;
  });

  return filtered.sort((a, b) => {
    if (statusFilter === "entregados") {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function summarizeDriverQueue(orders: Order[]): DriverQueueSummary {
  const deliveryOrders = orders.filter((order) => isDeliveryOrder(order));
  let totalActive = 0;
  let readyForPickup = 0;
  let inTransit = 0;
  let deliveredCount = 0;
  let unassignedCount = 0;
  let pendingCollectionCop = 0;

  for (const order of deliveryOrders) {
    if (order.status === "cancelado") continue;
    if (order.status === "entregado") {
      deliveredCount += 1;
      continue;
    }

    totalActive += 1;
    if (order.status === "en_camino") {
      inTransit += 1;
    } else {
      readyForPickup += 1;
    }

    if (!order.assignedDriver) {
      unassignedCount += 1;
    }

    if (order.paymentVerificationStatus !== "verificado") {
      pendingCollectionCop += Math.max(0, Math.round(order.total));
    }
  }

  return {
    totalActive,
    readyForPickup,
    inTransit,
    deliveredCount,
    unassignedCount,
    pendingCollectionCop,
  };
}
