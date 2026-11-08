'use client';

import Link from 'next/link';
import { ArrowRight, Clock3, Package, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RepeatOrderButton } from '@/components/account/RepeatOrderButton';
import { useAuth } from '@/hooks/use-auth';
import type { CustomerOrder, OrderStatus } from '@/types/orders';

const statusLabels: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  preparando: 'En preparación',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha pendiente' : date.toLocaleDateString('es-CO', { dateStyle: 'medium' });
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || 'No pudimos cargar tus pedidos.';
}

export function OrderHistory() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/pedidos?mine=true', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { orders: CustomerOrder[] };
      setOrders(data.orders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No pudimos conectar con la central de pedidos.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
        Cargando tus pedidos...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
        <Button variant="outline" onClick={() => void loadOrders()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
        </Button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="border-accent/20 bg-card/60">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <Package className="h-10 w-10 text-accent" />
          <div>
            <h2 className="font-headline text-xl font-bold text-accent">Todavía no tienes pedidos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tu próxima mezcla empieza en el menú.</p>
          </div>
          <Button asChild>
            <Link href="/menu">Explorar el menú</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.id} className="border-primary/20 bg-card/80 transition-colors hover:border-primary/50">
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Pedido #{order.id}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> {formatDate(order.createdAt)}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  order.status === 'cancelado'
                    ? 'border-destructive/50 text-destructive'
                    : 'border-accent/50 text-accent'
                }
              >
                {statusLabels[order.status]}
              </Badge>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {order.items.map((item) => `${item.quantity}x ${item.name}`).join(' · ')}
                </p>
                <p className="mt-1 font-headline text-xl font-bold text-foreground">
                  ${order.total.toLocaleString('es-CO')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RepeatOrderButton
                  items={order.items}
                  orderId={order.id}
                  size="sm"
                  variant="outline"
                  className="border-primary/40 text-primary hover:bg-primary/10 hover:border-primary"
                />
                <Button variant="ghost" size="sm" asChild className="min-h-[44px]">
                  <Link href={`/cuenta/pedidos/${encodeURIComponent(order.id)}`}>
                    Ver detalle <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
