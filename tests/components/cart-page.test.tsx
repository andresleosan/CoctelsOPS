import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CartPage from '@/app/cart/page';
import { CartProvider, CART_STORAGE_KEY, type CartItem } from '@/context/cart-context';

describe('CartPage UI Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
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
});
