'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useCart } from '@/context/cart-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useRouter } from 'next/navigation';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Wallet,
  Truck,
  ArrowLeft,
  UtensilsCrossed,
  GlassWater,
  Gift,
  Landmark,
  Sparkles,
  TicketPercent,
  Trash2,
  Upload,
  X,
  Flame,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { getCheckoutErrorMessage } from '@/lib/checkout/messages';
import {
  calculateDeliveryQuote,
  hasConfiguredDynamicZones,
  resolveDeliveryZones,
} from '@/lib/orders/delivery-zones';
import { validateClientProofFile } from '@/lib/orders/payment-verification';
import { LOYALTY_REWARDS, type LoyaltyRewardId, type LoyaltySummary } from '@/types/loyalty';
import type { StoreConfiguration } from '@/types/operations';
import type { ServiceType } from '@/types/orders';

type AppliedPromotion = {
  code: string;
  discount: number;
  subtotal: number;
  total: number;
  title?: string;
  isHappyHour?: boolean;
};

type TransferChannel = 'nequi' | 'daviplata' | 'transferencia';

const TRANSFER_CHANNELS: ReadonlyArray<{ id: TransferChannel; label: string }> = [
  { id: 'nequi', label: 'Nequi' },
  { id: 'daviplata', label: 'Daviplata' },
  { id: 'transferencia', label: 'Bancolombia / Transferencia' },
];

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
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [zoneError, setZoneError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [transferChannel, setTransferChannel] = useState<TransferChannel>('nequi');
  const [transferReference, setTransferReference] = useState('');
  const [copiedTransferNumber, setCopiedTransferNumber] = useState(false);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [paymentProofError, setPaymentProofError] = useState('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  const [promotionInput, setPromotionInput] = useState('');
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [appliedPromotion, setAppliedPromotion] = useState<AppliedPromotion | null>(null);
  const [loyaltySummary, setLoyaltySummary] = useState<LoyaltySummary | null>(null);
  const [selectedRewardId, setSelectedRewardId] = useState<LoyaltyRewardId | null>(null);
  const userDismissedPromo = useRef<boolean>(false);
  const hasAutoCheckedPromo = useRef<boolean>(false);

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

  useEffect(() => {
    if (!user || !isVerified) return;
    let active = true;

    const loadLoyalty = async () => {
      try {
        const token = typeof user.getIdToken === 'function' ? await user.getIdToken() : '';
        const response = await fetch('/api/loyalty', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) return;
        const data = (await response.json()) as { loyalty?: LoyaltySummary };
        if (active && data.loyalty) {
          setLoyaltySummary(data.loyalty);
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const rewardParam = urlParams.get('reward')?.trim().toUpperCase() as LoyaltyRewardId | undefined;
            const match = LOYALTY_REWARDS.find((r) => r.id === rewardParam);
            if (match && data.loyalty.availablePoints >= match.pointsCost) {
              setSelectedRewardId(match.id);
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    };

    void loadLoyalty();
    return () => {
      active = false;
    };
  }, [isVerified, user]);

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

  // Auto-detección y aplicación de Happy Hour activo sin forzar a tipear código manual
  useEffect(() => {
    if (!user || !isVerified || appliedPromotion || userDismissedPromo.current || hasAutoCheckedPromo.current) return;
    const checkoutItems = getCheckoutItems();
    if (checkoutItems.length === 0) return;

    hasAutoCheckedPromo.current = true;
    let isMounted = true;
    const checkActiveHappyHour = async () => {
      try {
        const res = await fetch('/api/promotions/active');
        if (!res.ok) return;
        const data = (await res.json()) as { activeHappyHours?: Array<{ code: string; title?: string }> };
        const activePromo = data.activeHappyHours?.[0];
        if (!activePromo || !isMounted || userDismissedPromo.current) return;

        const token = typeof user.getIdToken === 'function' ? await user.getIdToken() : '';
        const validateRes = await fetch('/api/promotions/validate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            code: activePromo.code,
            items: checkoutItems,
          }),
        });

        if (!validateRes.ok || !isMounted) return;
        const valData = (await validateRes.json().catch(() => ({}))) as {
          applied?: boolean;
          code?: string;
          discount?: number;
          subtotal?: number;
          total?: number;
          title?: string;
        };

        if (valData.applied && valData.code && typeof valData.discount === 'number' && isMounted && !userDismissedPromo.current) {
          setAppliedPromotion({
            code: valData.code,
            discount: valData.discount,
            subtotal: typeof valData.subtotal === 'number' ? valData.subtotal : totalPrice,
            total: typeof valData.total === 'number' ? valData.total : Math.max(0, totalPrice - valData.discount),
            title: valData.title || activePromo.title,
            isHappyHour: true,
          });
          setPromotionInput(valData.code);
        }
      } catch {
        // Silencioso en caso de error de red
      }
    };

    void checkActiveHappyHour();
    return () => {
      isMounted = false;
    };
  }, [user, isVerified, appliedPromotion, getCheckoutItems, totalPrice]);

  useEffect(() => {
    return () => {
      if (
        paymentProofPreview &&
        paymentProofPreview.startsWith('blob:') &&
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        URL.revokeObjectURL(paymentProofPreview);
      }
    };
  }, [paymentProofPreview]);

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

  const handleApplyPromotion = async () => {
    const cleanCode = promotionInput.trim().toUpperCase();
    if (!cleanCode) {
      setPromoError('Ingresa un código promocional.');
      return;
    }

    const checkoutItems = getCheckoutItems();
    if (checkoutItems.length === 0) {
      setPromoError('Agrega productos al carrito antes de validar un cupón.');
      return;
    }

    setIsValidatingPromo(true);
    setPromoError('');
    userDismissedPromo.current = false;

    try {
      const token = typeof user.getIdToken === 'function' ? await user.getIdToken() : '';
      const response = await fetch('/api/promotions/validate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          code: cleanCode,
          items: checkoutItems,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        applied?: boolean;
        code?: string;
        discount?: number;
        subtotal?: number;
        total?: number;
        error?: string;
      };

      if (response.ok && data.applied && data.code && typeof data.discount === 'number') {
        setAppliedPromotion({
          code: data.code,
          discount: data.discount,
          subtotal: typeof data.subtotal === 'number' ? data.subtotal : totalPrice,
          total: typeof data.total === 'number' ? data.total : Math.max(0, totalPrice - data.discount),
        });
        setPromotionInput(data.code);
        idempotencyKey.current = null;
        return;
      }

      setAppliedPromotion(null);
      setPromoError(data.error ?? 'No fue posible aplicar este código promocional.');
    } catch {
      setAppliedPromotion(null);
      setPromoError('Error de conexión al validar el cupón. Intenta nuevamente.');
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const handleRemovePromotion = () => {
    userDismissedPromo.current = true;
    setAppliedPromotion(null);
    setPromotionInput('');
    setPromoError('');
    idempotencyKey.current = null;
  };

  const effectiveDiscount = appliedPromotion ? Math.min(appliedPromotion.discount, totalPrice) : 0;
  const subtotalAfterPromo = Math.max(0, totalPrice - effectiveDiscount);
  const availableLoyaltyPoints = loyaltySummary?.availablePoints ?? 0;
  const selectedReward = selectedRewardId
    ? LOYALTY_REWARDS.find(
        (reward) =>
          reward.id === selectedRewardId &&
          availableLoyaltyPoints >= reward.pointsCost &&
          subtotalAfterPromo >= reward.minSubtotalCop
      ) ?? null
    : null;
  const loyaltyDiscount = selectedReward
    ? Math.min(selectedReward.maxDiscountCop, subtotalAfterPromo)
    : 0;
  const activeDeliveryZones = resolveDeliveryZones(configuration);
  const hasDynamicZoneRates = hasConfiguredDynamicZones(configuration);
  const selectedZone =
    activeDeliveryZones.find((zone) => zone.id === selectedZoneId) ??
    (activeDeliveryZones.length === 1 ? activeDeliveryZones[0] : null);
  const deliveryQuote = calculateDeliveryQuote({
    serviceType,
    zone: selectedZone,
    subtotalCop: totalPrice,
    fallbackEstimatedMinutes: configuration?.estimatedDeliveryMinutes,
  });
  const finalTotal = Math.max(0, subtotalAfterPromo - loyaltyDiscount) + deliveryQuote.feeCop;
  const estimatedPointsEarned = Math.max(0, Math.floor(finalTotal / 1000));
  const selectedTransferChannelLabel =
    TRANSFER_CHANNELS.find((channel) => channel.id === transferChannel)?.label ?? 'Transferencia';

  const handleCopyTransferNumber = async () => {
    const numberToCopy = configuration?.whatsappNumber?.trim();
    if (!numberToCopy) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(numberToCopy);
      }
    } catch {
      // Fallback silencioso si clipboard no está disponible
    }
    setCopiedTransferNumber(true);
    setTimeout(() => setCopiedTransferNumber(false), 2200);
  };

  const handleProofFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;

    const validationError = validateClientProofFile(selectedFile);
    if (validationError) {
      setPaymentProofError(validationError);
      event.target.value = '';
      return;
    }

    setPaymentProofError('');
    setPaymentProofFile(selectedFile);
    const previewUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(selectedFile)
        : null;
    setPaymentProofPreview(previewUrl);
  };

  const handleRemoveProofFile = () => {
    setPaymentProofFile(null);
    setPaymentProofPreview(null);
    setPaymentProofError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (
      serviceType === 'delivery' &&
      hasDynamicZoneRates &&
      activeDeliveryZones.length > 1 &&
      !selectedZone
    ) {
      setZoneError('Selecciona tu zona o barrio de entrega para calcular el domicilio.');
      return;
    }

    setZoneError('');
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const token = typeof user.getIdToken === 'function' ? await user.getIdToken() : '';
      idempotencyKey.current ??= crypto.randomUUID();
      const effectiveAddress = getEffectiveAddress();
      const cleanReference = transferReference.trim();

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
          ...(serviceType === 'delivery' && selectedZone
            ? {
                deliveryZoneId: selectedZone.id,
                deliveryZoneName: selectedZone.name,
              }
            : {}),
          notes: formData.notes,
          items: getCheckoutItems(),
          paymentMethod: paymentMethod === 'transferencia' ? transferChannel : 'efectivo',
          ...(paymentMethod === 'transferencia'
            ? {
                paymentBreakdown: {
                  cashAmount: 0,
                  cashReceived: 0,
                  changeAmount: 0,
                  digitalAmount: finalTotal,
                  digitalMethod: transferChannel,
                  ...(cleanReference ? { digitalReference: cleanReference } : {}),
                },
              }
            : {}),
          ...(appliedPromotion ? { promotionCode: appliedPromotion.code } : {}),
          ...(selectedReward ? { loyaltyRewardId: selectedReward.id } : {}),
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

        if (paymentMethod === 'transferencia' && paymentProofFile) {
          setIsUploadingProof(true);
          try {
            const proofForm = new FormData();
            proofForm.append('comprobante', paymentProofFile);
            proofForm.append('channel', transferChannel);
            if (cleanReference) {
              proofForm.append('reference', cleanReference);
            }
            const uploadResponse = await fetch(
              `/api/pedidos/${encodeURIComponent(data.order.id)}/comprobante`,
              {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: proofForm,
              },
            );
            if (!uploadResponse.ok) {
              clearCart();
              router.push(`/order-status/${data.order.id}?proofUploadError=1`);
              return;
            }
          } catch {
            clearCart();
            router.push(`/order-status/${data.order.id}?proofUploadError=1`);
            return;
          } finally {
            setIsUploadingProof(false);
          }
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
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {activeDeliveryZones.length > 0 && (
                      <div className="space-y-2" data-testid="checkout-delivery-zones">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                            Zona / Barrio de Entrega {hasDynamicZoneRates && activeDeliveryZones.length > 1 ? '*' : ''}
                          </Label>
                          {selectedZone && (
                            <span className="text-[11px] font-semibold text-cyan-300">
                              ~{deliveryQuote.estimatedMinutes} min
                            </span>
                          )}
                        </div>
                        <div
                          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                          role="group"
                          aria-label="Zona de entrega"
                        >
                          {activeDeliveryZones.map((zone) => {
                            const isSelected = selectedZone?.id === zone.id;
                            const zoneQuote = calculateDeliveryQuote({
                              serviceType: 'delivery',
                              zone,
                              subtotalCop: totalPrice,
                              fallbackEstimatedMinutes: configuration?.estimatedDeliveryMinutes,
                            });
                            return (
                              <button
                                key={zone.id}
                                type="button"
                                data-testid={`checkout-zone-${zone.id}`}
                                aria-pressed={isSelected}
                                onClick={() => {
                                  setSelectedZoneId(zone.id);
                                  setZoneError('');
                                  idempotencyKey.current = null;
                                }}
                                className={`flex min-h-[52px] items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                                  isSelected
                                    ? 'border-emerald-400 bg-emerald-500/20 text-white shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                                    : 'border-white/15 bg-background/40 text-slate-200 hover:border-emerald-400/50 hover:text-white'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-bold">{zone.name}</p>
                                  <p className="text-[11px] text-slate-300">~{zone.estimatedMinutes} min</p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                                    zoneQuote.feeCop === 0
                                      ? 'bg-emerald-500/25 text-emerald-200'
                                      : 'bg-white/10 text-white'
                                  }`}
                                >
                                  {zoneQuote.feeCop === 0
                                    ? 'Gratis'
                                    : `+$${zoneQuote.feeCop.toLocaleString('es-CO')}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {zoneError && (
                          <p role="alert" className="text-xs font-bold text-rose-400">
                            {zoneError}
                          </p>
                        )}
                        {selectedZone && deliveryQuote.isFreeByThreshold && (
                          <p
                            data-testid="checkout-free-delivery-badge"
                            className="rounded-xl border border-emerald-500/40 bg-emerald-950/35 px-3 py-2 text-xs font-bold text-emerald-200"
                          >
                            ¡Domicilio gratis aplicado en {selectedZone.name}!
                          </p>
                        )}
                        {selectedZone && deliveryQuote.freeDeliveryRemainingCop > 0 && (
                          <p className="rounded-xl border border-cyan-500/30 bg-cyan-950/25 px-3 py-2 text-xs text-cyan-200">
                            Agrega{' '}
                            <strong>
                              ${deliveryQuote.freeDeliveryRemainingCop.toLocaleString('es-CO')}
                            </strong>{' '}
                            más para domicilio gratis en {selectedZone.name}.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
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

            {/* Cupón o Código Promocional */}
            <Card className="border-none shadow-md bg-card/60 border border-primary/10">
              <CardHeader className="p-5 md:p-6 pb-3">
                <CardTitle className="flex items-center gap-2 text-primary font-bold text-base md:text-lg uppercase">
                  <TicketPercent className="w-5 h-5" /> Código Promocional
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 md:p-6 pt-0 space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="promotionCode" className="sr-only">
                      Código Promocional
                    </Label>
                    <Input
                      id="promotionCode"
                      placeholder="Ej: FIESTA20"
                      className="bg-background/50 h-12 rounded-xl uppercase font-mono tracking-wider"
                      value={promotionInput}
                      disabled={Boolean(appliedPromotion) || isValidatingPromo}
                      onChange={(e) => {
                        setPromotionInput(e.target.value.toUpperCase());
                        if (promoError) setPromoError('');
                      }}
                    />
                  </div>
                  {appliedPromotion ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemovePromotion}
                      aria-label="Quitar cupón"
                      className="h-12 px-4 rounded-xl border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-bold"
                    >
                      <X className="w-4 h-4 mr-1" /> Quitar
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => void handleApplyPromotion()}
                      disabled={isValidatingPromo || !promotionInput.trim()}
                      className="h-12 px-5 rounded-xl bg-primary text-white hover:bg-primary/90 font-bold"
                    >
                      {isValidatingPromo ? 'Validando...' : 'Aplicar'}
                    </Button>
                  )}
                </div>

                {promoError && (
                  <p role="alert" className="text-xs font-bold text-rose-400">
                    {promoError}
                  </p>
                )}

                {appliedPromotion && (
                  <div
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs ${
                      appliedPromotion.isHappyHour
                        ? 'border-pink-500/40 bg-pink-950/40 text-pink-300 shadow-[0_0_15px_rgba(229,25,110,0.2)]'
                        : 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                    }`}
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      {appliedPromotion.isHappyHour ? (
                        <>
                          <Flame className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
                          <span>Happy Hour {appliedPromotion.title ? `${appliedPromotion.title} (${appliedPromotion.code})` : appliedPromotion.code}</span>
                        </>
                      ) : (
                        `Cupón ${appliedPromotion.code} activo`
                      )}
                    </span>
                    <span className="font-black">
                      -${effectiveDiscount.toLocaleString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fidelización: Puntos Coctels y Canje de Recompensas */}
            <Card className="border-none shadow-md bg-card/60 border border-primary/15">
              <CardHeader className="p-5 md:p-6 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-primary font-bold text-base md:text-lg uppercase">
                    <Gift className="w-5 h-5" /> Puntos Coctels
                  </CardTitle>
                  <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-300">
                    <Sparkles className="w-3.5 h-3.5" /> Disponible: {availableLoyaltyPoints} pts
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-5 md:p-6 pt-0 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Canjea tus puntos acumulados por descuentos directos o un cóctel de cortesía. Con este pedido sumarás{' '}
                  <strong className="text-cyan-300">+{estimatedPointsEarned} pts</strong> al entregarse.
                </p>

                <div className="space-y-2" role="group" aria-label="Recompensas de fidelización">
                  {LOYALTY_REWARDS.map((reward) => {
                    const hasEnoughPoints = availableLoyaltyPoints >= reward.pointsCost;
                    const meetsMinimum = subtotalAfterPromo >= reward.minSubtotalCop;
                    const canRedeem = hasEnoughPoints && meetsMinimum;
                    const isSelected = selectedReward?.id === reward.id;

                    return (
                      <div
                        key={reward.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/15 text-white'
                            : canRedeem
                            ? 'border-white/15 bg-background/40 hover:border-primary/40'
                            : 'border-white/5 bg-background/20 opacity-60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase text-primary">
                              {reward.pointsCost} pts
                            </span>
                            <span className="text-xs font-bold text-white truncate">
                              {reward.title}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {reward.description}
                          </p>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? 'outline' : 'default'}
                          disabled={!canRedeem && !isSelected}
                          onClick={() => {
                            setSelectedRewardId(isSelected ? null : reward.id);
                            idempotencyKey.current = null;
                          }}
                          className={
                            isSelected
                              ? 'h-9 px-3 rounded-lg border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-bold'
                              : 'h-9 px-3 rounded-lg bg-primary text-white hover:bg-primary/90 text-xs font-bold'
                          }
                        >
                          {isSelected ? 'Quitar' : canRedeem ? 'Canjear' : `Faltan ${Math.max(0, reward.pointsCost - availableLoyaltyPoints)} pts`}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-card/60 border border-primary/10">
              <CardHeader className="p-5 md:p-6">
                <CardTitle className="flex items-center gap-2 text-primary font-bold text-base md:text-lg uppercase">
                  <CreditCard className="w-5 h-5" /> Método de Pago
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 md:p-6 pt-0 md:pt-0 space-y-4">
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => {
                    setPaymentMethod(value === 'transferencia' ? 'transferencia' : 'efectivo');
                    idempotencyKey.current = null;
                  }}
                  className="space-y-3"
                >
                  <label
                    htmlFor="cash"
                    className={`flex items-start space-x-3 border p-4 md:p-5 rounded-2xl cursor-pointer transition-colors ${
                      paymentMethod === 'efectivo'
                        ? 'border-primary bg-primary/10'
                        : 'border-white/15 bg-background/40 hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <RadioGroupItem value="efectivo" id="cash" className="border-primary text-primary mt-0.5" />
                    <div className="flex-grow space-y-0.5">
                      <span className="flex items-center gap-2.5 font-bold text-sm text-white">
                        <Wallet className="w-5 h-5 text-primary shrink-0" />
                        EFECTIVO CONTRA ENTREGA
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Pagas al recibir tu pedido o directamente en barra.
                      </p>
                    </div>
                  </label>

                  <label
                    htmlFor="transfer"
                    className={`flex items-start space-x-3 border p-4 md:p-5 rounded-2xl cursor-pointer transition-colors ${
                      paymentMethod === 'transferencia'
                        ? 'border-cyan-400 bg-cyan-950/25'
                        : 'border-white/15 bg-background/40 hover:border-cyan-400/40 hover:bg-cyan-950/10'
                    }`}
                  >
                    <RadioGroupItem value="transferencia" id="transfer" className="border-cyan-400 text-cyan-400 mt-0.5" />
                    <div className="flex-grow space-y-0.5">
                      <span className="flex items-center gap-2.5 font-bold text-sm text-white">
                        <Landmark className="w-5 h-5 text-cyan-400 shrink-0" />
                        TRANSFERENCIA (NEQUI / DAVIPLATA / BANCOLOMBIA)
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Transfiere fácil y comparte el comprobante por WhatsApp.
                      </p>
                    </div>
                  </label>
                </RadioGroup>

                {paymentMethod === 'transferencia' && (
                  <div className="rounded-2xl border border-cyan-500/35 bg-cyan-950/25 p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                        Elige el canal de transferencia
                      </p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Canal de transferencia">
                        {TRANSFER_CHANNELS.map((channel) => {
                          const selected = transferChannel === channel.id;
                          return (
                            <button
                              key={channel.id}
                              type="button"
                              onClick={() => {
                                setTransferChannel(channel.id);
                                idempotencyKey.current = null;
                              }}
                              aria-pressed={selected}
                              className={`min-h-[44px] rounded-xl border px-3.5 text-xs font-bold transition-all ${
                                selected
                                  ? 'border-cyan-400 bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                                  : 'border-white/15 bg-black/40 text-slate-200 hover:border-cyan-400/50 hover:text-white'
                              }`}
                            >
                              {channel.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {configuration?.whatsappNumber && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5">
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-slate-400">
                            Número Nequi / Daviplata / WhatsApp
                          </p>
                          <p className="font-mono text-sm font-bold text-white">
                            {configuration.whatsappNumber}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopyTransferNumber()}
                          className="min-h-[40px] border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                        >
                          {copiedTransferNumber ? (
                            <>
                              <Check className="w-4 h-4 mr-1.5 text-emerald-400" />
                              ¡Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 mr-1.5" />
                              Copiar número
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    <p className="text-xs text-cyan-100/90">
                      Envía el comprobante por WhatsApp al confirmar tu pedido para agilizar la preparación.
                    </p>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="transferReference"
                        className="text-xs font-semibold text-slate-200"
                      >
                        Referencia o últimos 4 dígitos (opcional)
                      </Label>
                      <Input
                        id="transferReference"
                        maxLength={60}
                        placeholder="Ej: Ref 4821 o comprobante Nequi"
                        value={transferReference}
                        onChange={(e) => {
                          setTransferReference(e.target.value);
                          idempotencyKey.current = null;
                        }}
                        className="h-11 rounded-xl border-cyan-500/30 bg-black/50 text-white placeholder:text-slate-400"
                      />
                    </div>

                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-semibold text-slate-200">
                        Captura de comprobante (opcional · JPG, PNG o WebP hasta 5 MB)
                      </p>
                      <input
                        id="paymentProofFile"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleProofFileChange}
                        className="sr-only"
                      />
                      <label
                        htmlFor="paymentProofFile"
                        className="flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-400/50 bg-black/40 px-4 py-3 text-xs font-bold text-cyan-200 transition-colors hover:border-cyan-300 hover:bg-cyan-500/10"
                      >
                        <Upload className="w-4 h-4 shrink-0 text-cyan-400" />
                        <span>
                          {paymentProofFile
                            ? 'Cambiar comprobante de transferencia'
                            : 'Adjuntar comprobante de transferencia (opcional)'}
                        </span>
                      </label>

                      {paymentProofError && (
                        <p role="alert" className="text-xs font-bold text-rose-400">
                          {paymentProofError}
                        </p>
                      )}

                      {paymentProofFile && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-black/50 p-3">
                          <div className="flex min-w-0 items-center gap-3">
                            {paymentProofPreview && (
                              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-cyan-500/30 bg-black/60">
                                <Image
                                  src={paymentProofPreview}
                                  alt="Vista previa del comprobante de transferencia"
                                  width={56}
                                  height={56}
                                  unoptimized
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-white">
                                {paymentProofFile.name}
                              </p>
                              <p className="text-[11px] text-cyan-300">
                                {(paymentProofFile.size / 1024).toFixed(0)} KB · Listo para verificación
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveProofFile}
                            className="min-h-[44px] shrink-0 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Quitar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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

                <div className="space-y-2 border-t border-white/15 pt-4">
                  {(appliedPromotion || selectedReward || deliveryQuote.feeCop > 0 || deliveryQuote.isFreeByThreshold) && (
                    <div className="flex justify-between items-center text-sm opacity-90">
                      <span>Subtotal</span>
                      <span className="font-semibold">${totalPrice.toLocaleString()}</span>
                    </div>
                  )}
                  {appliedPromotion && (
                    <div className="flex justify-between items-center text-sm text-cyan-200 font-bold">
                      <span className="flex items-center gap-1">
                        {appliedPromotion.isHappyHour && <Flame className="w-3.5 h-3.5 text-pink-300 fill-pink-300" />}
                        {appliedPromotion.isHappyHour ? 'Happy Hour' : 'Descuento'} ({appliedPromotion.code})
                      </span>
                      <span>-${effectiveDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedReward && (
                    <div className="flex justify-between items-center text-sm text-emerald-200 font-bold">
                      <span>Recompensa ({selectedReward.title})</span>
                      <span>-${loyaltyDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {serviceType === 'delivery' &&
                    (deliveryQuote.feeCop > 0 ||
                      deliveryQuote.isFreeByThreshold ||
                      Boolean(selectedZone && hasDynamicZoneRates)) && (
                      <div
                        data-testid="checkout-summary-delivery-fee"
                        className="flex justify-between items-center text-sm text-emerald-200 font-bold"
                      >
                        <span>
                          Domicilio ({selectedZone?.name ?? 'Cobertura'})
                        </span>
                        <span>
                          {deliveryQuote.feeCop === 0
                            ? 'GRATIS'
                            : `+$${deliveryQuote.feeCop.toLocaleString()}`}
                        </span>
                      </div>
                    )}
                  <div className="flex justify-between items-end pt-2">
                    <span className="text-base md:text-lg opacity-80">Total a Pagar</span>
                    <span className="font-black text-3xl md:text-5xl">${finalTotal.toLocaleString()}</span>
                  </div>
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
                      <p>Entrega estimada: {deliveryQuote.estimatedMinutes} min</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-xs font-bold text-white">
                  {paymentMethod === 'transferencia' ? (
                    <Landmark className="w-4 h-4 shrink-0 text-cyan-200" />
                  ) : (
                    <Wallet className="w-4 h-4 shrink-0 text-white" />
                  )}
                  <span>
                    {paymentMethod === 'transferencia'
                      ? `Pago: Transferencia · ${selectedTransferChannelLabel}${paymentProofFile ? ' (con comprobante)' : ''}`
                      : 'Pago: Efectivo contra entrega'}
                  </span>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-white text-primary hover:bg-white/90 font-black py-7 md:py-10 text-xl md:text-2xl rounded-full shadow-2xl transition-all active:scale-95"
                  disabled={isSubmitting || isUploadingProof}
                >
                  {isUploadingProof
                    ? 'SUBIENDO COMPROBANTE...'
                    : isSubmitting
                      ? 'PROCESANDO...'
                      : 'CONFIRMAR PEDIDO'}
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
