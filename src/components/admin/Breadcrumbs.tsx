"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { usePathname } from "next/navigation";

const labels: Record<string, string> = {
  admin: "Administración",
  dashboard: "Resumen",
  pedidos: "Pedidos",
  productos: "Productos",
  categorias: "Categorías",
  clientes: "Clientes",
  usuarios: "Usuarios",
  roles: "Roles",
  inventario: "Inventario",
  promociones: "Promociones",
  reportes: "Reportes",
  configuracion: "Configuración",
  negocios: "Locales SaaS",
  auditoria: "Auditoría",
  notificaciones: "Notificaciones",
  nueva: "Nuevo",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  return (
    <nav aria-label="Migas de pan" className="flex items-center gap-1 text-xs text-slate-500">
      <Link href="/admin/dashboard" className="rounded p-1 hover:text-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" aria-label="Resumen">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {parts.slice(1).map((part, index) => {
        const href = `/${parts.slice(0, index + 2).join("/")}`;
        const label = labels[part] ?? (part.length > 20 ? "Detalle" : part);
        return (
          <span key={href} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            {index === parts.slice(1).length - 1 ? <span className="font-medium text-slate-700">{label}</span> : <Link href={href} className="hover:text-cyan-700">{label}</Link>}
          </span>
        );
      })}
    </nav>
  );
}
