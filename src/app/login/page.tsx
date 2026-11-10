import { Suspense } from "react";
import { GlassWater } from "lucide-react";
import LoginContent from "@/components/auth/LoginContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function LoginFallback() {
  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8 md:py-12">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
        {/* Placeholder izquierdo para SSR estático */}
        <div className="hidden lg:flex lg:col-span-7 flex-col rounded-3xl border border-white/10 bg-card/40 p-8 backdrop-blur-xl animate-pulse min-h-[520px] justify-between">
          <div className="space-y-3">
            <div className="h-6 w-36 rounded-full bg-white/10" />
            <div className="h-10 w-3/4 rounded-xl bg-white/10" />
            <div className="h-4 w-1/2 rounded bg-white/5" />
          </div>
          <div className="mx-auto h-56 w-56 rounded-full bg-white/10" />
          <div className="h-8 w-full rounded bg-white/5" />
        </div>

        {/* Tarjeta de Login derecha */}
        <div className="w-full lg:col-span-5 flex flex-col justify-center">
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
              <div className="h-52 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
                Cargando acceso...
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
