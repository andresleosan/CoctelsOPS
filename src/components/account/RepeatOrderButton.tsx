'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { orderItemsToCartItems } from '@/lib/orders/repeat-order';
import type { OrderItem } from '@/types/orders';

export interface RepeatOrderButtonProps {
  items: OrderItem[] | undefined | null;
  orderId?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  redirectToCart?: boolean;
  onRepeat?: () => void;
  label?: string;
}

export function RepeatOrderButton({
  items,
  orderId,
  variant = 'outline',
  size = 'default',
  className = '',
  redirectToCart = true,
  onRepeat,
  label = 'Repetir pedido',
}: RepeatOrderButtonProps) {
  const router = useRouter();
  const { addItems, addItem } = useCart();
  const { toast } = useToast();
  const [repeated, setRepeated] = useState(false);

  const cartCandidates = orderItemsToCartItems(items);
  const totalCount = cartCandidates.reduce((sum, item) => sum + item.quantity, 0);

  const handleRepeat = () => {
    if (cartCandidates.length === 0) return;

    if (typeof addItems === 'function') {
      addItems(cartCandidates);
    } else if (typeof addItem === 'function') {
      for (const item of cartCandidates) {
        addItem(item);
      }
    }

    setRepeated(true);
    onRepeat?.();

    toast({
      title: '¡Pedido agregado al carrito!',
      description: `${totalCount} ${totalCount === 1 ? 'bebida agregada' : 'bebidas agregadas'} con sus sabores y adiciones exactas.`,
    });

    if (redirectToCart) {
      router.push('/cart');
    } else {
      setTimeout(() => setRepeated(false), 2000);
    }
  };

  if (!items || items.length === 0 || cartCandidates.length === 0) {
    return null;
  }

  const ariaLabel = orderId ? `Repetir pedido #${orderId}` : 'Repetir pedido';

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleRepeat}
      className={`min-h-[44px] touch-manipulation gap-2 font-medium transition-all ${className}`}
      aria-label={ariaLabel}
    >
      {repeated ? (
        <>
          <Check className="h-4 w-4 text-emerald-400" />
          <span>¡Agregado!</span>
        </>
      ) : (
        <>
          <RotateCcw className="h-4 w-4" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
