"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bike,
  Clock,
  ExternalLink,
  Flame,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  UserCheck,
} from "lucide-react";

import {
  buildDriverCallHref,
  buildDriverWhatsAppHref,
  buildGoogleMapsHref,
  buildWazeHref,
} from "@/components/delivery/DriverOrderView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  filterDeliveryQueueOrders,
  isDeliveryOrder,
  summarizeDriverQueue,
  type DriverQueueAssigneeFilter,
  type DriverQueueStatusFilter,
} from "@/lib/orders/delivery-zones";
import { getOrderSlaStatus, type SlaLevel } from "@/lib/orders/kds-sla";
import type { Order } from "@/types/orders";

export type DriverQueueBoardProps = {
  orders: Order[];
  currentUid?: string;
  currentName?: string;
  nowMs?: number;
  claimingOrderId?: string | null;
  startingRouteOrderId?: string | null;
  onClaimOrder?: (order: Order) => void | Promise<void>;
  onStartRoute?: (order: Order) => void | Promise<void>;
};

const SLA_STYLES: Record<SlaLevel, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  critical: "border-red-500/50 bg-red-500/20 text-red-200 font-bold",
  completed: "border-slate-600 bg-slate-800 text-slate-300",
};

const STATUS_TABS: ReadonlyArray<{ id: DriverQueueStatusFilter; label: string }> = [
  { id: "activos", label: "Activos" },
  { id: "listos", label: "Por salir" },
  { id: "en_camino", label: "En camino" },
  { id: "entregados", label: "Entregados" },
];

const ASSIGNEE_TABS: ReadonlyArray<{ id: DriverQueueAssigneeFilter; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "mios", label: "Mis entregas" },
  { id: "sin_asignar", label: "Sin asignar" },
];

export function DriverQueueBoard({
  orders,
  currentUid,
  currentName,
  nowMs = Date.now(),
  claimingOrderId = null,
  startingRouteOrderId = null,
  onClaimOrder,
  onStartRoute,
}: DriverQueueBoardProps) {
  const [statusFilter, setStatusFilter] = useState<DriverQueueStatusFilter>("activos");
  const [assigneeFilter, setAssigneeFilter] = useState<DriverQueueAssigneeFilter>("todos");
  const [zoneFilter, setZoneFilter] = useState<string>("todas");

  const deliveryOrders = useMemo(
    () => orders.filter((order) => isDeliveryOrder(order)),
    [orders],
  );

  const summary = useMemo(() => summarizeDriverQueue(deliveryOrders), [deliveryOrders]);

  const availableZoneNames = useMemo(() => {
    const unique = new Set<string>();
    for (const order of deliveryOrders) {
      const zone = order.deliveryZoneName?.trim();
      if (zone) unique.add(zone);
    }
    return [...unique].sort((a, b) => a.localeCompare(b, "es"));
  }, [deliveryOrders]);

  const filteredOrders = useMemo(
    () =>
      filterDeliveryQueueOrders(deliveryOrders, {
        statusFilter,
        assigneeFilter,
        currentUid,
        currentName,
        zoneFilter,
      }),
    [assigneeFilter, currentName, currentUid, deliveryOrders, statusFilter, zoneFilter],
  );

  return (
    <div className="space-y-5" data-testid="driver-queue-board">
      {/* KPIs de turno de reparto */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Por salir
          </p>
          <p data-testid="kpi-ready-pickup" className="mt-1 font-headline text-2xl font-black text-cyan-300">
            {summary.readyForPickup}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            En camino
          </p>
          <p data-testid="kpi-in-transit" className="mt-1 font-headline text-2xl font-black text-[#E5196E]">
            {summary.inTransit}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Por cobrar
          </p>
          <p data-testid="kpi-pending-collection" className="mt-1 font-headline text-xl font-black text-emerald-300">
            ${summary.pendingCollectionCop.toLocaleString("es-CO")}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Entregados
          </p>
          <p data-testid="kpi-delivered" className="mt-1 font-headline text-2xl font-black text-white">
            {summary.deliveredCount}
          </p>
        </div>
      </div>

      {/* Filtros 1-Tap */}
      <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-3.5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado de entrega">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`filter-status-${tab.id}`}
                aria-pressed={active}
                onClick={() => setStatusFilter(tab.id)}
                className={`min-h-11 rounded-xl border px-3.5 text-xs font-bold transition-all active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                  active
                    ? "border-[#E5196E] bg-[#E5196E] text-white shadow-[0_0_16px_rgba(229,25,110,0.35)]"
                    : "border-white/10 bg-black/40 text-slate-300 hover:border-white/25 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por asignación">
          {ASSIGNEE_TABS.map((tab) => {
            const active = assigneeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`filter-assignee-${tab.id}`}
                aria-pressed={active}
                onClick={() => setAssigneeFilter(tab.id)}
                className={`min-h-11 rounded-xl border px-3.5 text-xs font-bold transition-all active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                  active
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                    : "border-white/10 bg-black/40 text-slate-300 hover:border-white/25 hover:text-white"
                }`}
              >
                {tab.label}
                {tab.id === "sin_asignar" && summary.unassignedCount > 0
                  ? ` (${summary.unassignedCount})`
                  : ""}
              </button>
            );
          })}
        </div>

        {availableZoneNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por zona">
            <button
              type="button"
              aria-pressed={zoneFilter === "todas"}
              onClick={() => setZoneFilter("todas")}
              className={`min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors ${
                zoneFilter === "todas"
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                  : "border-white/10 bg-black/30 text-slate-300 hover:text-white"
              }`}
            >
              Todas las zonas
            </button>
            {availableZoneNames.map((zoneName) => {
              const active = zoneFilter.toLowerCase() === zoneName.toLowerCase();
              return (
                <button
                  key={zoneName}
                  type="button"
                  data-testid={`filter-zone-${zoneName}`}
                  aria-pressed={active}
                  onClick={() => setZoneFilter(zoneName)}
                  className={`min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors ${
                    active
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                      : "border-white/10 bg-black/30 text-slate-300 hover:text-white"
                  }`}
                >
                  📍 {zoneName}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista de Pedidos de Domicilio */}
      {filteredOrders.length === 0 ? (
        <Card className="border-dashed border-white/15 bg-slate-900/70 text-slate-300">
          <CardContent className="p-8 text-center text-sm">
            No hay domicilios en esta vista ahora mismo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredOrders.map((order) => {
            const sla = getOrderSlaStatus(order.createdAt, order.status, nowMs);
            const totalCups = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const isClaiming = claimingOrderId === order.id;
            const isStarting = startingRouteOrderId === order.id;
            const isActive = order.status !== "entregado" && order.status !== "cancelado";

            return (
              <Card
                key={order.id}
                data-testid={`driver-queue-card-${order.id}`}
                className="border-white/10 bg-slate-900/95 text-slate-50 shadow-lg"
              >
                <CardHeader className="space-y-2.5 p-4 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className="border border-cyan-400/40 bg-cyan-500/15 text-[11px] font-bold uppercase text-cyan-200">
                        {order.status.replace("_", " ")}
                      </Badge>
                      {order.deliveryZoneName && (
                        <Badge className="border border-emerald-400/40 bg-emerald-500/15 text-[11px] font-bold text-emerald-200">
                          📍 {order.deliveryZoneName}
                        </Badge>
                      )}
                      <Badge
                        className={
                          order.assignedDriver
                            ? "border border-purple-400/40 bg-purple-500/20 text-[11px] font-bold text-purple-200"
                            : "border border-amber-400/40 bg-amber-500/15 text-[11px] font-bold text-amber-200"
                        }
                      >
                        🛵 {order.assignedDriver ? order.assignedDriver.name : "Sin asignar"}
                      </Badge>
                    </div>

                    <Badge
                      variant="outline"
                      className={`inline-flex items-center gap-1 text-[11px] ${SLA_STYLES[sla.level]}`}
                    >
                      {sla.level === "critical" ? (
                        <Flame className="h-3.5 w-3.5 text-red-400" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      {sla.label}
                    </Badge>
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-400">
                        #{order.id}
                      </p>
                      <CardTitle className="font-headline text-xl font-black text-white">
                        {order.customerName}
                      </CardTitle>
                    </div>
                    <div className="text-right">
                      <p className="font-headline text-lg font-black text-[#00BCD4]">
                        ${order.total.toLocaleString("es-CO")}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {totalCups} {totalCups === 1 ? "vaso" : "vasos"}
                        {order.paymentVerificationStatus === "verificado" ? " · Pago verificado" : ""}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 p-4 pt-2">
                  <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/45 p-3 text-sm text-slate-100">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#00BCD4]" />
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug text-white">{order.address}</p>
                      {order.notes && (
                        <p className="mt-1 text-xs text-amber-200">Nota: {order.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Accesos rápidos de contacto y GPS */}
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="min-h-11 border-white/15 bg-slate-800/70 px-2 text-xs text-slate-100 hover:bg-slate-700"
                    >
                      <a href={buildDriverCallHref(order.phone)} aria-label={`Llamar a ${order.customerName}`}>
                        <Phone className="h-4 w-4 text-cyan-300" />
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="min-h-11 border-white/15 bg-slate-800/70 px-2 text-xs text-slate-100 hover:bg-slate-700"
                    >
                      <a
                        href={buildDriverWhatsAppHref(order, order.phone)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`WhatsApp a ${order.customerName}`}
                      >
                        <MessageCircle className="h-4 w-4 text-emerald-300" />
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="min-h-11 border-white/15 bg-slate-800/70 px-2 text-xs text-slate-100 hover:bg-slate-700"
                    >
                      <a
                        href={buildWazeHref(order.address)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir Waze para ${order.customerName}`}
                      >
                        <Navigation className="h-4 w-4 text-cyan-300" />
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="min-h-11 border-white/15 bg-slate-800/70 px-2 text-xs text-slate-100 hover:bg-slate-700"
                    >
                      <a
                        href={buildGoogleMapsHref(order.address)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir Google Maps para ${order.customerName}`}
                      >
                        <ExternalLink className="h-4 w-4 text-purple-300" />
                      </a>
                    </Button>
                  </div>

                  {/* Acciones operativas */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {isActive && !order.assignedDriver && onClaimOrder && (
                      <Button
                        type="button"
                        variant="outline"
                        data-testid={`btn-claim-order-${order.id}`}
                        disabled={isClaiming}
                        onClick={() => void onClaimOrder(order)}
                        className="min-h-11 flex-1 border-purple-400/50 bg-purple-500/15 text-xs font-bold text-purple-100 hover:bg-purple-500/25"
                      >
                        <UserCheck className="h-4 w-4" />
                        {isClaiming ? "Asignando..." : "Tomar pedido"}
                      </Button>
                    )}

                    {isActive && order.status !== "en_camino" && onStartRoute && (
                      <Button
                        type="button"
                        variant="outline"
                        data-testid={`btn-queue-start-route-${order.id}`}
                        disabled={isStarting}
                        onClick={() => void onStartRoute(order)}
                        className="min-h-11 flex-1 border-cyan-400/50 bg-cyan-500/15 text-xs font-bold text-cyan-100 hover:bg-cyan-500/25"
                      >
                        <Bike className="h-4 w-4" />
                        {isStarting ? "Saliendo..." : "Salir a ruta"}
                      </Button>
                    )}

                    <Button
                      asChild
                      className="min-h-11 flex-1 bg-[#E5196E] text-xs font-black uppercase tracking-wide text-white hover:bg-[#cf1462]"
                    >
                      <Link href={`/repartidor/${order.id}`} data-testid={`btn-open-delivery-${order.id}`}>
                        Abrir entrega <ArrowRight className="h-4 w-4" />
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
  );
}
