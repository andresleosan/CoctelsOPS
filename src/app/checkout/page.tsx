
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
import { CheckCircle2, CreditCard, Wallet, Truck, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { getCheckoutErrorMessage } from '@/lib/checkout/messages';
import type { StoreConfiguration } from '@/types/operations';

export default function CheckoutPage() {
  const { totalPrice, items, clearCart, getCheckoutItems } = useCart();
  const { user, loading: authLoading, isVerified } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const idempotencyKey = useRef<string | null>(null);
  const [configuration, setConfiguration] = useState<StoreConfiguration | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: ''
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
    void fetch('/api/configuration').then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { configuration?: StoreConfiguration };
      if (data.configuration) setConfiguration(data.configuration);
    }).catch(() => undefined);
  }, []);

  if (authLoading || !user || !isVerified) {
    return <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4 text-muted-foreground">Verificando tu acceso...</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const token = await user.getIdToken();
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey.current },
        body: JSON.stringify({
          customerName: formData.name,
          phone: formData.phone,
          address: formData.address,
          notes: formData.notes,
          items: getCheckoutItems(),
        }),
      });

      if (response.ok) {
        const data = await response.json() as { order?: { id: string } };
        if (!data.order?.id) throw new Error('La respuesta del pedido no es valida');
        clearCart();
        router.push(`/order-status/${data.order.id}`);
        return;
      }

      const body = await response.json().catch(() => ({})) as { error?: string };
      idempotencyKey.current = null;
      setSubmitError(getCheckoutErrorMessage(response.status, body.error, configuration?.messages.unavailable ?? 'No pudimos procesar el pedido.'));
    } catch {
      setSubmitError(getCheckoutErrorMessage(undefined, undefined, configuration?.messages.unavailable ?? 'No pudimos procesar el pedido.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 md:py-16">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link href="/cart"><ArrowLeft className="w-6 h-6" /></Link>
          </Button>
          <h1 className="text-2xl md:text-5xl font-headline font-bold uppercase tracking-tighter neon-text-magenta">Finalizar Pedido</h1>
        </div>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          <div className="space-y-6">
            <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm border border-primary/10">
              <CardHeader className="p-5 md:p-6">
                <CardTitle className="flex items-center gap-2 text-primary font-bold text-base md:text-lg uppercase">
                  <Truck className="w-5 h-5" /> Datos de Entrega
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 md:p-6 pt-0 md:pt-0 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nombre Completo</Label>
                  <Input 
                    id="name" 
                    required 
                    placeholder="Ej: Juan Pérez" 
                    className="bg-background/50 h-12 rounded-xl"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Teléfono de Contacto</Label>
                  <Input 
                    id="phone" 
                    required 
                    type="tel"
                    placeholder="Ej: 324 555 0000" 
                    className="bg-background/50 h-12 rounded-xl"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Dirección Exacta</Label>
                  <Input 
                    id="address" 
                    required 
                    placeholder="Ej: Carrera 37 # 66-36" 
                    className="bg-background/50 h-12 rounded-xl"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Indicaciones adicionales</Label>
                  <Textarea 
                    id="notes" 
                    placeholder="Ej: Piso 3, al lado del parque..." 
                    className="bg-background/50 rounded-xl min-h-[100px]"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
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
                    <div key={item.id} className="flex justify-between items-center text-sm md:text-base border-b border-white/10 pb-2">
                      <span className="font-light">{item.quantity}x {item.name}</span>
                      <span className="font-bold">${(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-end pt-4">
                  <span className="text-base md:text-lg opacity-80">Total a Pagar</span>
                  <span className="font-black text-3xl md:text-5xl">${totalPrice.toLocaleString()}</span>
                </div>
                
                {configuration && <div className="space-y-4 py-2">
                  <div className="flex items-center gap-3 text-sm font-bold">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                    <p>Entrega estimada: {configuration.estimatedDeliveryMinutes} min</p>
                  </div>
                </div>}

                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full bg-white text-primary hover:bg-white/90 font-black py-7 md:py-10 text-xl md:text-2xl rounded-full shadow-2xl transition-all active:scale-95"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'PROCESANDO...' : 'CONFIRMAR PEDIDO'}
                </Button>
                {submitError && <p role="alert" className="text-center text-sm font-bold text-white">{submitError}</p>}
                <p className="text-[10px] text-center text-white/50 uppercase tracking-[0.2em] font-bold">Al confirmar aceptas los términos</p>
              </CardContent>
            </Card>
          </div>
        </form>
      </div>
    </div>
  );
}
