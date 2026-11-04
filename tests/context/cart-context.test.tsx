import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  CartProvider,
  useCart,
  generateCartItemId,
  normalizeCartItem,
  mergeCartItems,
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  type CartItem,
} from '@/context/cart-context';

function wrapper({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}

describe('Cart Utilities', () => {
  describe('generateCartItemId', () => {
    it('genera IDs deterministas idénticos independientemente del orden de sabores y adiciones', () => {
      const id1 = generateCartItemId('prod-1', {
        size: 'Medium',
        flavors: ['Mora', 'Fresa'],
        addOns: ['Lecherita', 'Gomitas'],
      });

      const id2 = generateCartItemId('prod-1', {
        size: 'Medium',
        flavors: ['Fresa', 'Mora'],
        addOns: ['Gomitas', 'Lecherita'],
      });

      expect(id1).toBe(id2);
      expect(id1).toContain('prod-1::size:Medium');
      expect(id1).toContain('flavors:Fresa,Mora');
      expect(id1).toContain('addons:Gomitas,Lecherita');
    });

    it('genera IDs diferentes cuando cambia el tamaño, sabor o adición', () => {
      const idMedium = generateCartItemId('prod-1', { size: 'Medium', flavors: ['Mora'], addOns: [] });
      const idLarge = generateCartItemId('prod-1', { size: 'Large', flavors: ['Mora'], addOns: [] });
      const idOtherFlavor = generateCartItemId('prod-1', { size: 'Medium', flavors: ['Lulo'], addOns: [] });

      expect(idMedium).not.toBe(idLarge);
      expect(idMedium).not.toBe(idOtherFlavor);
    });

    it('asigna tamaño Medium y arrays vacíos por defecto si no se especifican', () => {
      const id = generateCartItemId('prod-1', null);
      expect(id).toBe('prod-1::size:Medium::flavors:::addons:');
    });
  });

  describe('normalizeCartItem', () => {
    it('rechaza entradas nulas o sin campos obligatorios', () => {
      expect(normalizeCartItem(null)).toBeNull();
      expect(normalizeCartItem({})).toBeNull();
      expect(normalizeCartItem({ productId: '' })).toBeNull();
      expect(normalizeCartItem({ productId: 'p1', name: '' })).toBeNull();
    });

    it('sanea valores numéricos y genera un ID determinista', () => {
      const normalized = normalizeCartItem({
        productId: 'prod-abc',
        name: 'Granizado Michelado',
        price: -5000,
        quantity: 0,
        customization: {
          size: 'Small',
          flavors: ['Mango biche'],
          addOns: ['Tajín'],
        },
      });

      expect(normalized).not.toBeNull();
      expect(normalized?.price).toBe(0);
      expect(normalized?.quantity).toBe(1);
      expect(normalized?.id).toBe(
        generateCartItemId('prod-abc', {
          size: 'Small',
          flavors: ['Mango biche'],
          addOns: ['Tajín'],
        })
      );
    });
  });

  describe('mergeCartItems', () => {
    it('fusiona ítems con el mismo ID sumando sus cantidades', () => {
      const itemA: CartItem = {
        id: 'p1::size:Medium::flavors:Mora::addons:',
        productId: 'p1',
        name: 'Granizado Mora',
        price: 15000,
        quantity: 2,
        image: '/img.png',
        customization: { size: 'Medium', flavors: ['Mora'], addOns: [] },
      };

      const itemB: CartItem = {
        id: 'p1::size:Medium::flavors:Mora::addons:',
        productId: 'p1',
        name: 'Granizado Mora',
        price: 15000,
        quantity: 3,
        image: '/img.png',
        customization: { size: 'Medium', flavors: ['Mora'], addOns: [] },
      };

      const itemC: CartItem = {
        id: 'p2::size:Small::flavors:Lulo::addons:',
        productId: 'p2',
        name: 'Granizado Lulo',
        price: 10000,
        quantity: 1,
        image: '/img2.png',
        customization: { size: 'Small', flavors: ['Lulo'], addOns: [] },
      };

      const merged = mergeCartItems([itemA, itemB, itemC]);
      expect(merged).toHaveLength(2);
      expect(merged.find((i) => i.id === itemA.id)?.quantity).toBe(5);
      expect(merged.find((i) => i.id === itemC.id)?.quantity).toBe(1);
    });
  });
});

describe('CartContext & CartProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('inicia con un carrito vacío cuando no hay nada almacenado', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.items).toEqual([]);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.totalPrice).toBe(0);
    expect(result.current.isHydrated).toBe(true);
  });

  it('agrega un nuevo ítem con ID determinista', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        productId: 'granizado-ops',
        name: 'Granizado OPS',
        price: 15000,
        quantity: 1,
        image: '/granizado.png',
        customization: {
          size: 'Medium',
          flavors: ['Fresa'],
          addOns: ['Lecherita'],
        },
      });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.totalItems).toBe(1);
    expect(result.current.totalPrice).toBe(15000);
    expect(result.current.items[0].id).toBe(
      generateCartItemId('granizado-ops', {
        size: 'Medium',
        flavors: ['Fresa'],
        addOns: ['Lecherita'],
      })
    );
  });

  it('acumulación inteligente: suma cantidades al añadir el mismo producto con idéntica personalización', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        productId: 'granizado-ops',
        name: 'Granizado OPS',
        price: 15000,
        quantity: 1,
        image: '/granizado.png',
        customization: {
          size: 'Medium',
          flavors: ['Fresa', 'Mora'],
          addOns: ['Lecherita'],
        },
      });
    });

    // Se agrega nuevamente el mismo producto, pero con el orden de sabores invertido
    act(() => {
      result.current.addItem({
        productId: 'granizado-ops',
        name: 'Granizado OPS',
        price: 15000,
        quantity: 2,
        image: '/granizado.png',
        customization: {
          size: 'Medium',
          flavors: ['Mora', 'Fresa'],
          addOns: ['Lecherita'],
        },
      });
    });

    // Debe acumular en una sola fila
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(3);
    expect(result.current.totalItems).toBe(3);
    expect(result.current.totalPrice).toBe(45000);
  });

  it('crea filas separadas cuando la personalización difiere', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        productId: 'granizado-ops',
        name: 'Granizado OPS',
        price: 15000,
        quantity: 1,
        image: '/granizado.png',
        customization: {
          size: 'Medium',
          flavors: ['Fresa'],
          addOns: [],
        },
      });
    });

    act(() => {
      result.current.addItem({
        productId: 'granizado-ops',
        name: 'Granizado OPS',
        price: 25000,
        quantity: 1,
        image: '/granizado.png',
        customization: {
          size: 'Large',
          flavors: ['Fresa'],
          addOns: [],
        },
      });
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.totalItems).toBe(2);
    expect(result.current.totalPrice).toBe(40000);
  });

  it('permite actualizar cantidad y elimina el ítem si la cantidad es <= 0', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        productId: 'soda-maracuya',
        name: 'Soda Maracuyá',
        price: 12000,
        quantity: 1,
        image: '/soda.png',
        customization: { size: 'Medium', flavors: [], addOns: [] },
      });
    });

    const itemId = result.current.items[0].id;

    act(() => {
      result.current.updateQuantity(itemId, 4);
    });

    expect(result.current.items[0].quantity).toBe(4);
    expect(result.current.totalPrice).toBe(48000);

    // Reducir a 0 lo elimina
    act(() => {
      result.current.updateQuantity(itemId, 0);
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.totalItems).toBe(0);
  });

  it('elimina un ítem específico con removeItem', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        productId: 'p1',
        name: 'Producto 1',
        price: 10000,
        quantity: 1,
        image: '',
        customization: { size: 'Small', flavors: [], addOns: [] },
      });
      result.current.addItem({
        productId: 'p2',
        name: 'Producto 2',
        price: 20000,
        quantity: 1,
        image: '',
        customization: { size: 'Large', flavors: [], addOns: [] },
      });
    });

    expect(result.current.items).toHaveLength(2);
    const idToRemove = result.current.items[0].id;

    act(() => {
      result.current.removeItem(idToRemove);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe('p2');
  });

  it('vacía el carrito con clearCart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        productId: 'p1',
        name: 'Producto 1',
        price: 10000,
        quantity: 2,
        image: '',
        customization: { size: 'Small', flavors: [], addOns: [] },
      });
    });

    expect(result.current.items).toHaveLength(1);

    act(() => {
      result.current.clearCart();
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.totalItems).toBe(0);
  });

  it('genera CheckoutItemInput[] estructurado para la API de checkout', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        productId: 'prod-check',
        name: 'Granizado',
        price: 15000,
        quantity: 2,
        image: '/img.png',
        customization: {
          size: 'Medium',
          flavors: ['Maracuyá'],
          addOns: ['Lecherita'],
        },
      });
    });

    const checkoutItems = result.current.getCheckoutItems();
    expect(checkoutItems).toEqual([
      {
        productId: 'prod-check',
        quantity: 2,
        customization: {
          size: 'Medium',
          flavors: ['Maracuyá'],
          addOns: ['Lecherita'],
        },
      },
    ]);
  });

  it('persiste cambios en localStorage bajo la clave coctels_ops_cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({
        productId: 'p-persist',
        name: 'Bebida',
        price: 10000,
        quantity: 1,
        image: '',
        customization: { size: 'Medium', flavors: [], addOns: [] },
      });
    });

    const stored = localStorage.getItem(CART_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].productId).toBe('p-persist');
  });

  it('migra automáticamente datos existentes de granizado_go_cart hacia coctels_ops_cart', () => {
    const legacyData = [
      {
        id: 'legacy-timestamp-1',
        productId: 'granizado-mora',
        name: 'Granizado de Mora',
        price: 15000,
        quantity: 2,
        image: '/legacy.png',
        customization: { size: 'Medium', flavors: ['Mora'], addOns: [] },
      },
      // Duplicado con otro timestamp en legacy
      {
        id: 'legacy-timestamp-2',
        productId: 'granizado-mora',
        name: 'Granizado de Mora',
        price: 15000,
        quantity: 1,
        image: '/legacy.png',
        customization: { size: 'Medium', flavors: ['Mora'], addOns: [] },
      },
    ];

    localStorage.setItem(LEGACY_CART_STORAGE_KEY, JSON.stringify(legacyData));

    const { result } = renderHook(() => useCart(), { wrapper });

    // Los dos ítems idénticos del legacy deben haberse fusionado
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(3);

    // Debe guardarse en coctels_ops_cart y removerse de granizado_go_cart
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_CART_STORAGE_KEY)).toBeNull();
  });
});

