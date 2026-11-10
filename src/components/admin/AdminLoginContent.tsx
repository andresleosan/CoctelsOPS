"use client";

import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import AuthShowcase from "@/components/auth/AuthShowcase";
import { LoginForm } from "@/components/auth/LoginForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminLoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/admin/dashboard";

  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8 md:py-12">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
        {/* Lado izquierdo: Showcase real de granizados */}
        <div className="hidden lg:flex lg:col-span-7 flex-col">
          <AuthShowcase />
        </div>

        {/* Lado derecho: Tarjeta de Acceso Staff */}
        <div className="w-full lg:col-span-5 flex flex-col justify-center">
          <Card className="w-full border-cyan-500/30 bg-card/85 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl rounded-3xl p-1 sm:p-3">
            <CardHeader className="space-y-3 text-center pb-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-950/40 text-cyan-400 shadow-md shadow-cyan-500/20">
                <ShieldCheck className="h-8 w-8 text-cyan-400" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black text-white tracking-wide">
                  Acceso Operativo Staff
                </CardTitle>
                <p className="mt-1 text-xs text-slate-400">
                  Ingresa con tu cuenta autorizada de Coctels OPS.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <LoginForm redirectTo={redirectTo} initialRole="staff" />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
