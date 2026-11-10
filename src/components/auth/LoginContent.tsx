"use client";

import { useSearchParams } from "next/navigation";
import { GlassWater } from "lucide-react";

import { LoginForm } from "@/components/auth/LoginForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? undefined;
  const staff = searchParams.get("staff");
  const role = searchParams.get("role");
  const isStaff = staff === "true" || staff === "1" || role === "staff" || role === "admin";

  return (
    <Card className="w-full border-white/10 bg-card/80 shadow-2xl shadow-black/60 backdrop-blur-xl rounded-3xl p-1 sm:p-3">
      <CardHeader className="space-y-2 text-center pb-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-inner">
          <GlassWater className="h-6 w-6 neon-text-magenta" />
        </div>
        <CardTitle className="font-headline text-2xl font-black uppercase tracking-tight text-white">
          INGRESAR A OPS
        </CardTitle>
        <p className="text-xs text-slate-400">
          Elige tu tipo de acceso para ingresar a la plataforma.
        </p>
      </CardHeader>
      <CardContent>
        <LoginForm redirectTo={redirect} initialRole={isStaff ? "staff" : "customer"} />
      </CardContent>
    </Card>
  );
}
