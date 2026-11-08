import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useRouter } = vi.hoisted(() => ({ useRouter: vi.fn() }));
const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));
const { mockAddItems, mockAddItem } = vi.hoisted(() => ({
  mockAddItems: vi.fn(),
  mockAddItem: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter }));
vi.mock('@/hooks/use-auth', () => ({ useAuth }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));
vi.mock('@/context/cart-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/context/cart-context')>();
  return {
    ...actual,
    useCart: () => ({
      items: [],
      addItem: mockAddItem,
      addItems: mockAddItems,
      removeItem: vi.fn(),
      updateQuantity: vi.fn(),
      clearCart: vi.fn(),
      getCheckoutItems: vi.fn(() => []),
      totalItems: 0,
      totalPrice: 0,
      isHydrated: true,
    }),
  };
});
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { orderItemsToCartItems } from '@/lib/orders/repeat-order';
import { RepeatOrderButton } from '@/components/account/RepeatOrderButton';
import { OrderHistory } from '@/components/account/OrderHistory';
import AccountOrderDetailPage from '@/app/cuenta/pedidos/[id]/page';
import OrderStatusPage from '@/app/order-status/[id]/page';
import type { OrderItem, CustomerOrder, Order } from '@/types/orders';

const mockPush = vi.fn();

describe('TASK-14: Re-Pedido en 1 Tap ("Repetir Pedido")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouter.mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('orderItemsToCartItems utility', () => {
    it('convierte OrderItem[] a formato CartItem preservando sabores, adiciones y precios en COP', () => {
      const orderItems: OrderItem[] = [
        {
          productId: 'prod-granizado-mora',
          name: 'Granizado de Mora Silvestre',
          quantity: 2,
          unitPrice: 15000,
          subtotal: 30000,
          customization: {
            size: '16 oz',
            flavors: ['Mora', 'Fresa'],
            addOns: ['Lecherita', 'Gomitas'],
          },
        },
        {
          productId: 'prod-soda-lulo',
          name: 'Soda Artesanal de Lulo',
          quantity: 1,
          unitPrice: 12000,
          subtotal: 12000,
          customization: {
            size: 'Vaso',
            flavors: [],
            addOns: [],
          },
        },
      ];

      const cartItems = orderItemsToCartItems(orderItems);

      expect(cartItems).toHaveLength(2);
      expect(cartItems[0]).toEqual({
        productId: 'prod-granizado-mora',
        name: 'Granizado de Mora Silvestre',
        price: 15000,
        quantity: 2,
        image: '/catalog-placeholder.svg',
        customization: {
          size: '16 oz',
          flavors: ['Mora', 'Fresa'],
          addOns: ['Lecherita', 'Gomitas'],
        },
      });
      expect(cartItems[1]).toEqual({
        productId: 'prod-soda-lulo',
        name: 'Soda Artesanal de Lulo',
        price: 12000,
        quantity: 1,
        image: '/catalog-placeholder.svg',
        customization: {
          size: 'Vaso',
          flavors: [],
          addOns: [],
        },
      });
    });

    it('sanea valores faltantes, negativos o corruptos', () => {
      const corruptItems = [
        null,
        {},
        { productId: '', name: 'Invalido' },
        { productId: 'valid-id', name: '' },
        {
          productId: 'p-corrupt',
          name: 'Bebida Sin Tamaño',
          unitPrice: -2000,
          quantity: -3,
        },
      ];

      const result = orderItemsToCartItems(corruptItems);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        productId: 'p-corrupt',
        name: 'Bebida Sin Tamaño',
        price: 0,
        quantity: 1,
        image: '/catalog-placeholder.svg',
        customization: {
          size: 'Medium',
          flavors: [],
          addOns: [],
        },
      });
    });

    it('retorna array vacío si el argumento no es una lista válida', () => {
      expect(orderItemsToCartItems(null)).toEqual([]);
      expect(orderItemsToCartItems(undefined)).toEqual([]);
      expect(orderItemsToCartItems({})).toEqual([]);
    });
  });

  describe('RepeatOrderButton Component', () => {
    const sampleItems: OrderItem[] = [
      {
        productId: 'p-granizado',
        name: 'Granizado Neon',
        quantity: 2,
        unitPrice: 15000,
        subtotal: 30000,
        customization: {
          size: '16 oz',
          flavors: ['Maracuyá'],
          addOns: ['Tajín'],
        },
      },
    ];

    it('no renderiza nada si items es nulo o vacío', () => {
      const { container } = render(<RepeatOrderButton items={[]} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renderiza con icono, texto accesible y aria-label con ID de orden', () => {
      render(<RepeatOrderButton items={sampleItems} orderId="ORD-789" />);

      const button = screen.getByRole('button', { name: /repetir pedido #ord-789/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent(/repetir pedido/i);
    });

    it('agrega ítems al carrito, lanza toast informativo y redirige a /cart en 1 tap', () => {
      const onRepeatSpy = vi.fn();

      render(
        <RepeatOrderButton
          items={sampleItems}
          orderId="ORD-789"
          onRepeat={onRepeatSpy}
          redirectToCart={true}
        />
      );

      const button = screen.getByRole('button', { name: /repetir pedido #ord-789/i });
      fireEvent.click(button);

      expect(mockAddItems).toHaveBeenCalledTimes(1);
      expect(mockAddItems).toHaveBeenCalledWith([
        expect.objectContaining({
          productId: 'p-granizado',
          name: 'Granizado Neon',
          price: 15000,
          quantity: 2,
        }),
      ]);

      expect(mockToast).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '¡Pedido agregado al carrito!',
          description: expect.stringMatching(/2 bebidas agregadas/i),
        })
      );

      expect(onRepeatSpy).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/cart');
    });

    it('respeta redirectToCart=false mostrando feedback visual "¡Agregado!" sin redirigir', () => {
      render(
        <RepeatOrderButton
          items={sampleItems}
          orderId="ORD-100"
          redirectToCart={false}
        />
      );

      const button = screen.getByRole('button', { name: /repetir pedido #ord-100/i });
      fireEvent.click(button);

      expect(mockAddItems).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByText(/¡agregado!/i)).toBeInTheDocument();
    });
  });

  describe('OrderHistory integración con Repetir Pedido', () => {
    it('muestra el botón Repetir Pedido en cada tarjeta y carga la orden al hacer click', async () => {
      useAuth.mockReturnValue({
        user: { getIdToken: vi.fn().mockResolvedValue('fake-token') },
        loading: false,
      });

      const mockOrders: CustomerOrder[] = [
        {
          id: 'PED-1234',
          customerName: 'Andrés Staff',
          phone: '3001234567',
          address: 'Cra 40 # 50-20',
          total: 30000,
          subtotal: 30000,
          status: 'entregado',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: [
            {
              productId: 'cocktail-1',
              name: 'Granizado Blue Hawaiian',
              quantity: 2,
              unitPrice: 15000,
              subtotal: 30000,
              customization: {
                size: '16 oz',
                flavors: ['Piña Colada', 'Curaçao'],
                addOns: ['Gomitas'],
              },
            },
          ],
          statusHistory: [],
        },
      ];

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ orders: mockOrders }),
        })
      );

      render(<OrderHistory />);

      const repeatBtn = await screen.findByRole('button', {
        name: /repetir pedido #ped-1234/i,
      });
      expect(repeatBtn).toBeInTheDocument();

      fireEvent.click(repeatBtn);

      expect(mockAddItems).toHaveBeenCalledWith([
        expect.objectContaining({
          productId: 'cocktail-1',
          name: 'Granizado Blue Hawaiian',
          quantity: 2,
          price: 15000,
        }),
      ]);
      expect(mockPush).toHaveBeenCalledWith('/cart');
    });
  });

  describe('OrderStatusPage integración con Repetir Pedido', () => {
    it('incluye el botón de Repetir Pedido en el seguimiento de orden y lo procesa en 1 tap', async () => {
      useAuth.mockReturnValue({
        user: { getIdToken: vi.fn().mockResolvedValue('fake-token') },
        loading: false,
      });

      const mockOrder: Order = {
        id: 'PED-5678',
        clienteUid: 'user-1',
        customerName: 'Cliente VIP',
        phone: '3109876543',
        address: 'Barra Principal #4',
        serviceType: 'mesa',
        tableNumber: '4',
        total: 25000,
        subtotal: 25000,
        status: 'entregado',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [
          {
            productId: 'malteada-choco',
            name: 'Malteada de Chocolate Criollo',
            quantity: 1,
            unitPrice: 25000,
            subtotal: 25000,
            customization: {
              size: '14 oz',
              flavors: ['Chocolate'],
              addOns: ['Chantilly', 'Cerezas'],
            },
          },
        ],
        audit: {
          createdByUid: 'user-1',
          createdAt: new Date().toISOString(),
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.includes('/api/configuration')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                configuration: {
                  whatsappNumber: '573000000000',
                  messages: {
                    orderReceived: 'Recibido',
                    orderStatus: 'Tu orden #{status}',
                  },
                },
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ order: mockOrder }),
          });
        })
      );

      const params = Promise.resolve({ id: 'PED-5678' });
      await act(async () => {
        render(
          <Suspense fallback={<div>Cargando...</div>}>
            <OrderStatusPage params={params} />
          </Suspense>
        );
      });

      const repeatBtn = await screen.findByRole('button', {
        name: /repetir pedido #ped-5678/i,
      });
      expect(repeatBtn).toBeInTheDocument();

      fireEvent.click(repeatBtn);

      expect(mockAddItems).toHaveBeenCalledWith([
        expect.objectContaining({
          productId: 'malteada-choco',
          name: 'Malteada de Chocolate Criollo',
          quantity: 1,
          price: 25000,
        }),
      ]);
      expect(mockPush).toHaveBeenCalledWith('/cart');
    });
  });

  describe('AccountOrderDetailPage integración con Repetir Pedido', () => {
    it('incluye el botón de Repetir Pedido en la vista de detalle y lo procesa al carrito', async () => {
      useAuth.mockReturnValue({
        user: { getIdToken: vi.fn().mockResolvedValue('fake-token') },
        loading: false,
      });

      const mockCustomerOrder: CustomerOrder = {
        id: 'PED-9999',
        customerName: 'Cliente Bar',
        phone: '3112223344',
        address: 'Calle 10 # 43E-10',
        total: 18000,
        subtotal: 18000,
        status: 'entregado',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [
          {
            productId: 'granizado-lulo',
            name: 'Granizado de Lulo Tropical',
            quantity: 1,
            unitPrice: 18000,
            subtotal: 18000,
            customization: {
              size: '16 oz',
              flavors: ['Lulo'],
              addOns: ['Lecherita'],
            },
          },
        ],
        statusHistory: [],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.includes('/api/configuration')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                configuration: {
                  whatsappNumber: '573000000000',
                  messages: {
                    orderReceived: 'Recibido',
                    orderStatus: 'Tu orden #{status}',
                  },
                },
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ order: mockCustomerOrder }),
          });
        })
      );

      const params = Promise.resolve({ id: 'PED-9999' });
      await act(async () => {
        render(
          <Suspense fallback={<div>Cargando...</div>}>
            <AccountOrderDetailPage params={params} />
          </Suspense>
        );
      });

      const repeatBtn = await screen.findByRole('button', {
        name: /repetir pedido #ped-9999/i,
      });
      expect(repeatBtn).toBeInTheDocument();

      fireEvent.click(repeatBtn);

      expect(mockAddItems).toHaveBeenCalledWith([
        expect.objectContaining({
          productId: 'granizado-lulo',
          name: 'Granizado de Lulo Tropical',
          quantity: 1,
          price: 18000,
        }),
      ]);
      expect(mockPush).toHaveBeenCalledWith('/cart');
    });
  });
});
