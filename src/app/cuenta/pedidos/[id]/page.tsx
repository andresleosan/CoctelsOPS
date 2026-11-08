'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, MapPin, MessageSquare, Phone, ReceiptText } from 'lucide-react';

import { OrderStatusTimeline } from '@/components/account/OrderStatusTimeline';
import { RepeatOrderButton } from '@/components/account/RepeatOrderButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { buildWhatsAppMessage } from '@/lib/orders/whatsapp-message';
import type { CustomerOrder, OrderStatus } from '@/types/orders';
import type { StoreConfiguration } from '@/types/operations';

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
  return Number.isNaN(date.getTime()) ? 'Fecha pendiente' : date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 403) return 'No tienes permiso para ver este pedido.';
  if (response.status === 404) return 'No encontramos este pedido.';
  return body.error || 'No pudimos cargar el detalle del pedido.';
}

export default function AccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configuration, setConfiguration] = useState<StoreConfiguration | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetch('/api/configuration').then(async (response) => {
      if (!response.ok || !active) return;
      const data = (await response.json()) as { configuration?: StoreConfiguration };
      if (active && data.configuration) setConfiguration(data.configuration);
    }).catch(() => undefined);
    void user.getIdToken().then(async (token) => {
      const response = await fetch(`/api/pedidos/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!active) return;
      if (!response.ok) setError(await responseError(response));
      else setOrder(((await response.json()) as { order: CustomerOrder }).order);
      setLoading(false);
    }).catch(() => {
      if (active) {
        setError('No pudimos conectar con la central de pedidos.');
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [id, user]);

  if (loading) return <div className="rounded-2xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">Cargando el detalle...</div>;
  if (error || !order) {
    return (
      <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
        <p role="alert" className="text-sm text-destructive">
          {error || 'Pedido no disponible.'}
        </p>
        <Button variant="outline" asChild>
          <Link href="/cuenta/pedidos">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a mis pedidos
          </Link>
        </Button>
      </div>
    );
  }

  const whatsappPhone = configuration?.whatsappNumber || '';
  const statusMessage = configuration?.messages.orderStatus.replace('{status}', statusLabels[order.status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cuenta/pedidos">
            <ArrowLeft className="mr-2 h-4 w-4" /> Mis pedidos
          </Link>
        </Button>
        <Badge
          variant="outline"
          className={order.status === 'cancelado' ? 'border-destructive/50 text-destructive' : 'border-accent/50 text-accent'}
        >
          {statusLabels[order.status]}
        </Badge>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Detalle de pedido</p>
        <h2 className="mt-1 font-headline text-2xl font-bold text-primary md:text-3xl">#{order.id}</h2>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> {formatDate(order.createdAt)}
        </p>
      </div>
      {statusMessage && <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm font-medium text-accent">{statusMessage}</p>}

      <Card className="border-primary/20 bg-card/80">
        <CardHeader className="border-b border-border/70 p-5 md:p-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ReceiptText className="h-5 w-5 text-primary" /> Productos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5 md:p-6">
          {order.items.map((item) => (
            <div key={`${item.productId}-${item.name}-${item.quantity}`} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
              <div className="flex justify-between gap-4 text-sm">
                <span className="font-semibold">
                  {item.quantity}x {item.name}
                </span>
                <span className="font-bold">${item.subtotal.toLocaleString('es-CO')}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.customization.size} · {item.customization.flavors.length ? item.customization.flavors.join(', ') : 'Sabor original'}
                {item.customization.addOns.length ? ` · ${item.customization.addOns.join(', ')}` : ''}
              </p>
            </div>
          ))}
          <div className="flex items-end justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-headline text-2xl font-bold text-primary">${order.total.toLocaleString('es-CO')}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-accent/20 bg-card/80">
        <CardHeader className="border-b border-border/70 p-5 md:p-6">
          <CardTitle className="text-lg text-accent">Seguimiento</CardTitle>
        </CardHeader>
        <CardContent className="p-5 md:p-6">
          <OrderStatusTimeline order={order} />
        </CardContent>
      </Card>

      <Card className="border-border bg-card/60">
        <CardHeader className="p-5 md:p-6">
          <CardTitle className="text-lg">Datos de entrega</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 pt-0 md:grid-cols-2 md:p-6 md:pt-0">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Dirección</p>
              <p className="mt-1 text-sm font-semibold">{order.address}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Phone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Teléfono</p>
              <p className="mt-1 text-sm font-semibold">{order.phone}</p>
            </div>
          </div>
          {order.notes && (
            <div className="md:col-span-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Indicaciones</p>
              <p className="mt-1 text-sm">{order.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <RepeatOrderButton
          items={order.items}
          orderId={order.id}
          className="rounded-xl bg-primary text-primary-foreground font-semibold shadow-md hover:opacity-90"
        />
        {whatsappPhone && (
          <Button asChild className="rounded-xl">
            <a href={buildWhatsAppMessage(order, whatsappPhone)} target="_blank" rel="noreferrer">
              <MessageSquare className="mr-2 h-4 w-4" /> Confirmar por WhatsApp
            </a>
          </Button>
        )}
        <Button variant="outline" asChild className="rounded-xl">
          <Link href="/menu">Seguir comprando</Link>
        </Button>
      </div>
    </div>
  );
}
