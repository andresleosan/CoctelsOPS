import Link from 'next/link';
import { GlassWater, ShieldCheck } from 'lucide-react';

import { LoginForm } from '@/components/auth/LoginForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; staff?: string; role?: string }>;
}) {
  const { redirect, staff, role } = await searchParams;
  const isStaff = staff === 'true' || staff === '1' || role === 'staff' || role === 'admin';

  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        {/* Banner destacado de acceso administrativo */}
        {!isStaff ? (
          <div className="flex items-center justify-between p-3.5 rounded-2xl border border-cyan-500/30 bg-cyan-950/40 backdrop-blur-md shadow-lg shadow-cyan-500/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white tracking-wide">¿Acceso Staff o Admin?</p>
                <p className="text-[11px] text-cyan-200/70">Gestión de carta, barra y KDS</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-cyan-500/50 bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-black font-extrabold text-xs h-9 px-3.5 rounded-xl shadow-md shrink-0"
              asChild
            >
              <Link href="/admin/login">Acceso Staff</Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-3.5 rounded-2xl border border-primary/30 bg-primary/10 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/20 text-primary">
                <GlassWater className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white tracking-wide">Modo Staff & Barra</p>
                <p className="text-[11px] text-muted-foreground">¿Deseas pedir como cliente?</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary hover:text-white font-bold text-xs h-9 px-3.5 rounded-xl"
              asChild
            >
              <Link href="/login">Ir a Clientes</Link>
            </Button>
          </div>
        )}

        <Card className="w-full border-primary/20 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur">
          <CardHeader className="space-y-2 text-center pb-2">
            <GlassWater className="mx-auto h-10 w-10 text-primary neon-text-magenta" />
            <CardTitle className="font-headline text-3xl uppercase tracking-tight text-primary">
              {isStaff ? 'Acceso Staff & Barra' : 'Ingresar a OPS'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isStaff
                ? 'Ingresa con tus credenciales operativas autorizadas.'
                : 'Elige tu acceso para ingresar a la plataforma.'}
            </p>
          </CardHeader>
          <CardContent>
            <LoginForm redirectTo={redirect} initialRole={isStaff ? 'staff' : 'customer'} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
