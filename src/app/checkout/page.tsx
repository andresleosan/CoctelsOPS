'use client';

import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/context/cart-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CreditCard, Wallet, Truck, ArrowLeft, UtensilsCrossed, GlassWater } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { getCheckoutErrorMessage } from '@/lib/checkout/messages';
import type { StoreConfiguration } from '@/types/operations';
import type { ServiceType } from '@/types/orders';

export default function CheckoutPage() {
  const { totalPrice, items, clearCart, getCheckoutItems } = useCart();
  const { user, loading: authLoading, isVerified } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const idempotencyKey = useRef<string | null>(null);
  const [configuration, setConfiguration] = useState<StoreConfiguration | null>(null);

  const [serviceType, setServiceType] = useState<ServiceType>('delivery');
  const [tableNumber, setTableNumber] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace('/login?redirect=%2Fcheckout');
    } else if (!isVerified) {
      router.replace('/verificar-email');
    }
  }, [authLoading, isVerified, router, user]);

  useEffect(() => {
    void fetch('/api/configuration')
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { configuration?: StoreConfiguration };
        if (data.configuration) setConfiguration(data.configuration);
      })
      .catch(() => undefined);
  }, []);

  // Detectar ?mesa=X en URL o en sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramMesa = urlParams.get('mesa')?.trim();
      const storedMesa = window.sessionStorage.getItem('coctels_ops_service_mesa')?.trim();
      const rawMesa = paramMesa || storedMesa;

      if (rawMesa) {
        const isBarra = rawMesa.toLowerCase() === 'barra' || rawMesa.toLowerCase() === 'recoger en barra';
        if (isBarra) {
          setServiceType('pickup');
        } else {
          setServiceType('mesa');
          const cleanTable = rawMesa.toLowerCase().startsWith('mesa')
            ? rawMesa.replace(/^mesa\s*/i, '')
            : rawMesa;
          setTableNumber(cleanTable);
        }
      }
    } catch {
      // sessionStorage restringido
    }
  }, []);

  if (authLoading || !user || !isVerified) {
    return (
      <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4 text-muted-foreground">
        Verificando tu acceso...
      </div>
    );
  }

  const getEffectiveAddress = () => {
    if (serviceType === 'mesa') {
      const cleanTable = tableNumber.trim();
      if (!cleanTable) return 'Mesa - Consumo en local';
      return cleanTable.toLowerCase().startsWith('mesa')
        ? `${cleanTable} - Consumo en local`
        : `Mesa ${cleanTable} - Consumo en local`;
    }
    if (serviceType === 'pickup') {
      return 'Recoger en Barra - Consumo en local';
    }
    return formData.address.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const token = await user.getIdToken();
      idempotencyKey.current ??= crypto.randomUUID();
      const effectiveAddress = getEffectiveAddress();

      const response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
          'idempotency-key': idempotencyKey.current,
        },
        body: JSON.stringify({
          customerName: formData.name,
          phone: formData.phone,
          address: effectiveAddress,
          serviceType,
          tableNumber: serviceType === 'mesa' ? tableNumber.trim() : undefined,
          notes: formData.notes,
          items: getCheckoutItems(),
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { order?: { id: string } };
        if (!data.order?.id) throw new Error('La respuesta del pedido no es valida');

        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('coctels_ops_service_mesa');
            window.sessionStorage.removeItem('coctels_ops_service_type');
          }
        } catch {
          // ignore
        }

        clearCart();
        router.push(`/order-status/${data.order.id}`);
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      idempotencyKey.current = null;
      setSubmitError(
        getCheckoutErrorMessage(
          response.status,
          body.error,
          configuration?.messages.unavailable ?? 'No pudimos procesar el pedido.'
        )
      );
    } catch {
      setSubmitError(
        getCheckoutErrorMessage(
          undefined,
          undefined,
          configuration?.messages.unavailable ?? 'No pudimos procesar el pedido.'
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 md:py-16">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link href="/cart">
              <ArrowLeft className="w-6 h-6" />
            </Link>
          </Button>
          <h1 className="text-2xl md:text-5xl font-headline font-bold uppercase tracking-tighter neon-text-magenta">
            Finalizar Pedido
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          <div className="space-y-6">
            {/* Modalidad de Servicio (Mobile-First 1-Tap) */}
            <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm border border-primary/20">
              <CardHeader className="p-5 md:p-6 pb-3">
                <CardTitle className="text-sm md:text-base font-bold uppercase tracking-wider text-primary">
                  Modalidad de Pedido
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 md:p-6 pt-0 space-y-3">
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Modalidad de pedido">
                  <button
                    type="button"
                    onClick={() => setServiceType('mesa')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all min-h-[58px] ${
                      serviceType === 'mesa'
                        ? 'border-primary bg-primary/20 text-white font-bold shadow-[0_0_15px_rgba(229,25,110,0.3)]'
                        : 'border-white/10 bg-background/50 text-muted-foreground hover:bg-white/5'
                    }`}
                  >
                    <UtensilsCrossed className="w-5 h-5 mb-1 text-primary" />
                    <span className="text-xs">En Mesa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setServiceType('pickup')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all min-h-[58px] ${
                      serviceType === 'pickup'
                        ? 'border-cyan-500 bg-cyan-500/20 text-white font-bold shadow-[0_0_15px_rgba(0,188,212,0.3)]'
                        : 'border-white/10 bg-background/50 text-muted-foreground hover:bg-white/5'
                    }`}
                  >
                    <GlassWater className="w-5 h-5 mb-1 text-cyan-400" />
                    <span className="text-xs">En Barra</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setServiceType('delivery')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all min-h-[58px] ${
                      serviceType === 'delivery'
                        ? 'border-emerald-500 bg-emerald-500/20 text-white font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                        : 'border-white/10 bg-background/50 text-muted-foreground hover:bg-white/5'
                    }`}
                  >
                    <Truck className="w-5 h-5 mb-1 text-emerald-400" />
                    <span className="text-xs">Domicilio</span>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Datos de Entrega y Cliente */}
            <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm border border-primary/10">
              <CardHeader className="p-5 md:p-6">
                <CardTitle className="flex items-center gap-2 text-primary font-bold text-base md:text-lg uppercase">
                  {serviceType === 'mesa' && <UtensilsCrossed className="w-5 h-5" />}
                  {serviceType === 'pickup' && <GlassWater className="w-5 h-5" />}
                  {serviceType === 'delivery' && <Truck className="w-5 h-5" />}
                  {serviceType === 'mesa'
                    ? 'Servicio en Mesa'
                    : serviceType === 'pickup'
                    ? 'Retiro en Barra'
                    : 'Datos de Entrega'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 md:p-6 pt-0 md:pt-0 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Nombre Completo
                  </Label>
                  <Input
                    id="name"
                    required
                    placeholder="Ej: Juan Pérez"
                    className="bg-background/50 h-12 rounded-xl"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Teléfono de Contacto
                  </Label>
                  <Input
                    id="phone"
                    required
                    type="tel"
                    placeholder="Ej: 324 555 0000"
                    className="bg-background/50 h-12 rounded-xl"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                {serviceType === 'mesa' && (
                  <div className="space-y-1.5 animate-in fade-in duration-200">
                    <Label
                      htmlFor="tableNumber"
                      className="text-xs font-bold uppercase tracking-widest text-primary"
                    >
                      Número o Identificador de Mesa *
                    </Label>
                    <Input
                      id="tableNumber"
                      required
                      placeholder="Ej: 4 (o Mesa 4, Terraza 2)"
                      className="bg-background/50 h-12 rounded-xl border-primary/40 focus:border-primary"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Llevaremos tu orden directamente a tu mesa sin recargo de entrega.
                    </p>
                  </div>
                )}

                {serviceType === 'pickup' && (
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5 text-xs text-cyan-200 animate-in fade-in duration-200">
                    <p className="font-bold flex items-center gap-1.5 text-cyan-400">
                      <GlassWater className="w-4 h-4" /> Retiro en Barra Principal
                    </p>
                    <p className="mt-1 text-slate-300">
                      Tus bebidas se prepararán en la estación de coctelería y te llamaremos cuando estén listas.
                    </p>
                  </div>
                )}

                {serviceType === 'delivery' && (
                  <div className="space-y-1.5 animate-in fade-in duration-200">
                    <Label
                      htmlFor="address"
                      className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                    >
                      Dirección Exacta *
                    </Label>
                    <Input
                      id="address"
                      required
                      placeholder="Ej: Carrera 37 # 66-36"
                      className="bg-background/50 h-12 rounded-xl"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Indicaciones adicionales
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder={
                      serviceType === 'mesa'
                        ? 'Ej: Sin pitillo, servilletas extra...'
                        : serviceType === 'pickup'
                        ? 'Ej: Para llevar o consumir de inmediato...'
                        : 'Ej: Piso 3, al lado del parque...'
                    }
                    className="bg-background/50 rounded-xl min-h-[100px]"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-card/60 border border-primary/10">
              <CardHeader className="p-5 md:p-6">
                <CardTitle className="flex items-center gap-2 text-primary font-bold text-base md:text-lg uppercase">
                  <CreditCard className="w-5 h-5" /> Método de Pago
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 md:p-6 pt-0 md:pt-0">
                <RadioGroup defaultValue="cash" className="space-y-3">
                  <div className="flex items-center space-x-3 border border-primary/20 p-5 rounded-2xl hover:bg-primary/5 cursor-pointer transition-colors">
                    <RadioGroupItem value="cash" id="cash" className="border-primary text-primary" />
                    <Label htmlFor="cash" className="flex items-center gap-3 flex-grow cursor-pointer font-bold text-sm">
                      <Wallet className="w-6 h-6 text-primary" /> EFECTIVO CONTRA ENTREGA
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-none shadow-2xl bg-primary text-white sticky top-24 neon-shadow-magenta overflow-hidden rounded-[2rem]">
              <CardHeader className="p-6 md:p-8">
                <CardTitle className="text-xl md:text-2xl font-headline uppercase tracking-tight">Resumen OPS</CardTitle>
              </CardHeader>
              <CardContent className="p-6 md:p-8 pt-0 md:pt-0 space-y-8">
                <div className="space-y-4">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center text-sm md:text-base border-b border-white/10 pb-2"
                    >
                      <span className="font-light">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="font-bold">${(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-end pt-4">
                  <span className="text-base md:text-lg opacity-80">Total a Pagar</span>
                  <span className="font-black text-3xl md:text-5xl">${totalPrice.toLocaleString()}</span>
                </div>

                {serviceType === 'mesa' && (
                  <div className="space-y-2 py-2 border-t border-white/10">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <UtensilsCrossed className="w-4 h-4 flex-shrink-0 text-cyan-300" />
                      <p>Servicio: Mesa {tableNumber ? tableNumber : '(Por definir)'}</p>
                    </div>
                  </div>
                )}

                {serviceType === 'pickup' && (
                  <div className="space-y-2 py-2 border-t border-white/10">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <GlassWater className="w-4 h-4 flex-shrink-0 text-cyan-300" />
                      <p>Servicio: Recoger en barra</p>
                    </div>
                  </div>
                )}

                {serviceType === 'delivery' && configuration && (
                  <div className="space-y-4 py-2">
                    <div className="flex items-center gap-3 text-sm font-bold">
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                      <p>Entrega estimada: {configuration.estimatedDeliveryMinutes} min</p>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-white text-primary hover:bg-white/90 font-black py-7 md:py-10 text-xl md:text-2xl rounded-full shadow-2xl transition-all active:scale-95"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'PROCESANDO...' : 'CONFIRMAR PEDIDO'}
                </Button>
                {submitError && (
                  <p role="alert" className="text-center text-sm font-bold text-white">
                    {submitError}
                  </p>
                )}
                <p className="text-[10px] text-center text-white/50 uppercase tracking-[0.2em] font-bold">
                  Al confirmar aceptas los términos
                </p>
              </CardContent>
            </Card>
          </div>
        </form>
      </div>
    </div>
  );
}
