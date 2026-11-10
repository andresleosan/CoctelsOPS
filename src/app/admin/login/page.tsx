import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import AuthShowcase from "@/components/auth/AuthShowcase";
import AdminLoginContent from "@/components/admin/AdminLoginContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function AdminFormSkeleton() {
  return (
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
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-black/40 p-1.5 animate-pulse">
          <div className="h-11 rounded-xl bg-white/5" />
          <div className="h-11 rounded-xl bg-cyan-500/40" />
        </div>
        <div className="h-12 w-full rounded-xl bg-white/5 animate-pulse" />
        <div className="h-11 w-full rounded-xl bg-white/5 animate-pulse" />
      </CardContent>
    </Card>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8 md:py-12">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
        <div className="hidden lg:flex lg:col-span-7 flex-col">
          <AuthShowcase />
        </div>
        <div className="w-full lg:col-span-5 flex flex-col justify-center">
          <Suspense fallback={<AdminFormSkeleton />}>
            <AdminLoginContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
