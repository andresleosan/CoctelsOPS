"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { CheckoutItemInput, OrderCustomization } from '@/types/orders';

export const CART_STORAGE_KEY = 'coctels_ops_cart';
export const LEGACY_CART_STORAGE_KEY = 'granizado_go_cart';

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  customization: OrderCustomization;
};

export type CartContextType = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'> & { id?: string }) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getCheckoutItems: () => CheckoutItemInput[];
  totalItems: number;
  totalPrice: number;
  isHydrated: boolean;
};

/**
 * Genera un identificador determinista para un ítem del carrito basado en el
 * producto y su personalización (tamaño, sabores ordenados y adiciones ordenadas).
 */
export function generateCartItemId(
  productId: string,
  customization?: Partial<OrderCustomization> | null
): string {
  const size = customization?.size ?? 'Medium';
  const flavors = Array.isArray(customization?.flavors)
    ? [...customization.flavors].filter((f): f is string => typeof f === 'string' && f.trim().length > 0).sort().join(',')
    : '';
  const addOns = Array.isArray(customization?.addOns)
    ? [...customization.addOns].filter((a): a is string => typeof a === 'string' && a.trim().length > 0).sort().join(',')
    : '';

  return `${productId}::size:${size}::flavors:${flavors}::addons:${addOns}`;
}

const VALID_SIZES: ReadonlyArray<OrderCustomization['size']> = ['Small', 'Medium', 'Large'];

/**
 * Normaliza y valida una entrada cruda de ítem de carrito, garantizando tipos estrictos
 * y un ID determinista.
 */
export function normalizeCartItem(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Partial<CartItem>;
  if (typeof candidate.productId !== 'string' || candidate.productId.trim().length === 0) {
    return null;
  }
  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
    return null;
  }

  const price = typeof candidate.price === 'number' && Number.isFinite(candidate.price)
    ? Math.max(0, candidate.price)
    : 0;
  const quantity = typeof candidate.quantity === 'number' && Number.isFinite(candidate.quantity)
    ? Math.max(1, Math.floor(candidate.quantity))
    : 1;
  const image = typeof candidate.image === 'string' && candidate.image.trim().length > 0
    ? candidate.image
    : '/catalog-placeholder.svg';

  const rawCustomization = candidate.customization;
  const size: OrderCustomization['size'] =
    rawCustomization?.size && VALID_SIZES.includes(rawCustomization.size)
      ? rawCustomization.size
      : 'Medium';

  const flavors = Array.isArray(rawCustomization?.flavors)
    ? rawCustomization.flavors.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    : [];

  const addOns = Array.isArray(rawCustomization?.addOns)
    ? rawCustomization.addOns.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    : [];

  const customization: OrderCustomization = {
    size,
    flavors,
    addOns,
  };

  const id = generateCartItemId(candidate.productId, customization);

  return {
    id,
    productId: candidate.productId,
    name: candidate.name,
    price,
    quantity,
    image,
    customization,
  };
}

/**
 * Agrupa ítems con personalizaciones idénticas sumando sus cantidades.
 */
export function mergeCartItems(items: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>();

  for (const item of items) {
    const existing = merged.get(item.id);
    if (existing) {
      merged.set(item.id, {
        ...existing,
        quantity: existing.quantity + item.quantity,
      });
    } else {
      merged.set(item.id, { ...item });
    }
  }

  return Array.from(merged.values());
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hidratación y migración retrocompatible
  useEffect(() => {
    try {
      const currentSaved = localStorage.getItem(CART_STORAGE_KEY);
      if (currentSaved) {
        const parsed = JSON.parse(currentSaved);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map(normalizeCartItem)
            .filter((item): item is CartItem => item !== null);
          setItems(mergeCartItems(normalized));
        }
      } else {
        const legacySaved = localStorage.getItem(LEGACY_CART_STORAGE_KEY);
        if (legacySaved) {
          const parsedLegacy = JSON.parse(legacySaved);
          if (Array.isArray(parsedLegacy)) {
            const migrated = mergeCartItems(
              parsedLegacy
                .map(normalizeCartItem)
                .filter((item): item is CartItem => item !== null)
            );
            setItems(migrated);
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(migrated));
            localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
          }
        }
      }
    } catch (e) {
      console.error('No se pudo hidratar el carrito:', e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Sincronización continua a localStorage
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('No se pudo persistir el carrito:', e);
    }
  }, [isHydrated, items]);

  // Acumulación inteligente de productos
  const addItem = useCallback((newItem: Omit<CartItem, 'id'> & { id?: string }) => {
    const normalized = normalizeCartItem(newItem);
    if (!normalized) return;

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === normalized.id);
      if (existingIndex > -1) {
        const next = [...prev];
        const existing = next[existingIndex];
        next[existingIndex] = {
          ...existing,
          quantity: existing.quantity + normalized.quantity,
          price: normalized.price,
          image: normalized.image || existing.image,
        };
        return next;
      }
      return [...prev, normalized];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.floor(quantity) } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getCheckoutItems = useCallback((): CheckoutItemInput[] => {
    return items.map(({ productId, quantity, customization }) => ({
      productId,
      quantity,
      customization,
    }));
  }, [items]);

  const totalItems = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  const totalPrice = useMemo(() => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [items]);

  const contextValue = useMemo<CartContextType>(() => ({
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getCheckoutItems,
    totalItems,
    totalPrice,
    isHydrated,
  }), [items, addItem, removeItem, updateQuantity, clearCart, getCheckoutItems, totalItems, totalPrice, isHydrated]);

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
