import { getTableLookupKey } from "@/lib/tabs/calculator";
import type { BarTab } from "@/types/tabs";

export type TableMapState = "libre" | "ocupada" | "pidiendo_cuenta";
export type TableMapZone = "salon" | "barra_vip" | "otras";

export type TableMapPreset = {
  tableNumber: string;
  zone: Exclude<TableMapZone, "otras">;
  seatsHint?: number;
};

export type TableMapSlot = {
  key: string;
  tableNumber: string;
  zone: TableMapZone;
  state: TableMapState;
  tab: BarTab | null;
  seatsHint?: number;
  isCustom: boolean;
};

export type TableMapSummary = {
  total: number;
  free: number;
  occupied: number;
  requestingBill: number;
  openAmountCop: number;
};

export const DEFAULT_TABLE_MAP_PRESETS: readonly TableMapPreset[] = [
  { tableNumber: "Mesa 1", zone: "salon", seatsHint: 4 },
  { tableNumber: "Mesa 2", zone: "salon", seatsHint: 4 },
  { tableNumber: "Mesa 3", zone: "salon", seatsHint: 4 },
  { tableNumber: "Mesa 4", zone: "salon", seatsHint: 4 },
  { tableNumber: "Mesa 5", zone: "salon", seatsHint: 6 },
  { tableNumber: "Mesa 6", zone: "salon", seatsHint: 6 },
  { tableNumber: "Mesa 7", zone: "salon", seatsHint: 4 },
  { tableNumber: "Mesa 8", zone: "salon", seatsHint: 4 },
  { tableNumber: "Barra 1", zone: "barra_vip", seatsHint: 2 },
  { tableNumber: "Barra 2", zone: "barra_vip", seatsHint: 2 },
  { tableNumber: "Barra 3", zone: "barra_vip", seatsHint: 2 },
  { tableNumber: "VIP 1", zone: "barra_vip", seatsHint: 8 },
  { tableNumber: "VIP 2", zone: "barra_vip", seatsHint: 8 },
] as const;

export function resolveTableMapState(tab: BarTab | null): TableMapState {
  if (!tab || tab.status !== "abierta") return "libre";
  if (tab.billRequest) return "pidiendo_cuenta";
  return "ocupada";
}

export function buildTableMapSlots(
  tabs: BarTab[],
  presets: readonly TableMapPreset[] = DEFAULT_TABLE_MAP_PRESETS,
): TableMapSlot[] {
  const openTabsByLookupKey = new Map<string, BarTab>();
  for (const tab of tabs) {
    if (tab.status !== "abierta") continue;
    const key = getTableLookupKey(tab.tableNumber);
    if (key && !openTabsByLookupKey.has(key)) {
      openTabsByLookupKey.set(key, tab);
    }
  }

  const matchedKeys = new Set<string>();
  const slots: TableMapSlot[] = [];

  for (const preset of presets) {
    const key = getTableLookupKey(preset.tableNumber);
    const matchedTab = openTabsByLookupKey.get(key) ?? null;
    if (matchedTab) {
      matchedKeys.add(key);
    }

    slots.push({
      key,
      tableNumber: matchedTab?.tableNumber ?? preset.tableNumber,
      zone: preset.zone,
      state: resolveTableMapState(matchedTab),
      tab: matchedTab,
      seatsHint: preset.seatsHint,
      isCustom: false,
    });
  }

  for (const [key, tab] of openTabsByLookupKey.entries()) {
    if (matchedKeys.has(key)) continue;
    slots.push({
      key,
      tableNumber: tab.tableNumber,
      zone: "otras",
      state: resolveTableMapState(tab),
      tab,
      isCustom: true,
    });
  }

  return slots;
}

export function summarizeTableMap(slots: TableMapSlot[]): TableMapSummary {
  let free = 0;
  let occupied = 0;
  let requestingBill = 0;
  let openAmountCop = 0;

  for (const slot of slots) {
    if (slot.state === "libre") {
      free += 1;
    } else if (slot.state === "pidiendo_cuenta") {
      requestingBill += 1;
      openAmountCop += slot.tab?.total ?? 0;
    } else {
      occupied += 1;
      openAmountCop += slot.tab?.total ?? 0;
    }
  }

  return {
    total: slots.length,
    free,
    occupied,
    requestingBill,
    openAmountCop,
  };
}

export function filterTableMapSlots(
  slots: TableMapSlot[],
  filter: "all" | TableMapState,
): TableMapSlot[] {
  if (filter === "all") return slots;
  return slots.filter((slot) => slot.state === filter);
}
