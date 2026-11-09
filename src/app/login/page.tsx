import { GlassWater } from 'lucide-react';

import { LoginForm } from '@/components/auth/LoginForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; staff?: string; role?: string }>;
}) {
  const { redirect, staff, role } = await searchParams;
  const isStaff = staff === 'true' || staff === '1' || role === 'staff' || role === 'admin';

  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border-primary/20 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur">
        <CardHeader className="space-y-2 text-center pb-2">
          <GlassWater className="mx-auto h-10 w-10 text-primary neon-text-magenta" />
          <CardTitle className="font-headline text-3xl uppercase tracking-tight text-primary">Ingresar a OPS</CardTitle>
          <p className="text-sm text-muted-foreground">Elige tu acceso para ingresar a la plataforma.</p>
        </CardHeader>
        <CardContent>
          <LoginForm redirectTo={redirect} initialRole={isStaff ? 'staff' : 'customer'} />
        </CardContent>
      </Card>
    </main>
  );
}
