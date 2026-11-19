"use client";

import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { LoginForm } from "@/components/auth/LoginForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AuthLoginCardProps = {
  initialRole: "customer" | "staff";
  redirectTo?: string;
  staffRedirectTo?: string;
  showBackToStoreLink?: boolean;
};

export function AuthLoginCard({
  initialRole,
  redirectTo,
  staffRedirectTo = "/admin/dashboard",
  showBackToStoreLink = true,
}: AuthLoginCardProps) {
  const [activeRole, setActiveRole] = useState<"customer" | "staff">(initialRole);
  const isStaff = activeRole === "staff";

  return (
    <Card
      className={`flex h-full w-full flex-col justify-center rounded-3xl bg-zinc-950/90 p-1 backdrop-blur-xl transition-all duration-300 sm:p-3 ${
        isStaff
          ? "border-cyan-500/40 shadow-[0_20px_60px_-20px_rgba(6,182,212,0.28)]"
          : "border-primary/35 shadow-[0_20px_60px_-20px_rgba(233,30,99,0.28)]"
      }`}
    >
      <CardHeader className="space-y-3 pb-3 text-center">
        {isStaff ? (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-950/50 text-cyan-400 shadow-md shadow-cyan-500/20">
            <ShieldCheck className="h-7 w-7 text-cyan-400" aria-hidden="true" />
          </div>
        ) : (
          <div className="relative mx-auto h-12 w-12 overflow-hidden rounded-full border-2 border-primary/70 bg-black shadow-[0_0_20px_rgba(233,30,99,0.4)]">
            <Image
              src="/brand/coctels-ops-logo.png"
              alt="Logo oficial Coctels OPS"
              fill
              sizes="48px"
              className="object-cover"
              priority
            />
          </div>
        )}

        <div>
          <CardTitle
            className={`font-headline text-2xl font-black tracking-tight text-white ${
              isStaff ? "" : "uppercase"
            }`}
          >
            {isStaff ? "Acceso Operativo Staff" : "INGRESAR A OPS"}
          </CardTitle>
          <p className="mt-1 text-xs text-slate-300">
            {isStaff
              ? "Ingresa con tu cuenta autorizada de Coctels OPS."
              : "Pide tus granizados, acumula puntos y sigue tu entrega en vivo."}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <LoginForm
          redirectTo={redirectTo}
          staffRedirectTo={staffRedirectTo}
          initialRole={initialRole}
          onRoleModeChange={setActiveRole}
          showBackToStoreLink={showBackToStoreLink}
        />
      </CardContent>
    </Card>
  );
}
