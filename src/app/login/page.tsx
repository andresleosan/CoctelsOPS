import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Store } from "lucide-react";

import AuthShowcase from "@/components/auth/AuthShowcase";
import LoginContent from "@/components/auth/LoginContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function FormSkeleton() {
  return (
    <Card className="flex h-full w-full flex-col justify-center rounded-3xl border-primary/35 bg-zinc-950/90 p-1 shadow-[0_20px_60px_-20px_rgba(233,30,99,0.28)] backdrop-blur-xl sm:p-3">
      <CardHeader className="space-y-3 pb-3 text-center">
        <div className="relative mx-auto h-12 w-12 overflow-hidden rounded-full border-2 border-primary/70 bg-black shadow-[0_0_20px_rgba(233,30,99,0.4)]">
          <Image
            src="/brand/coctels-ops-logo.png"
            alt="Logo oficial Coctels OPS"
            fill
            sizes="48px"
            className="object-cover"
          />
        </div>
        <div>
          <CardTitle className="font-headline text-2xl font-black uppercase tracking-tight text-white">
            INGRESAR A OPS
          </CardTitle>
          <p className="mt-1 text-xs text-slate-300">
            Pide tus granizados, acumula puntos y sigue tu entrega en vivo.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid animate-pulse grid-cols-2 gap-1.5 rounded-2xl border border-white/15 bg-black/60 p-1.5">
          <div className="h-11 rounded-xl bg-primary/40" />
          <div className="h-11 rounded-xl bg-white/5" />
        </div>
        <div className="h-12 w-full animate-pulse rounded-xl bg-white/5" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-white/5" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-white/5" />
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] flex-col justify-center overflow-hidden px-4 py-6 md:py-10">
      {/* Resplandor ambiental discreto */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl"
      />

      <div className="container relative z-10 mx-auto max-w-5xl space-y-5">
        {/* Barra rápida superior de navegación a la tienda */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-xs font-semibold text-white transition-colors hover:border-primary/50 hover:bg-primary/15"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la tienda</span>
          </Link>

          <Link
            href="/menu"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
          >
            <Store className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Explorar menú</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="hidden flex-col lg:col-span-7 lg:flex">
            <AuthShowcase />
          </div>
          <div className="flex w-full flex-col justify-center lg:col-span-5">
            <Suspense fallback={<FormSkeleton />}>
              <LoginContent />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
