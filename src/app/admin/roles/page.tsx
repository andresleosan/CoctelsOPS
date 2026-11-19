"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RolesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/usuarios?tab=roles");
  }, [router]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-slate-800">
        Roles y permisos ahora vive dentro de Usuarios y Roles.
      </p>
      <Link
        href="/admin/usuarios?tab=roles"
        className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800"
      >
        Ir a Usuarios y Roles
      </Link>
    </div>
  );
}
