"use client";

import {
  Clock,
  Layers,
  Plus,
  Receipt,
  Split,
  Trash2,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCop, POS_PAYMENT_METHOD_LABELS } from "@/lib/orders/pos-calculator";
import { calculateEqualSplitShares } from "@/lib/tabs/calculator";
import {
  buildTableMapSlots,
  filterTableMapSlots,
  summarizeTableMap,
  type TableMapSlot,
  type TableMapState,
  type TableMapZone,
} from "@/lib/tabs/table-map";
import type { BarTab } from "@/types/tabs";

export type TableMapBoardProps = {
  tabs: BarTab[];
  selectedTabId?: string | null;
  submitting?: boolean;
  onOpenTable: (tableNumber: string) => void | Promise<void>;
  onSelectTab: (tab: BarTab) => void;
  onAddRound: (tab: BarTab) => void;
  onCloseTab: (tab: BarTab) => void;
  onCancelEmptyTab: (tab: BarTab) => void | Promise<void>;
};

const ZONE_META: Record<TableMapZone, { title: string; subtitle: string }> = {
  salon: {
    title: "Salón Principal",
    subtitle: "Mesas generales y servicio QR",
  },
  barra_vip: {
    title: "Barra y Zona VIP",
    subtitle: "Puestos en barra y salas reservadas",
  },
  otras: {
    title: "Otras Mesas Activas",
    subtitle: "Identificadores personalizados abiertos en turno",
  },
};

const STATE_BADGE_META: Record<
  TableMapState,
  { label: string; badgeClass: string; cardClass: string }
> = {
  libre: {
    label: "Libre",
    badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-900",
    cardClass:
      "border-dashed border-emerald-300 bg-emerald-50/60 hover:border-emerald-400 hover:bg-emerald-50",
  },
  ocupada: {
    label: "Ocupada",
    badgeClass: "border-cyan-300 bg-cyan-100 text-cyan-950",
    cardClass: "border-cyan-300 bg-cyan-50/50 hover:border-cyan-400",
  },
  pidiendo_cuenta: {
    label: "Pidiendo cuenta",
    badgeClass: "border-pink-400 bg-pink-100 text-pink-950 font-bold",
    cardClass:
      "border-2 border-pink-500 bg-pink-50 shadow-sm ring-1 ring-pink-200",
  },
};

function formatTimeShort(iso?: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

export function TableMapBoard({
  tabs,
  selectedTabId = null,
  submitting = false,
  onOpenTable,
  onSelectTab,
  onAddRound,
  onCloseTab,
  onCancelEmptyTab,
}: TableMapBoardProps) {
  const [stateFilter, setStateFilter] = useState<"all" | TableMapState>("all");

  const slots = useMemo(() => buildTableMapSlots(tabs), [tabs]);
  const summary = useMemo(() => summarizeTableMap(slots), [slots]);
  const filteredSlots = useMemo(
    () => filterTableMapSlots(slots, stateFilter),
    [slots, stateFilter],
  );

  const selectedTab = useMemo(() => {
    if (!selectedTabId) return null;
    return tabs.find((tab) => tab.id === selectedTabId && tab.status === "abierta") ?? null;
  }, [selectedTabId, tabs]);

  const zonesOrder: TableMapZone[] = ["salon", "barra_vip", "otras"];
  const slotsByZone = useMemo(() => {
    const grouped: Record<TableMapZone, TableMapSlot[]> = {
      salon: [],
      barra_vip: [],
      otras: [],
    };
    for (const slot of filteredSlots) {
      grouped[slot.zone].push(slot);
    }
    return grouped;
  }, [filteredSlots]);

  return (
    <div className="space-y-5" data-testid="table-map-board">
      {/* Barra de Filtros y Leyenda */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrar mesas por estado"
          >
            <Button
              type="button"
              size="sm"
              variant={stateFilter === "all" ? "default" : "outline"}
              onClick={() => setStateFilter("all")}
              className="min-h-11"
            >
              Todas ({summary.total})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={stateFilter === "libre" ? "default" : "outline"}
              onClick={() => setStateFilter("libre")}
              className="min-h-11 border-emerald-300 text-emerald-900"
            >
              Libres ({summary.free})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={stateFilter === "ocupada" ? "default" : "outline"}
              onClick={() => setStateFilter("ocupada")}
              className="min-h-11 border-cyan-300 text-cyan-950"
            >
              Ocupadas ({summary.occupied})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={stateFilter === "pidiendo_cuenta" ? "default" : "outline"}
              onClick={() => setStateFilter("pidiendo_cuenta")}
              className="min-h-11 border-pink-300 text-pink-900"
            >
              Pidiendo cuenta ({summary.requestingBill})
            </Button>
          </div>

          <div
            className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-700"
            aria-label="Leyenda de estados de mesa"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border border-emerald-500 bg-emerald-200" />
              Libre
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border border-cyan-600 bg-cyan-300" />
              Ocupada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border border-pink-600 bg-pink-400" />
              Pidiendo cuenta
            </span>
          </div>
        </CardContent>
      </Card>

      {filteredSlots.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="py-10 text-center text-sm text-slate-600">
            No hay mesas en el estado seleccionado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {zonesOrder.map((zone) => {
            const zoneSlots = slotsByZone[zone];
            if (zoneSlots.length === 0) return null;
            const meta = ZONE_META[zone];

            return (
              <section key={zone} aria-label={meta.title} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{meta.title}</h2>
                    <p className="text-xs text-slate-600">{meta.subtitle}</p>
                  </div>
                  <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                    {zoneSlots.length} {zoneSlots.length === 1 ? "espacio" : "espacios"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {zoneSlots.map((slot) => {
                    const styleMeta = STATE_BADGE_META[slot.state];
                    const tab = slot.tab;
                    const isSelected = Boolean(tab && selectedTabId === tab.id);

                    return (
                      <Card
                        key={slot.key}
                        data-testid={`table-map-slot-${slot.key}`}
                        className={`flex flex-col justify-between transition-all ${styleMeta.cardClass} ${
                          isSelected ? "ring-2 ring-slate-900" : ""
                        }`}
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            {tab ? (
                              <button
                                type="button"
                                onClick={() => onSelectTab(tab)}
                                className="flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 rounded-md"
                              >
                                <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-950">
                                  <UtensilsCrossed className="h-4 w-4 text-slate-700" aria-hidden="true" />
                                  {slot.tableNumber}
                                </CardTitle>
                                <p className="mt-0.5 text-xs text-slate-700">
                                  {tab.customerName ? tab.customerName : "Cliente en local"}
                                </p>
                              </button>
                            ) : (
                              <div>
                                <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-950">
                                  <UtensilsCrossed className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                                  {slot.tableNumber}
                                </CardTitle>
                                <p className="mt-0.5 text-xs text-slate-600">
                                  {slot.seatsHint ? `Capacidad sugerida: ${slot.seatsHint} p.` : "Disponible"}
                                </p>
                              </div>
                            )}

                            <Badge
                              variant="outline"
                              className={`${styleMeta.badgeClass} ${
                                slot.state === "pidiendo_cuenta"
                                  ? "animate-pulse motion-reduce:animate-none"
                                  : ""
                              }`}
                            >
                              {styleMeta.label}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3 p-4 pt-2">
                          {tab ? (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                                <div className="flex items-center gap-2.5">
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                                    {tab.guestCount}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                                    {tab.rounds.length} {tab.rounds.length === 1 ? "ronda" : "rondas"}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                    {formatElapsed(tab.openedAt)}
                                  </span>
                                </div>
                                <span className="text-base font-extrabold tabular-nums text-slate-950">
                                  {formatCop(tab.total)}
                                </span>
                              </div>

                              {tab.billRequest ? (
                                <div className="rounded-lg border border-pink-300 bg-white/90 px-2.5 py-2 text-xs text-pink-950">
                                  <p className="font-bold flex items-center gap-1">
                                    <Receipt className="h-3.5 w-3.5 text-pink-700" aria-hidden="true" />
                                    {tab.billRequest.splitMode === "equal"
                                      ? `Dividir entre ${tab.billRequest.guestCount} (${formatCop(
                                          tab.billRequest.perPersonAmount ??
                                            calculateEqualSplitShares(tab.total, tab.billRequest.guestCount)[0] ??
                                            0,
                                        )} c/u)`
                                      : `Pago único (${formatCop(tab.total)})`}
                                  </p>
                                  {tab.billRequest.preferredMethod ? (
                                    <p className="mt-0.5 text-[11px] text-pink-900">
                                      Medio: {POS_PAYMENT_METHOD_LABELS[tab.billRequest.preferredMethod]}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}

                              <PermissionGate permission="pedidos.update">
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={submitting}
                                    onClick={() => onAddRound(tab)}
                                    className="min-h-11 flex-1 bg-cyan-700 text-white hover:bg-cyan-800"
                                  >
                                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                                    + Ronda
                                  </Button>
                                  {tab.rounds.length > 0 ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={submitting}
                                      onClick={() => onCloseTab(tab)}
                                      className={`min-h-11 flex-1 text-white ${
                                        slot.state === "pidiendo_cuenta"
                                          ? "bg-pink-600 hover:bg-pink-700"
                                          : "bg-slate-900 hover:bg-slate-800"
                                      }`}
                                    >
                                      <Split className="mr-1 h-4 w-4" aria-hidden="true" />
                                      Cobrar
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={submitting}
                                      onClick={() => void onCancelEmptyTab(tab)}
                                      className="min-h-11 border-rose-300 bg-white text-rose-800 hover:bg-rose-50"
                                    >
                                      <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                                      Liberar
                                    </Button>
                                  )}
                                </div>
                              </PermissionGate>
                            </>
                          ) : (
                            <PermissionGate permission="pedidos.update">
                              <Button
                                type="button"
                                variant="outline"
                                disabled={submitting}
                                onClick={() => void onOpenTable(slot.tableNumber)}
                                className="min-h-11 w-full border-emerald-400 bg-white font-semibold text-emerald-900 hover:bg-emerald-100"
                              >
                                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                Abrir {slot.tableNumber}
                              </Button>
                            </PermissionGate>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Panel de detalle rápido de mesa seleccionada */}
      {selectedTab ? (
        <Card
          data-testid="table-map-selected-detail"
          className="border-slate-300 bg-white shadow-sm"
        >
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-bold text-slate-950">
                  Detalle en vivo — {selectedTab.tableNumber}
                </CardTitle>
                <p className="text-xs text-slate-600">
                  {selectedTab.customerName ? `${selectedTab.customerName} · ` : ""}
                  Abierta {formatTimeShort(selectedTab.openedAt)} · {selectedTab.rounds.length} rondas
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tabular-nums text-slate-950">
                  {formatCop(selectedTab.total)}
                </span>
                <PermissionGate permission="pedidos.update">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onAddRound(selectedTab)}
                    className="min-h-11 bg-cyan-700 text-white hover:bg-cyan-800"
                  >
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    Agregar Ronda
                  </Button>
                </PermissionGate>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedTab.rounds.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Esta mesa aún no tiene rondas enviadas al KDS.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedTab.rounds.map((round) => (
                  <div
                    key={`${selectedTab.id}-detail-r-${round.roundNumber}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>
                        Ronda #{round.roundNumber} · {formatTimeShort(round.createdAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{formatCop(round.subtotal)}</span>
                        {round.orderId ? (
                          <Link
                            href={`/admin/pedidos/${round.orderId}`}
                            className="text-cyan-800 underline hover:text-cyan-950"
                          >
                            Ver KDS
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-slate-700">
                      {round.items.map((item, idx) => (
                        <li key={`${round.orderId}-det-${idx}`}>
                          {item.quantity}x {item.name} ({item.customization.size}) —{" "}
                          {formatCop(item.subtotal)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
