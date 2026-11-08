"use client";

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Package, MapPin, Clock, Home, MessageSquare } from 'lucide-react';
import { RepeatOrderButton } from '@/components/account/RepeatOrderButton';
import { OrderRatingCard } from '@/components/orders/OrderRatingCard';
import { useAuth } from '@/hooks/use-auth';
import { buildWhatsAppMessage } from '@/lib/orders/whatsapp-message';
import type { Order, OrderStatus } from '@/types/orders';
import type { StoreConfiguration } from '@/types/operations';

const statusSteps: Array<{ status: OrderStatus; title: string; description: string }> = [
  { status: 'pendiente', title: 'Pedido recibido', description: 'Hemos recibido tu solicitud.' },
  { status: 'confirmado', title: 'Pedido confirmado', description: 'La central confirmo tu pedido.' },
  { status: 'preparando', title: 'En preparacion', description: 'Estamos preparando tus bebidas.' },
  { status: 'en_camino', title: 'En camino', description: 'Un domiciliario lleva tu pedido.' },
  { status: 'entregado', title: 'Entregado', description: 'Disfruta tu pedido.' },
];

function statusLabel(status: OrderStatus): string {
  return status.replace('_', ' ');
}

export default function OrderStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configuration, setConfiguration] = useState<StoreConfiguration | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/order-status/${id}`)}`);
      return;
    }

    let active = true;
    void fetch('/api/configuration').then(async (response) => {
      if (!response.ok || !active) return;
      const data = await response.json() as { configuration?: StoreConfiguration };
      if (active && data.configuration) setConfiguration(data.configuration);
    }).catch(() => undefined);

    void user.getIdToken().then(async (token) => {
      const response = await fetch(`/api/pedidos/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!active) return;
      if (response.ok) {
        const data = await response.json() as { order: Order };
        setOrder(data.order);
      } else if (response.status === 401) {
        setError('Tu sesion expiro. Inicia sesion nuevamente.');
      } else if (response.status === 403) {
        setError('No tienes permiso para ver este pedido.');
      } else if (response.status === 404) {
        setError('No encontramos este pedido.');
      } else {
        setError('No pudimos cargar el estado del pedido.');
      }
      setLoading(false);
    }).catch(() => {
      if (active) {
        setError('No pudimos conectar con la central de pedidos.');
        setLoading(false);
      }
    });

    return () => { active = false; };
  }, [authLoading, id, router, user]);

  if (authLoading || !user || loading) {
    return <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4 text-muted-foreground">Consultando tu pedido...</div>;
  }

  if (error || !order) {
    return (
      <div className="container mx-auto flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p role="alert" className="text-lg font-bold text-destructive">{error || 'Pedido no disponible'}</p>
        <Button asChild className="rounded-full"><Link href="/menu">Volver al menu</Link></Button>
      </div>
    );
  }

  const currentIndex = statusSteps.findIndex((step) => step.status === order.status);
  const businessPhone = configuration?.whatsappNumber || '';
  const statusMessage = configuration?.messages.orderStatus.replace('{status}', statusLabel(order.status));

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-8 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-green-100 p-6"><CheckCircle2 className="h-20 w-20 text-green-600" /></div>
        </div>

        <div className="space-y-2">
           <h1 className="font-headline text-4xl font-bold text-primary">{configuration?.messages.orderReceived || 'Pedido recibido'}</h1>
           <p className="text-xl text-muted-foreground">{statusMessage || <>Tu orden <span className="font-bold text-foreground">#{order.id}</span> esta <span className="font-bold text-primary">{statusLabel(order.status)}</span>.</>}</p>
        </div>

        <Card className="overflow-hidden border-none bg-white text-left shadow-xl">
          <CardContent className="p-8">
            <h3 className="mb-6 flex items-center gap-2 text-lg font-bold"><Package className="h-5 w-5 text-primary" /> Estado del pedido</h3>
            <div className="relative space-y-8 before:absolute before:left-3 before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:bg-muted">
              {statusSteps.map((step, index) => {
                const complete = index <= currentIndex && order.status !== 'cancelado';
                return (
                  <div key={step.status} className="relative pl-10">
                    <div className={`absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border-4 border-white shadow-sm ${complete ? 'bg-primary' : 'bg-muted'}`} />
                    <h4 className={`text-sm font-bold ${complete ? 'text-foreground' : 'text-muted-foreground'}`}>{step.title}</h4>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                );
              })}
              {order.status === 'cancelado' && <p className="pl-10 text-sm font-bold text-destructive">Este pedido fue cancelado.</p>}
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 border-t pt-8 sm:grid-cols-2">
              <div className="space-y-1"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Total</div><p className="text-sm font-bold">${order.total.toLocaleString()}</p></div>
              <div className="space-y-1"><div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> Entrega en</div><p className="truncate text-sm font-bold">{order.address}</p></div>
            </div>
          </CardContent>
        </Card>

        {order.status === 'entregado' && (
          <OrderRatingCard
            orderId={order.id}
            initialRating={order.rating}
            onRatingSuccess={(newRating) => setOrder((prev) => (prev ? { ...prev, rating: newRating } : prev))}
          />
        )}

        <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row">
          <RepeatOrderButton
            items={order.items}
            orderId={order.id}
            className="rounded-full bg-primary text-primary-foreground font-semibold shadow-md hover:opacity-90"
          />
          {businessPhone && (
            <Button className="rounded-full" asChild>
              <a href={buildWhatsAppMessage(order, businessPhone)} target="_blank" rel="noreferrer">
                <MessageSquare className="mr-2 h-4 w-4" /> Confirmar por WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" /> Volver al inicio
            </Link>
          </Button>
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/menu">Seguir comprando</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
