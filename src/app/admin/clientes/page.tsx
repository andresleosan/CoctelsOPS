"use client";

import {
  Check,
  Clock,
  Coins,
  Copy,
  Crown,
  ExternalLink,
  Filter,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { CustomerSegmentBadge } from "@/components/admin/CustomerSegmentBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  buildWhatsAppChatUrl,
  buildWhatsAppReactivationMessage,
  CAMPAIGN_TEMPLATES,
  type CrmCustomer,
  type CrmSummaryMetrics,
  type CustomerSegment,
  type WhatsAppCampaignTemplate,
} from "@/lib/customers/crm";
import { formatCurrency } from "@/lib/reports/export-report";

type SortOption = "spent" | "orders" | "points" | "recent" | "name";

export default function CustomersCrmPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [metrics, setMetrics] = useState<CrmSummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("spent");

  // Diálogo de campaña WhatsApp 1-Tap
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<CrmCustomer | null>(null);
  const [selectedTemplate, setSelectedTemplate] =
    useState<WhatsAppCampaignTemplate>("reactivacion_puntos");
  const [customizedMessage, setCustomizedMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/clientes", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = (await response.json().catch(() => ({}))) as {
        customers?: CrmCustomer[];
        metrics?: CrmSummaryMetrics;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "No se pudieron cargar los datos de CRM.");
      }

      setCustomers(body.customers ?? []);
      setMetrics(body.metrics ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "No se pudieron cargar los clientes."
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Abrir modal de campaña para un cliente
  const handleOpenCampaignModal = (customer: CrmCustomer) => {
    setActiveCustomer(customer);
    // Asignar plantilla por defecto según segmento
    const defaultTpl: WhatsAppCampaignTemplate =
      customer.segment === "inactivo"
        ? "reactivacion_puntos"
        : customer.segment === "vip"
          ? "saludo_vip"
          : "reactivacion_puntos";

    setSelectedTemplate(defaultTpl);
    const msg = buildWhatsAppReactivationMessage(customer, defaultTpl);
    setCustomizedMessage(msg);
    setCopied(false);
    setCampaignModalOpen(true);
  };

  const handleTemplateChange = (tpl: WhatsAppCampaignTemplate) => {
    if (!activeCustomer) return;
    setSelectedTemplate(tpl);
    const msg = buildWhatsAppReactivationMessage(activeCustomer, tpl);
    setCustomizedMessage(msg);
    setCopied(false);
  };

  const handleCopyMessage = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(customizedMessage);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Ignorar fallo de portapapeles
    }
  };

  // Filtrado reactivo y ordenamiento
  const filteredCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        // Filtro por segmento
        if (selectedSegment !== "all" && c.segment !== selectedSegment) {
          return false;
        }

        // Filtro por texto
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = (c.displayName ?? "").toLowerCase().includes(q);
          const matchEmail = (c.email ?? "").toLowerCase().includes(q);
          const matchPhone = (c.telefono ?? "").toLowerCase().includes(q);
          return matchName || matchEmail || matchPhone;
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "spent":
            return b.totalSpent - a.totalSpent;
          case "orders":
            return b.deliveredOrdersCount - a.deliveredOrdersCount;
          case "points":
            return b.availablePoints - a.availablePoints;
          case "recent": {
            const dateA = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
            const dateB = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
            return dateB - dateA;
          }
          case "name":
            return (a.displayName ?? "").localeCompare(b.displayName ?? "");
          default:
            return 0;
        }
      });
  }, [customers, selectedSegment, searchQuery, sortBy]);

  // Contadores por segmento para badges en filtros
  const segmentCounts = useMemo(() => {
    const counts = { all: customers.length, vip: 0, frecuente: 0, inactivo: 0, nuevo: 0 };
    for (const c of customers) {
      if (counts[c.segment] !== undefined) {
        counts[c.segment] += 1;
      }
    }
    return counts;
  }, [customers]);

  return (
    <AdminGuard permission="clientes.read">
      <div className="space-y-6">
        {/* Cabecera Principal */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-fuchsia-300">
              <Sparkles className="h-3.5 w-3.5" />
              CRM & Fidelización
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Clientes & Retención VIP
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Segmentación automática de clientes, ticket promedio y re-activación con 1 tap por
              WhatsApp.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => void loadData()}
            disabled={loading}
            className="w-full sm:w-auto border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>

        {/* Mensaje de error si falla la API */}
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError("")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Tarjetas KPI de Resumen */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="border-slate-200/80 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Total Clientes</span>
                <Users className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {metrics?.totalCustomers ?? customers.length}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 truncate">
                {formatCurrency(metrics?.totalSpentAllCustomers ?? 0)} gastados
              </p>
            </CardContent>
          </Card>

          <Card className="border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-50/50 to-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fuchsia-800">VIP Neón</span>
                <Crown className="h-4 w-4 text-fuchsia-600" />
              </div>
              <p className="mt-2 text-2xl font-bold text-fuchsia-950">
                {metrics?.vipCount ?? segmentCounts.vip}
              </p>
              <p className="mt-0.5 text-xs text-fuchsia-700/80">Alto valor & Oro</p>
            </CardContent>
          </Card>

          <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-50/50 to-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-800">Frecuentes</span>
                <TrendingUp className="h-4 w-4 text-cyan-600" />
              </div>
              <p className="mt-2 text-2xl font-bold text-cyan-950">
                {metrics?.frecuenteCount ?? segmentCounts.frecuente}
              </p>
              <p className="mt-0.5 text-xs text-cyan-700/80">Recurrentes activos</p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-gradient-to-br from-amber-50/70 to-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-800">Inactivos + Puntos</span>
                <Clock className="h-4 w-4 text-amber-600 animate-pulse" />
              </div>
              <p className="mt-2 text-2xl font-bold text-amber-950">
                {metrics?.inactivoCount ?? segmentCounts.inactivo}
              </p>
              <p className="mt-0.5 text-xs text-amber-700 font-medium truncate">
                ¡Re-activar con saldo!
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white shadow-sm col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Ticket Promedio</span>
                <Coins className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatCurrency(metrics?.globalAverageTicket ?? 0)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 truncate">
                {metrics?.totalAvailablePoints ?? 0} pts globales
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Barra de Filtros, Búsqueda y Ordenamiento */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {/* Buscador reactivo */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, correo o celular..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 bg-slate-50 border-slate-200 text-sm focus-visible:ring-primary"
                  aria-label="Buscar clientes"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Selector de Orden */}
              <div className="flex items-center gap-2">
                <Label htmlFor="sort-select" className="text-xs text-slate-500 whitespace-nowrap">
                  Ordenar:
                </Label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="spent">Mayor gasto acumulado</option>
                  <option value="orders">Más pedidos entregados</option>
                  <option value="points">Más Puntos Coctels</option>
                  <option value="recent">Último pedido (reciente)</option>
                  <option value="name">Alfabético por nombre</option>
                </select>
              </div>
            </div>

            {/* Chips de Segmento */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
              <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="h-3 w-3" /> Segmento:
              </span>

              <button
                type="button"
                onClick={() => setSelectedSegment("all")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  selectedSegment === "all"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Todos
                <span className="rounded-full bg-slate-700/20 px-1.5 py-0.2 text-[10px]">
                  {segmentCounts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSegment("vip")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  selectedSegment === "vip"
                    ? "bg-fuchsia-600 text-white shadow-sm"
                    : "bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 border border-fuchsia-200"
                }`}
              >
                <Crown className="h-3 w-3" />
                VIP Neón
                <span className="rounded-full bg-fuchsia-900/20 px-1.5 text-[10px]">
                  {segmentCounts.vip}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSegment("frecuente")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  selectedSegment === "frecuente"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200"
                }`}
              >
                <TrendingUp className="h-3 w-3" />
                Frecuentes
                <span className="rounded-full bg-cyan-900/20 px-1.5 text-[10px]">
                  {segmentCounts.frecuente}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSegment("inactivo")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  selectedSegment === "inactivo"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-300"
                }`}
              >
                <Clock className="h-3 w-3" />
                Inactivos con Puntos
                <span className="rounded-full bg-amber-900/20 px-1.5 text-[10px]">
                  {segmentCounts.inactivo}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSegment("nuevo")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  selectedSegment === "nuevo"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Nuevos
                <span className="rounded-full bg-emerald-900/20 px-1.5 text-[10px]">
                  {segmentCounts.nuevo}
                </span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Lista / Grid de Clientes */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white shadow-sm">
            <CardContent className="p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                No se encontraron clientes
              </h3>
              <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
                No hay clientes que coincidan con la búsqueda o el segmento seleccionado.
              </p>
              {(searchQuery || selectedSegment !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedSegment("all");
                  }}
                  className="mt-4 border-slate-300"
                >
                  Limpiar filtros
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCustomers.map((customer) => {
              const whatsAppUrl = buildWhatsAppChatUrl(
                customer.telefono,
                buildWhatsAppReactivationMessage(customer, "reactivacion_puntos")
              );

              return (
                <Card
                  key={customer.uid}
                  data-testid={`customer-card-${customer.uid}`}
                  className={`border transition-all hover:shadow-md bg-white ${
                    customer.segment === "vip"
                      ? "border-fuchsia-300 ring-1 ring-fuchsia-400/20"
                      : customer.segment === "inactivo"
                        ? "border-amber-300 ring-1 ring-amber-400/20"
                        : "border-slate-200"
                  }`}
                >
                  <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                    {/* Header de la Tarjeta */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold text-sm text-white ${
                              customer.segment === "vip"
                                ? "bg-gradient-to-tr from-fuchsia-600 to-purple-500 shadow-sm"
                                : customer.segment === "inactivo"
                                  ? "bg-gradient-to-tr from-amber-500 to-orange-400"
                                  : customer.segment === "frecuente"
                                    ? "bg-gradient-to-tr from-cyan-600 to-teal-500"
                                    : "bg-slate-700"
                            }`}
                          >
                            {customer.displayName ? (
                              customer.displayName.slice(0, 2).toUpperCase()
                            ) : (
                              <User className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h2 className="font-bold text-slate-900 text-sm truncate">
                              {customer.displayName || "Sin nombre registrado"}
                            </h2>
                            <p className="text-xs text-slate-500 truncate">{customer.email}</p>
                          </div>
                        </div>

                        <CustomerSegmentBadge segment={customer.segment} size="sm" />
                      </div>

                      {/* Teléfono y direcciones */}
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-1.5 truncate">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {customer.telefono ? (
                            <a
                              href={`tel:${customer.telefono}`}
                              className="font-medium text-slate-700 hover:text-cyan-600 hover:underline"
                            >
                              {customer.telefono}
                            </a>
                          ) : (
                            <span className="italic text-slate-400">Sin teléfono</span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {customer.addressesCount}{" "}
                          {customer.addressesCount === 1 ? "dirección" : "direcciones"}
                        </span>
                      </div>
                    </div>

                    {/* Matriz de Métricas del Cliente */}
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Gasto Total</span>
                        <span className="font-bold text-slate-900 text-sm">
                          {formatCurrency(customer.totalSpent)}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[11px]">Ticket Promedio</span>
                        <span className="font-semibold text-slate-800">
                          {formatCurrency(customer.averageTicket)}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[11px]">Pedidos Entregados</span>
                        <span className="font-semibold text-slate-800">
                          {customer.deliveredOrdersCount}{" "}
                          <span className="text-slate-400 font-normal">
                            ({customer.totalOrdersCount} tot)
                          </span>
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[11px]">Puntos Coctels</span>
                        <span className="font-bold text-amber-600 flex items-center gap-1">
                          <Coins className="h-3 w-3 text-amber-500 shrink-0" />
                          {customer.availablePoints} pts
                        </span>
                      </div>

                      <div className="col-span-2 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Último pedido:</span>
                        <span
                          className={`font-medium ${
                            customer.daysSinceLastOrder !== null && customer.daysSinceLastOrder > 15
                              ? "text-amber-600 font-semibold"
                              : "text-slate-700"
                          }`}
                        >
                          {customer.daysSinceLastOrder !== null
                            ? `Hace ${customer.daysSinceLastOrder} días`
                            : "Sin pedidos"}
                        </span>
                      </div>
                    </div>

                    {/* Botones de Acción de Re-activación y WhatsApp */}
                    <div className="pt-1 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => handleOpenCampaignModal(customer)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm gap-1.5"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        1-Tap WhatsApp
                      </Button>

                      {whatsAppUrl && (
                        <a
                          href={whatsAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir chat directo con ${customer.displayName || "cliente"}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal / Diálogo de Campaña de Re-activación WhatsApp */}
        <Dialog open={campaignModalOpen} onOpenChange={setCampaignModalOpen}>
          <DialogContent className="max-w-lg bg-white border-slate-200 text-slate-900">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-emerald-100 p-2 text-emerald-600">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold">
                    Campaña WhatsApp para {activeCustomer?.displayName || "Cliente"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Genera y envía un mensaje personalizado con saldo de puntos y ofertas en 1 tap.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {activeCustomer && (
              <div className="space-y-4 py-2">
                {/* Resumen del Cliente */}
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200/80 text-xs">
                  <div>
                    <span className="font-semibold text-slate-900 block">
                      {activeCustomer.displayName || "Cliente"}
                    </span>
                    <span className="text-slate-500">{activeCustomer.telefono || "Sin celular"}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-amber-600 block">
                      {activeCustomer.availablePoints} Puntos Coctels
                    </span>
                    <CustomerSegmentBadge segment={activeCustomer.segment} size="sm" />
                  </div>
                </div>

                {/* Selector de Plantilla */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-700">
                    Seleccionar Plantilla de Campaña:
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CAMPAIGN_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleTemplateChange(tpl.id)}
                        className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                          selectedTemplate === tpl.id
                            ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/30 text-emerald-950 font-medium"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <p className="font-semibold text-xs">{tpl.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {tpl.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Previsualización del Mensaje */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="message-preview"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Mensaje Personalizado (WhatsApp):
                    </Label>
                    <button
                      type="button"
                      onClick={() => void handleCopyMessage()}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600 font-medium">¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copiar texto</span>
                        </>
                      )}
                    </button>
                  </div>

                  <textarea
                    id="message-preview"
                    rows={4}
                    value={customizedMessage}
                    onChange={(e) => setCustomizedMessage(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCampaignModalOpen(false)}
                className="border-slate-200 text-slate-700"
              >
                Cerrar
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyMessage()}
                  className="gap-1.5 border-slate-300"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>

                {activeCustomer && (
                  <Button
                    size="sm"
                    disabled={!activeCustomer.telefono}
                    onClick={() => {
                      const url = buildWhatsAppChatUrl(activeCustomer.telefono, customizedMessage);
                      if (url) {
                        window.open(url, "_blank", "noopener,noreferrer");
                        setCampaignModalOpen(false);
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Enviar por WhatsApp
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminGuard>
  );
}
