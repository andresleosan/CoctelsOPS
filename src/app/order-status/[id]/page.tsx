"use client";

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Package, MapPin, Clock, Home, MessageSquare, Landmark, Upload, ExternalLink } from 'lucide-react';
import { RepeatOrderButton } from '@/components/account/RepeatOrderButton';
import { OnlinePaymentGatewayCard } from '@/components/orders/OnlinePaymentGatewayCard';
import { OrderRatingCard } from '@/components/orders/OrderRatingCard';
import { PushSubscriptionBanner } from '@/components/notifications/PushSubscriptionBanner';
import { playOrderNotificationSound, triggerLocalNotification } from '@/lib/notifications/web-push';
import {
  PAYMENT_VERIFICATION_META,
  getEffectivePaymentVerificationStatus,
  isDigitalTransferMethod,
  validateClientProofFile,
} from '@/lib/orders/payment-verification';
import { useAuth } from '@/hooks/use-auth';
import { buildWhatsAppMessage } from '@/lib/orders/whatsapp-message';
import type {
  OnlinePaymentGatewayOption,
  Order,
  OrderStatus,
  PaymentGatewayProvider,
} from '@/types/orders';
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
  const [availableGateways, setAvailableGateways] = useState<OnlinePaymentGatewayOption[]>([]);
  const [paymentReturnProvider, setPaymentReturnProvider] = useState<PaymentGatewayProvider | null>(null);
  const [paymentInitErrorBanner, setPaymentInitErrorBanner] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [proofUploadErrorBanner, setProofUploadErrorBanner] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofFeedback, setProofFeedback] = useState('');
  const [proofError, setProofError] = useState('');
  const previousStatusRef = useRef<OrderStatus | null>(null);
  const configurationRef = useRef<StoreConfiguration | null>(null);
  const fastPollCyclesRef = useRef(0);

  useEffect(() => {
    configurationRef.current = configuration;
  }, [configuration]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('proofUploadError') === '1') {
        setProofUploadErrorBanner(true);
      }
      if (searchParams.get('paymentInitError') === '1') {
        setPaymentInitErrorBanner(true);
      }
      if (searchParams.get('paymentReturn') === '1') {
        const rawProvider = searchParams.get('provider')?.trim().toLowerCase();
        setPaymentReturnProvider(rawProvider === 'bold' ? 'bold' : 'wompi');
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshOrder = useCallback(
    async (options: { notifyOnChange?: boolean; manual?: boolean } = {}) => {
      if (!user) return;
      if (options.manual) setRefreshingStatus(true);
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/pedidos/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          if (response.status === 401) {
            setError('Tu sesion expiro. Inicia sesion nuevamente.');
          } else if (response.status === 403) {
            setError('No tienes permiso para ver este pedido.');
          } else if (response.status === 404) {
            setError('No encontramos este pedido.');
          } else {
            setError('No pudimos cargar el estado del pedido.');
          }
          return;
        }
        const data = (await response.json()) as { order: Order };
        if (data.order) {
          if (
            options.notifyOnChange &&
            previousStatusRef.current &&
            previousStatusRef.current !== data.order.status
          ) {
            playOrderNotificationSound();
            void triggerLocalNotification(
              `¡Tu pedido #${data.order.id.slice(0, 8)} ahora está ${statusLabel(data.order.status)}!`,
              {
                body:
                  configurationRef.current?.messages.orderStatus.replace(
                    '{status}',
                    statusLabel(data.order.status),
                  ) || `Tu orden cambió a estado ${statusLabel(data.order.status)}.`,
                tag: `order-${data.order.id}`,
              },
            );
          }
          previousStatusRef.current = data.order.status;
          setOrder(data.order);
        }
      } catch {
        if (!options.notifyOnChange && !options.manual) {
          setError('No pudimos conectar con la central de pedidos.');
        }
      } finally {
        if (options.manual) setRefreshingStatus(false);
      }
    },
    [id, user],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/order-status/${id}`)}`);
      return;
    }

    let active = true;
    void fetch('/api/configuration')
      .then(async (response) => {
        if (!response.ok || !active) return;
        const data = (await response.json()) as { configuration?: StoreConfiguration };
        if (active && data.configuration) setConfiguration(data.configuration);
      })
      .catch(() => undefined);

    void fetch('/api/payments/checkout-session')
      .then(async (response) => {
        if (!response.ok || !active) return;
        const data = (await response.json().catch(() => ({}))) as {
          gateways?: OnlinePaymentGatewayOption[];
        };
        if (active && Array.isArray(data.gateways)) {
          setAvailableGateways(data.gateways);
        }
      })
      .catch(() => undefined);

    void refreshOrder().finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [authLoading, id, refreshOrder, router, user]);

  // Polling reactivo en tiempo real para estados en progreso y retorno de pasarela online
  useEffect(() => {
    if (!user || !order) return;
    const isTerminal = order.status === 'entregado' || order.status === 'cancelado';
    if (isTerminal) return;

    const effectiveVerif = getEffectivePaymentVerificationStatus(order);
    const shouldFastPoll =
      Boolean(paymentReturnProvider) &&
      effectiveVerif !== 'verificado' &&
      effectiveVerif !== 'rechazado' &&
      fastPollCyclesRef.current < 15;
    const pollMs = shouldFastPoll ? 3000 : 10000;

    const interval = setInterval(() => {
      if (shouldFastPoll) {
        fastPollCyclesRef.current += 1;
      }
      void refreshOrder({ notifyOnChange: true });
    }, pollMs);

    return () => {
      clearInterval(interval);
    };
  }, [order, paymentReturnProvider, refreshOrder, user]);

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
  const verificationStatus = getEffectivePaymentVerificationStatus(order);
  const showTransferPaymentCard =
    isDigitalTransferMethod(order.paymentMethod) ||
    Boolean(order.paymentProof) ||
    verificationStatus !== null;
  const activeVerificationStatus = verificationStatus ?? 'pendiente_verificacion';
  const verificationMeta = PAYMENT_VERIFICATION_META[activeVerificationStatus];
  const canUploadProof =
    order.status !== 'cancelado' && activeVerificationStatus !== 'verificado';
  const showOnlineGatewayCard =
    (availableGateways.length > 0 &&
      order.status !== 'cancelado' &&
      order.status !== 'entregado' &&
      activeVerificationStatus !== 'verificado') ||
    Boolean(order.paymentGateway) ||
    Boolean(paymentReturnProvider) ||
    paymentInitErrorBanner;

  const handleUploadProof = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file || !user || !order) return;

    const validationError = validateClientProofFile(file);
    if (validationError) {
      setProofError(validationError);
      setProofFeedback('');
      event.target.value = '';
      return;
    }

    setUploadingProof(true);
    setProofError('');
    setProofFeedback('');
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('comprobante', file);
      if (isDigitalTransferMethod(order.paymentMethod)) {
        formData.append('channel', order.paymentMethod);
      }
      if (order.paymentBreakdown?.digitalReference) {
        formData.append('reference', order.paymentBreakdown.digitalReference);
      }
      const response = await fetch(`/api/pedidos/${encodeURIComponent(order.id)}/comprobante`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };
      if (!response.ok || !data.order) {
        throw new Error(data.error ?? 'No pudimos subir tu comprobante.');
      }
      setOrder(data.order);
      setProofUploadErrorBanner(false);
      setProofFeedback('¡Comprobante recibido! Nuestro equipo lo verificará en breve.');
    } catch (uploadError) {
      setProofError(
        uploadError instanceof Error ? uploadError.message : 'Error de conexión al subir el comprobante.',
      );
    } finally {
      setUploadingProof(false);
      event.target.value = '';
    }
  };

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

        <PushSubscriptionBanner orderId={id} className="text-left" />

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
              {order.deliveryZoneName && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">Zona de cobertura</div>
                  <p className="text-sm font-bold">
                    {order.deliveryZoneName}
                    {typeof order.deliveryFee === 'number' && (
                      <span className="ml-1.5 text-xs font-semibold text-primary">
                        ({order.deliveryFee === 0 ? 'Domicilio gratis' : `+$${order.deliveryFee.toLocaleString('es-CO')}`})
                      </span>
                    )}
                  </p>
                </div>
              )}
              {order.assignedDriver?.name && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">Domiciliario asignado</div>
                  <p className="text-sm font-bold text-primary">{order.assignedDriver.name}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {showOnlineGatewayCard && (
          <OnlinePaymentGatewayCard
            order={order}
            gateways={availableGateways}
            getIdToken={() => user.getIdToken()}
            paymentReturnProvider={paymentReturnProvider}
            paymentInitError={paymentInitErrorBanner}
            isRefreshingStatus={refreshingStatus}
            onRefreshStatus={() => refreshOrder({ manual: true })}
          />
        )}

        {showTransferPaymentCard && (
          <Card className="overflow-hidden border border-slate-200 bg-white text-left shadow-lg">
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Landmark className="h-5 w-5 text-cyan-700" /> Estado de Pago por Transferencia
                </h3>
                <Badge variant="outline" className={verificationMeta.adminBadgeClass}>
                  {verificationMeta.label}
                </Badge>
              </div>

              {proofUploadErrorBanner && (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
                  Tu pedido fue creado, pero la captura del comprobante no alcanzó a subirse. Puedes adjuntarla aquí ahora.
                </div>
              )}

              {activeVerificationStatus === 'rechazado' && order.paymentVerification?.reason && (
                <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
                  Motivo: {order.paymentVerification.reason}
                </div>
              )}

              {order.paymentProof?.url && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <Image
                      src={order.paymentProof.url}
                      alt="Comprobante de transferencia adjunto"
                      width={96}
                      height={96}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-bold text-slate-900">Comprobante cargado</p>
                    {order.paymentProof.reference && (
                      <p className="text-xs text-slate-600">Ref: {order.paymentProof.reference}</p>
                    )}
                    <a
                      href={order.paymentProof.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-cyan-700 hover:underline"
                    >
                      Ver captura <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {proofFeedback && (
                <p role="status" className="text-xs font-semibold text-emerald-700">
                  {proofFeedback}
                </p>
              )}
              {proofError && (
                <p role="alert" className="text-xs font-semibold text-rose-700">
                  {proofError}
                </p>
              )}

              {canUploadProof && (
                <div>
                  <input
                    id="orderStatusProofInput"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingProof}
                    onChange={(e) => void handleUploadProof(e)}
                    className="sr-only"
                  />
                  <label
                    htmlFor="orderStatusProofInput"
                    className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-600 bg-cyan-50 px-4 py-2.5 text-sm font-bold text-cyan-950 transition-colors hover:bg-cyan-100"
                  >
                    <Upload className="h-4 w-4 text-cyan-700" />
                    {uploadingProof
                      ? 'Subiendo comprobante...'
                      : order.paymentProof?.url
                        ? 'Reemplazar comprobante de pago'
                        : 'Adjuntar comprobante de pago'}
                  </label>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
