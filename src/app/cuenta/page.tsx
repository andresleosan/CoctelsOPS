'use client';

import Link from 'next/link';
import { ArrowRight, ClipboardList, MailCheck, MailWarning, UserRound } from 'lucide-react';

import { LoyaltyCard } from '@/components/account/LoyaltyCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

export default function AccountPage() {
  const { user, loading, isVerified } = useAuth();

  if (loading || !user) return null;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20 bg-card/80 shadow-2xl shadow-primary/10">
        <CardHeader className="border-b border-border/70 bg-primary/[0.04]">
          <CardTitle className="flex items-center gap-3 text-lg"><UserRound className="h-5 w-5 text-primary" /> Datos de acceso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Nombre</p><p className="mt-1 font-semibold">{user.displayName || 'Sin nombre'}</p></div>
            <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Correo</p><p className="mt-1 break-all font-semibold">{user.email}</p></div>
          </div>
          <div className={isVerified ? 'flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm text-accent' : 'flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary'}>
            {isVerified ? <MailCheck className="h-5 w-5 shrink-0" /> : <MailWarning className="h-5 w-5 shrink-0" />}
            {isVerified ? 'Correo verificado. Ya puedes hacer pedidos.' : 'Verifica tu correo para hacer pedidos.'}
          </div>
          <div className="flex flex-wrap gap-3">
            {!isVerified && <Button asChild><Link href="/verificar-email">Verificar correo</Link></Button>}
            <Button variant="outline" asChild><Link href="/menu">Explorar el menú</Link></Button>
          </div>
        </CardContent>
      </Card>
      <LoyaltyCard />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/cuenta/perfil" className="group rounded-2xl border border-accent/20 bg-card/60 p-5 transition-colors hover:border-accent/60 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Perfil</p>
          <p className="mt-2 font-semibold">Actualiza tus datos de entrega</p>
          <ArrowRight className="mt-4 h-5 w-5 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
        <Link href="/cuenta/pedidos" className="group rounded-2xl border border-primary/20 bg-card/60 p-5 transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Historial</p>
          <p className="mt-2 font-semibold">Consulta tus pedidos y estados</p>
          <ClipboardList className="mt-4 h-5 w-5 text-primary transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
