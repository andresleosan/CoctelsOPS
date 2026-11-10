import { Suspense } from "react";
import { GlassWater } from "lucide-react";
import AuthShowcase from "@/components/auth/AuthShowcase";
import LoginContent from "@/components/auth/LoginContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function FormSkeleton() {
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
      <CardContent className="space-y-4">
        {/* Skeleton de los 2 selectores superiores */}
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-black/40 p-1.5 animate-pulse">
          <div className="h-11 rounded-xl bg-primary/40" />
          <div className="h-11 rounded-xl bg-white/5" />
        </div>
        <div className="h-12 w-full rounded-xl bg-white/5 animate-pulse" />
        <div className="h-11 w-full rounded-xl bg-white/5 animate-pulse" />
        <div className="h-11 w-full rounded-xl bg-white/5 animate-pulse" />
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8 md:py-12">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
        {/* Lado izquierdo (Desktop/Tablet): Showcase fotográfico real de granizados */}
        <div className="hidden lg:flex lg:col-span-7 flex-col">
          <AuthShowcase />
        </div>

        {/* Lado derecho: Tarjeta de Acceso con los 2 botones superiores */}
        <div className="w-full lg:col-span-5 flex flex-col justify-center">
          <Suspense fallback={<FormSkeleton />}>
            <LoginContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
