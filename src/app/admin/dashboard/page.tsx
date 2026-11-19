"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ClipboardList,
  Martini,
  RefreshCw,
  Settings,
  Tag,
  UserCog,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminAccessCard } from "@/components/admin/AdminAccessCard";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { getAdminDataScopes, type AdminDataScope } from "@/components/admin/admin-data-scope";
import { fetchAdminSession, invalidateAdminSessionCache } from "@/components/admin/admin-session-cache";
import { StatsCards, type AdminStatKey, type AdminStats } from "@/components/admin/StatsCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@/types/auth";
import type { Order, OrderStatus } from "@/types/orders";

type StatsResponse = { stats: AdminStats };
type OrdersResponse = { orders: Order[] };

const scopeStatKeys: Record<AdminDataScope, AdminStatKey[]> = {
  orders: ["revenue", "orders", "pending", "csat"],
  products: ["activeProducts"],
  customers: ["customers"],
};

const QUICK_ACTIONS: Array<{
  href: string;
  label: string;
  description: string;
  permission?: Permission;
  icon: typeof ClipboardList;
}> = [
  {
    href: "/admin/pedidos",
    label: "Pedidos, KDS y POS",
    description: "Tablero en barra y caja rápida",
    permission: "pedidos.read",
    icon: ClipboardList,
  },
  {
    href: "/admin/productos",
    label: "Productos (Menú)",
    description: "Stock 1-tap, precios y fotos R2",
    permission: "productos.read",
    icon: Martini,
  },
  {
    href: "/admin/inventario",
    label: "Inventario y Recetas",
    description: "Insumos críticos y escandallo",
    permission: "inventario.read",
    icon: Boxes,
  },
  {
    href: "/admin/reportes",
    label: "Reportes y Caja",
    description: "Cierre de turno, CSV y WhatsApp",
    permission: "reportes.read",
    icon: BarChart3,
  },
  {
    href: "/admin/clientes",
    label: "Clientes CRM",
    description: "Segmentos VIP y re-activación",
    permission: "clientes.read",
    icon: Users,
  },
  {
    href: "/admin/promociones",
    label: "Promociones y Happy Hour",
    description: "Cupones, combos y franjas",
    permission: "promociones.read",
    icon: Tag,
  },
  {
    href: "/admin/usuarios",
    label: "Usuarios y Roles",
    description: "Control de acceso y staff",
    permission: "usuarios.read",
    icon: UserCog,
  },
  {
    href: "/admin/configuracion",
    label: "Configuración y QR",
    description: "WhatsApp, horarios y QR mesa",
    permission: "configuracion.read",
    icon: Settings,
  },
];

const STATUS_SUMMARY_ORDER: Array<{ status: OrderStatus; label: string; tone: string }> = [
  { status: "pendiente", label: "Pendientes", tone: "border-pink-200 bg-pink-50 text-pink-900" },
  { status: "confirmado", label: "Confirmados", tone: "border-cyan-200 bg-cyan-50 text-cyan-900" },
  { status: "preparando", label: "Preparando", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  { status: "en_camino", label: "En camino", tone: "border-violet-200 bg-violet-50 text-violet-900" },
  { status: "entregado", label: "Entregados", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  { status: "cancelado", label: "Cancelados", tone: "border-slate-200 bg-slate-100 text-slate-700" },
];

function statusLabel(status: Order["status"]): string {
  return status.replace("_", " ");
}

export default function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [scopes, setScopes] = useState<AdminDataScope[]>([]);
  const [sessionPermissions, setSessionPermissions] = useState<Permission[]>([]);
  const [serverAdmin, setServerAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(
    async (force = false) => {
      if (!user) return;
      setLoading(true);
      setError("");
      try {
        if (force) {
          invalidateAdminSessionCache(user.uid);
        }
        const sessionResult = await fetchAdminSession(user, { force });
        if (!sessionResult.ok) {
          throw new Error(sessionResult.data.error ?? "No se pudo validar el acceso operativo.");
        }

        const effectiveAdmin = Boolean(isAdmin || sessionResult.data.adminAccess?.isAdmin);
        const permissions = sessionResult.data.user?.permissions ?? [];
        setServerAdmin(effectiveAdmin);
        setSessionPermissions(permissions);

        const nextScopes = getAdminDataScopes(effectiveAdmin, permissions);
        setScopes(nextScopes);

        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };

        const nextStats: AdminStats = {};
        let nextOrders: Order[] = [];
        for (const scope of nextScopes) {
          const response = await fetch(`/api/admin/stats?scope=${scope}`, { headers });
          const body = (await response.json().catch(() => ({}))) as StatsResponse & {
            error?: string;
          };
          if (!response.ok) {
            throw new Error(body.error ?? "No se pudieron cargar las estadísticas.");
          }
          Object.assign(nextStats, body.stats);
          if (scope === "orders") {
            const ordersResponse = await fetch("/api/pedidos", { headers });
            const ordersBody = (await ordersResponse.json().catch(() => ({}))) as OrdersResponse & {
              error?: string;
            };
            if (!ordersResponse.ok) {
              throw new Error(ordersBody.error ?? "No se pudieron cargar los pedidos recientes.");
            }
            nextOrders = ordersBody.orders.slice(0, 6);
          }
        }
        setStats(nextStats);
        setOrders(nextOrders);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "No se pudieron cargar los datos operativos.",
        );
        setStats(null);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, user],
  );

  useEffect(() => {
    void loadDashboard(false);
  }, [loadDashboard]);

  const visibleStatKeys = scopes.flatMap((scope) => scopeStatKeys[scope]);
  const canReadOrders = scopes.includes("orders");
  const hasAdminPowers = isAdmin || serverAdmin;
  const visibleQuickActions = QUICK_ACTIONS.filter(
    (item) => hasAdminPowers || !item.permission || sessionPermissions.includes(item.permission),
  );

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">
              Centro de control
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Resumen operativo
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Estado de pedidos en vivo, validación de permisos y accesos rápidos a barra.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadDashboard(true)}
            disabled={loading}
            className="min-h-[44px] w-full border-slate-300 bg-white text-slate-800 hover:bg-slate-50 sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>

        <AdminAccessCard />

        {error && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 bg-white text-red-800 hover:bg-red-50"
              onClick={() => void loadDashboard(true)}
            >
              Reintentar
            </Button>
          </div>
        )}

        {!loading && scopes.length === 0 && !error && (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="p-10 text-center text-sm text-slate-600">
              No tienes módulos operativos asignados.
            </CardContent>
          </Card>
        )}

        <StatsCards stats={stats} loading={loading} visibleKeys={visibleStatKeys} />

        {canReadOrders && stats?.byStatus && (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-900">
                Flujo de pedidos por estado
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {STATUS_SUMMARY_ORDER.map((item) => (
                <div
                  key={item.status}
                  className={`rounded-xl border px-3 py-2.5 ${item.tone}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {stats.byStatus?.[item.status] ?? 0}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {visibleQuickActions.length > 0 && (
          <section aria-label="Accesos rápidos administrativos" className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
              Accesos rápidos
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleQuickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-cyan-400 hover:bg-cyan-50/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-cyan-700 group-hover:bg-cyan-100">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                        <p className="text-xs text-slate-500">{action.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-cyan-700" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {canReadOrders && (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg text-slate-900">Pedidos recientes</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Sigue el flujo de preparación y entrega.
                </p>
              </div>
              <Link
                href="/admin/pedidos"
                className="flex min-h-[44px] items-center gap-1 text-sm font-semibold text-cyan-700 hover:text-cyan-900"
              >
                Ver todos <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                  Aún no hay pedidos para mostrar.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/admin/pedidos/${order.id}`}
                      className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{order.customerName}</p>
                        <p className="text-xs text-slate-500">
                          #{order.id.slice(0, 8)} · {order.items.length} productos
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4 sm:justify-end">
                        <Badge
                          variant="outline"
                          className="border-slate-300 bg-slate-50 capitalize text-slate-800"
                        >
                          {statusLabel(order.status)}
                        </Badge>
                        <span className="font-semibold text-slate-800">
                          ${order.total.toLocaleString("es-CO")}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminGuard>
  );
}
