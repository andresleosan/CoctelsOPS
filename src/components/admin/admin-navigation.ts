import type { Permission } from "@/types/auth";

export type AdminNavigationItem = {
  href: string;
  label: string;
  permission?: Permission;
};

export const ADMIN_NAVIGATION: AdminNavigationItem[] = [
  { href: "/admin/dashboard", label: "Resumen" },
  { href: "/admin/pedidos", label: "Pedidos", permission: "pedidos.read" },
  { href: "/admin/productos", label: "Productos (Menú)", permission: "productos.read" },
  { href: "/admin/categorias", label: "Categorías de Carta", permission: "categorias.read" },
  { href: "/admin/clientes", label: "Clientes", permission: "clientes.read" },
  { href: "/admin/usuarios", label: "Usuarios", permission: "usuarios.read" },
  { href: "/admin/roles", label: "Roles", permission: "roles.read" },
];

export const ADVANCED_ADMIN_NAVIGATION: AdminNavigationItem[] = [
  { href: "/admin/inventario", label: "Inventario", permission: "inventario.read" },
  { href: "/admin/promociones", label: "Promociones", permission: "promociones.read" },
  { href: "/admin/reportes", label: "Reportes", permission: "reportes.read" },
  { href: "/admin/configuracion", label: "Configuración", permission: "configuracion.read" },
  { href: "/admin/auditoria", label: "Auditoría", permission: "auditoria.read" },
  { href: "/admin/notificaciones", label: "Notificaciones", permission: "notificaciones.read" },
];

export function getVisibleAdminNavigation(isAdmin: boolean, permissions: Permission[]): AdminNavigationItem[] {
  if (isAdmin) return ADMIN_NAVIGATION;
  const navigation = [...ADMIN_NAVIGATION, ...ADVANCED_ADMIN_NAVIGATION];
  const assigned = new Set(permissions.filter((permission) => navigation.some((item) => item.permission === permission)));
  if (assigned.size === 0) return [];
  return navigation.filter((item) => !item.permission || assigned.has(item.permission));
}
