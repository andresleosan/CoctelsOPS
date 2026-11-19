import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ShieldCheck, Store } from "lucide-react";

import AdminLoginContent from "@/components/admin/AdminLoginContent";
import AuthShowcase from "@/components/auth/AuthShowcase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function AdminFormSkeleton() {
  return (
    <Card className="flex h-full w-full flex-col justify-center rounded-3xl border-cyan-500/40 bg-zinc-950/90 p-1 shadow-[0_20px_60px_-20px_rgba(6,182,212,0.28)] backdrop-blur-xl sm:p-3">
      <CardHeader className="space-y-3 pb-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-950/50 text-cyan-400 shadow-md shadow-cyan-500/20">
          <ShieldCheck className="h-7 w-7 text-cyan-400" aria-hidden="true" />
        </div>
        <div>
          <CardTitle className="font-headline text-2xl font-black tracking-tight text-white">
            Acceso Operativo Staff
          </CardTitle>
          <p className="mt-1 text-xs text-slate-300">
            Ingresa con tu cuenta autorizada de Coctels OPS.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid animate-pulse grid-cols-2 gap-1.5 rounded-2xl border border-white/15 bg-black/60 p-1.5">
          <div className="h-11 rounded-xl bg-white/5" />
          <div className="h-11 rounded-xl bg-cyan-500/40" />
        </div>
        <div className="h-12 w-full animate-pulse rounded-xl bg-white/5" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-white/5" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-white/5" />
      </CardContent>
    </Card>
  );
}

export default function AdminLoginPage() {
  return (
    <section className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-black px-4 py-6 md:py-10">
      {/* Resplandor ambiental discreto */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl"
      />

      <div className="container relative z-10 mx-auto max-w-5xl space-y-6">
        {/* Barra superior de retorno a tienda (Header público está oculto en /admin) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-primary/60 bg-black shadow-[0_0_14px_rgba(233,30,99,0.35)] transition-transform duration-300 group-hover:scale-105">
              <Image
                src="/brand/coctels-ops-logo.png"
                alt="Logo Coctels OPS"
                fill
                sizes="36px"
                className="object-cover"
                priority
              />
            </span>
            <span className="font-headline text-lg font-black uppercase tracking-tight text-white">
              Coctels <span className="text-primary neon-text-magenta">OPS</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/menu"
              className="hidden min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white sm:inline-flex"
            >
              <Store className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              <span>Ver Menú</span>
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-xs font-semibold text-white transition-colors hover:border-primary/50 hover:bg-primary/15"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Volver a la tienda</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="hidden flex-col lg:col-span-7 lg:flex">
            <AuthShowcase />
          </div>
          <div className="flex w-full flex-col justify-center lg:col-span-5">
            <Suspense fallback={<AdminFormSkeleton />}>
              <AdminLoginContent />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
