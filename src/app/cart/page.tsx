"use client";

import { useCart } from '@/context/cart-context';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag, ArrowLeft, Send } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import TableServiceBanner, {
  OPEN_LIVE_TABLE_TAB_EVENT,
  SERVICE_MESA_STORAGE_KEY,
  SERVICE_TENANT_SLUG_STORAGE_KEY,
  SERVICE_TYPE_STORAGE_KEY,
  TABLE_SERVICE_CHANGE_EVENT,
} from '@/components/products/TableServiceBanner';
import LiveTableTabSheet from '@/components/orders/LiveTableTabSheet';
import { canonicalizeTableNumber, isPickupTableIdentifier } from '@/lib/tabs/calculator';

function readTableServiceFromStorage(): { activeMesa: string | null; tenantSlug: string | null } {
  if (typeof window === 'undefined') {
    return { activeMesa: null, tenantSlug: null };
  }

  try {
    const storedType = window.sessionStorage.getItem(SERVICE_TYPE_STORAGE_KEY);
    const storedMesa = window.sessionStorage.getItem(SERVICE_MESA_STORAGE_KEY);
    const storedSlug = window.sessionStorage.getItem(SERVICE_TENANT_SLUG_STORAGE_KEY)?.trim() || null;

    if (storedType === 'pickup' || !storedMesa || isPickupTableIdentifier(storedMesa)) {
      return { activeMesa: null, tenantSlug: storedSlug };
    }

    const canonical = canonicalizeTableNumber(storedMesa);
    return {
      activeMesa: canonical || null,
      tenantSlug: storedSlug,
    };
  } catch {
    return { activeMesa: null, tenantSlug: null };
  }
}

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalPrice, totalItems, isHydrated } = useCart();
  const [isMounted, setIsMounted] = useState(false);
  const [tableService, setTableService] = useState<{
    activeMesa: string | null;
    tenantSlug: string | null;
  }>({ activeMesa: null, tenantSlug: null });

  useEffect(() => {
    setIsMounted(true);

    const syncTableService = () => {
      setTableService(readTableServiceFromStorage());
    };

    syncTableService();
    window.addEventListener(TABLE_SERVICE_CHANGE_EVENT, syncTableService);
    window.addEventListener('storage', syncTableService);
    return () => {
      window.removeEventListener(TABLE_SERVICE_CHANGE_EVENT, syncTableService);
      window.removeEventListener('storage', syncTableService);
    };
  }, []);

  if (!isMounted || !isHydrated) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-secondary/30 animate-pulse mx-auto" />
          <div className="h-6 w-48 bg-secondary/30 rounded-md animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  const { activeMesa, tenantSlug } = tableService;
  const menuHref = tenantSlug ? `/m/${tenantSlug}` : '/menu';

  return (
    <>
      {items.length === 0 ? (
        <div className="container mx-auto px-4 py-24 text-center">
          <div className="max-w-md mx-auto space-y-6">
            <div className="bg-secondary/20 p-8 rounded-full w-fit mx-auto border border-white/5">
              <ShoppingBag className="w-16 h-16 text-primary/60" />
            </div>
            <h1 className="text-3xl font-headline font-bold uppercase tracking-tight">Tu carrito está vacío</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Aún no has añadido tus cócteles o granizados favoritos. Explora nuestra carta artesanal y refréscate.
            </p>
            <Button className="rounded-full px-8 py-6 text-base font-bold bg-primary hover:bg-primary/90 neon-shadow-magenta min-h-[48px]" asChild>
              <Link href={menuHref}>
                Explorar el Menú <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
          {activeMesa ? (
            <div className="mb-6">
              <TableServiceBanner />
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-headline font-black uppercase tracking-tight">
                Tu Pedido <span className="text-primary text-xl md:text-2xl font-normal">({totalItems} {totalItems === 1 ? 'ítem' : 'ítems'})</span>
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Revisa las bebidas y personalizaciones antes de confirmar tu entrega.
              </p>
            </div>
            <Button variant="ghost" size="sm" className="w-fit text-muted-foreground hover:text-foreground -ml-2 sm:ml-0" asChild>
              <Link href={menuHref}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Agregar más bebidas
              </Link>
            </Button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12 items-start">
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <Card 
                  key={item.id} 
                  className="overflow-hidden border border-white/10 bg-card/40 backdrop-blur-md shadow-sm hover:border-primary/20 transition-all rounded-2xl"
                >
                  <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
                    <div className="relative w-full sm:w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 bg-secondary/20 border border-white/5">
                      <Image 
                        src={item.image || '/catalog-placeholder.svg'} 
                        alt={item.name} 
                        fill 
                        sizes="(max-width: 640px) 100vw, 112px"
                        className="object-cover" 
                      />
                    </div>

                    <div className="flex-grow flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-bold text-base sm:text-lg leading-tight">{item.name}</h3>
                          <div className="text-right flex-shrink-0">
                            <p className="font-black text-primary text-base sm:text-lg">
                              ${(item.price * item.quantity).toLocaleString('es-CO')}
                            </p>
                            {item.quantity > 1 && (
                              <p className="text-[11px] text-muted-foreground">
                                ${item.price.toLocaleString('es-CO')} c/u
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="bg-secondary/70 border border-secondary text-foreground px-2 py-0.5 rounded-full font-semibold">
                              {item.customization.size}
                            </span>
                            {item.customization.flavors.map((f) => (
                              <span key={f} className="text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                                {f}
                              </span>
                            ))}
                          </div>

                          {item.customization.addOns && item.customization.addOns.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-primary/90 pt-0.5">
                              <span className="text-muted-foreground font-medium">Toppings:</span>
                              {item.customization.addOns.map((addon) => (
                                <span 
                                  key={addon} 
                                  className="bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full"
                                >
                                  + {addon}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <div className="flex items-center gap-1 bg-secondary/30 border border-white/10 rounded-full p-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-full hover:bg-white/10 active:scale-95 disabled:opacity-30"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            aria-label={`Disminuir cantidad de ${item.name}`}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="text-sm font-bold min-w-8 text-center select-none" aria-live="polite">
                            {item.quantity}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-full hover:bg-white/10 active:scale-95"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            aria-label={`Aumentar cantidad de ${item.name}`}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-full text-destructive/80 hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Eliminar ${item.name} del pedido`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="lg:col-span-1">
              <Card className="border border-white/10 shadow-xl bg-card/60 backdrop-blur-xl sticky top-24 rounded-2xl">
                <CardContent className="p-6 space-y-6">
                  <h2 className="font-headline font-bold text-xl uppercase tracking-tight">Resumen</h2>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal ({totalItems} {totalItems === 1 ? 'ítem' : 'ítems'})</span>
                      <span className="font-medium">${totalPrice.toLocaleString('es-CO')}</span>
                    </div>
                    {activeMesa ? (
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-muted-foreground">Servicio en local</span>
                        <span className="text-cyan-400 font-semibold text-xs bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded-full">
                          {activeMesa} · Sin recargo
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-muted-foreground">Envío estimado</span>
                        <span className="text-cyan-400 font-semibold text-xs bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded-full">
                          A calcular en checkout
                        </span>
                      </div>
                    )}
                    <Separator className="bg-white/10" />
                    <div className="flex justify-between text-lg font-bold items-baseline">
                      <span>Total Pedido</span>
                      <span className="text-primary text-2xl font-black">${totalPrice.toLocaleString('es-CO')}</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    {activeMesa ? (
                      <>
                        <Button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new Event(OPEN_LIVE_TABLE_TAB_EVENT));
                          }}
                          className="w-full py-6 rounded-full text-base font-bold group bg-primary hover:bg-primary/90 neon-shadow-magenta min-h-[48px]"
                        >
                          <Send className="mr-2 w-4 h-4" />
                          Enviar ronda a {activeMesa}
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full rounded-full border-white/15 bg-black/40 text-slate-200 hover:bg-white/10 text-xs min-h-[44px]"
                          asChild
                        >
                          <Link href="/checkout">
                            Ir a Checkout (cupones o puntos)
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <Button 
                        className="w-full py-6 rounded-full text-base font-bold group bg-primary hover:bg-primary/90 neon-shadow-magenta min-h-[48px]" 
                        asChild
                      >
                        <Link href="/checkout">
                          Continuar al Pago <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" className="w-full rounded-full text-muted-foreground hover:text-foreground text-xs min-h-[44px]" asChild>
                      <Link href={menuHref}>
                        Seguir explorando la carta
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
      <LiveTableTabSheet />
    </>
  );
}
