import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CartPage from '@/app/cart/page';
import {
  SERVICE_MESA_STORAGE_KEY,
  SERVICE_NEGOCIO_ID_STORAGE_KEY,
  SERVICE_STORE_NAME_STORAGE_KEY,
  SERVICE_TENANT_SLUG_STORAGE_KEY,
  SERVICE_TYPE_STORAGE_KEY,
} from '@/components/products/TableServiceBanner';
import { CartProvider, CART_STORAGE_KEY, type CartItem } from '@/context/cart-context';

describe('CartPage UI Component', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('muestra el estado vacío cuando no hay ítems en el carrito', async () => {
    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    const emptyTitle = await screen.findByRole('heading', { name: /tu carrito está vacío/i });
    expect(emptyTitle).toBeInTheDocument();

    const exploreLink = screen.getByRole('link', { name: /explorar el menú/i });
    expect(exploreLink).toHaveAttribute('href', '/menu');
  });

  it('muestra los productos con tamaño, sabores, adiciones y precios en COP', async () => {
    const mockItems: CartItem[] = [
      {
        id: 'mock-1',
        productId: 'granizado-1',
        name: 'Granizado Artesanal',
        price: 15000,
        quantity: 1,
        image: '/test.png',
        customization: {
          size: 'Medium',
          flavors: ['Maracuyá'],
          addOns: ['Lecherita', 'Gomitas'],
        },
      },
    ];

    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(mockItems));

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    expect(await screen.findByText('Granizado Artesanal')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Maracuyá')).toBeInTheDocument();
    expect(screen.getByText('+ Lecherita')).toBeInTheDocument();
    expect(screen.getByText('+ Gomitas')).toBeInTheDocument();
    expect(screen.getAllByText('$15.000').length).toBeGreaterThan(0);
  });

  it('el botón de disminuir está deshabilitado cuando quantity es 1', async () => {
    const mockItems: CartItem[] = [
      {
        id: 'mock-1',
        productId: 'granizado-1',
        name: 'Granizado Artesanal',
        price: 15000,
        quantity: 1,
        image: '/test.png',
        customization: {
          size: 'Medium',
          flavors: ['Maracuyá'],
          addOns: [],
        },
      },
    ];

    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(mockItems));

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await screen.findByText('Granizado Artesanal');
    const decreaseBtn = screen.getByRole('button', { name: /disminuir cantidad de granizado artesanal/i });
    expect(decreaseBtn).toBeDisabled();

    const increaseBtn = screen.getByRole('button', { name: /aumentar cantidad de granizado artesanal/i });
    expect(increaseBtn).not.toBeDisabled();

    fireEvent.click(increaseBtn);

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(decreaseBtn).not.toBeDisabled();
  });

  it('permite eliminar un ítem directamente con el botón de basura', async () => {
    const mockItems: CartItem[] = [
      {
        id: 'mock-1',
        productId: 'granizado-1',
        name: 'Granizado Artesanal',
        price: 15000,
        quantity: 1,
        image: '/test.png',
        customization: {
          size: 'Medium',
          flavors: ['Maracuyá'],
          addOns: [],
        },
      },
    ];

    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(mockItems));

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    await screen.findByText('Granizado Artesanal');
    const deleteBtn = screen.getByRole('button', { name: /eliminar granizado artesanal del pedido/i });

    fireEvent.click(deleteBtn);

    expect(await screen.findByRole('heading', { name: /tu carrito está vacío/i })).toBeInTheDocument();
  });

  it('muestra envío de ronda sin fricción cuando hay una mesa QR activa en sessionStorage', async () => {
    const mockItems: CartItem[] = [
      {
        id: 'mock-qr-1',
        productId: 'granizado-1',
        name: 'Granizado Maracuyá',
        price: 15000,
        quantity: 2,
        image: '/catalog-placeholder.svg',
        customization: {
          size: '16 oz',
          flavors: ['Maracuyá'],
          addOns: ['Gomitas'],
        },
      },
    ];

    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(mockItems));
    sessionStorage.setItem(SERVICE_MESA_STORAGE_KEY, 'Mesa 4');
    sessionStorage.setItem(SERVICE_TYPE_STORAGE_KEY, 'mesa');
    sessionStorage.setItem(SERVICE_NEGOCIO_ID_STORAGE_KEY, 'neg-la-70');
    sessionStorage.setItem(SERVICE_TENANT_SLUG_STORAGE_KEY, 'la-70');
    sessionStorage.setItem(SERVICE_STORE_NAME_STORAGE_KEY, 'Coctels La 70');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ tableNumber: 'Mesa 4', negocioId: 'neg-la-70', tab: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    render(
      <CartProvider>
        <CartPage />
      </CartProvider>,
    );

    expect(await screen.findByText('Mesa 4 · Sin recargo')).toBeInTheDocument();

    const exploreLinks = screen.getAllByRole('link', { name: /agregar más bebidas|seguir explorando la carta/i });
    expect(exploreLinks[0]).toHaveAttribute('href', '/m/la-70');

    const sendRoundCta = screen.getByRole('button', { name: /enviar ronda a mesa 4/i });
    expect(sendRoundCta.className).toContain('min-h-[48px]');

    fireEvent.click(sendRoundCta);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /mesa 4/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /enviar ronda a barra/i })).toBeInTheDocument();
      expect(screen.getByText(/coctels la 70 · autopedido directo a barra sin esperas/i)).toBeInTheDocument();
    });
  });
});
