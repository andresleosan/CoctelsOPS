import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useRouter } = vi.hoisted(() => ({ useRouter: vi.fn() }));
const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter }));
vi.mock('@/hooks/use-auth', () => ({ useAuth }));
vi.mock('@/context/cart-context', () => ({
  useCart: () => ({
    items: [],
    addItem: vi.fn(),
    addItems: vi.fn(),
  }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { OrderRatingCard } from '@/components/orders/OrderRatingCard';
import OrderStatusPage from '@/app/order-status/[id]/page';
import AccountOrderDetailPage from '@/app/cuenta/pedidos/[id]/page';

describe('TASK-15: OrderRatingCard Component & Integration', () => {
  const mockGetIdToken = vi.fn().mockResolvedValue('fake-user-token');

  beforeEach(() => {
    vi.clearAllMocks();
    useRouter.mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    });
    useAuth.mockReturnValue({
      user: { uid: 'user-123', getIdToken: mockGetIdToken },
      loading: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renderiza las 5 estrellas interactivas con tap targets accesibles', () => {
    render(<OrderRatingCard orderId="ord-1" />);

    expect(screen.getByRole('radiogroup', { name: /calificación de 1 a 5 estrellas/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /1 estrella/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /2 estrellas/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /3 estrellas/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /4 estrellas/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /5 estrellas/i })).toBeInTheDocument();
  });

  it('permite seleccionar 5 estrellas en 1 toque y muestra chips de atributos', () => {
    render(<OrderRatingCard orderId="ord-1" />);

    const star5 = screen.getByRole('radio', { name: /5 estrellas/i });
    fireEvent.click(star5);

    expect(screen.getByText(/¡Excelente! Nos alegra mucho/i)).toBeInTheDocument();
    expect(screen.getByText(/🍓 Sabor increíble/i)).toBeInTheDocument();
    expect(screen.getByText(/❄️ Bien frío/i)).toBeInTheDocument();
    expect(screen.getByText(/⚡ Entrega rápida/i)).toBeInTheDocument();
  });

  it('permite seleccionar y deseleccionar chips rápidos de atributos', () => {
    render(<OrderRatingCard orderId="ord-1" />);

    // Click on 5 stars first to show chips
    fireEvent.click(screen.getByRole('radio', { name: /5 estrellas/i }));

    const tagChip = screen.getByTestId('tag-chip-🍓 Sabor increíble');
    expect(tagChip).toHaveAttribute('aria-pressed', 'false');

    // Select tag
    fireEvent.click(tagChip);
    expect(tagChip).toHaveAttribute('aria-pressed', 'true');

    // Deselect tag
    fireEvent.click(tagChip);
    expect(tagChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('permite agregar un comentario opcional y enviar la calificación', async () => {
    const mockRatingSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        rating: {
          stars: 5,
          tags: ['🍓 Sabor increíble'],
          comment: 'Estaba delicioso y bien frío',
          createdAt: '2026-11-07T22:30:00.000Z',
        },
      }),
    });
    global.fetch = fetchMock;

    render(<OrderRatingCard orderId="ord-99" onRatingSuccess={mockRatingSuccess} />);

    // Select 5 stars
    fireEvent.click(screen.getByRole('radio', { name: /5 estrellas/i }));

    // Select tag
    fireEvent.click(screen.getByTestId('tag-chip-🍓 Sabor increíble'));

    // Open comment field
    fireEvent.click(screen.getByText(/¿Deseas agregar un comentario adicional\?/i));
    const textarea = screen.getByTestId('rating-comment-textarea');
    fireEvent.change(textarea, { target: { value: 'Estaba delicioso y bien frío' } });

    // Submit
    const submitBtn = screen.getByTestId('submit-rating-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pedidos/ord-99/rating',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-user-token',
        }),
        body: JSON.stringify({
          stars: 5,
          tags: ['🍓 Sabor increíble'],
          comment: 'Estaba delicioso y bien frío',
        }),
      })
    );

    expect(mockRatingSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        stars: 5,
        tags: ['🍓 Sabor increíble'],
        comment: 'Estaba delicioso y bien frío',
      })
    );

    // Shows completed view
    expect(screen.getByTestId('order-rating-completed-card')).toBeInTheDocument();
    expect(screen.getByText(/¡Gracias por tu valoración!/i)).toBeInTheDocument();
    expect(screen.getByText(/5 de 5/i)).toBeInTheDocument();
  });

  it('muestra la vista completada directamente si ya existe initialRating y permite modificar', () => {
    render(
      <OrderRatingCard
        orderId="ord-1"
        initialRating={{
          stars: 4,
          tags: ['❄️ Bien frío'],
          comment: 'Muy buena experiencia',
          createdAt: '2026-11-07T20:00:00.000Z',
        }}
      />
    );

    expect(screen.getByTestId('order-rating-completed-card')).toBeInTheDocument();
    expect(screen.getByText(/4 de 5/i)).toBeInTheDocument();
    expect(screen.getByText(/❄️ Bien frío/i)).toBeInTheDocument();
    expect(screen.getByText(/“Muy buena experiencia”/i)).toBeInTheDocument();

    // Click Modificar
    fireEvent.click(screen.getByTestId('edit-rating-button'));
    expect(screen.getByTestId('order-rating-card')).toBeInTheDocument();
  });

  it('renderiza OrderRatingCard en OrderStatusPage cuando el pedido está entregado', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/configuration')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            configuration: {
              whatsappNumber: '573001234567',
              messages: { orderReceived: 'Pedido recibido', orderStatus: 'Tu orden está {status}' },
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          order: {
            id: 'pedido-entregado-1',
            status: 'entregado',
            total: 25000,
            address: 'Calle 10 # 20-30',
            items: [
              {
                productId: 'granizado-fresa',
                name: 'Granizado de Fresa',
                quantity: 1,
                unitPrice: 25000,
                subtotal: 25000,
                customization: { size: '16 oz', flavors: ['Fresa'], addOns: [] },
              },
            ],
            rating: {
              stars: 5,
              tags: ['🍓 Sabor increíble'],
              createdAt: '2026-11-07T21:00:00.000Z',
            },
          },
        }),
      });
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<OrderStatusPage params={Promise.resolve({ id: 'pedido-entregado-1' })} />);
    });

    expect(screen.getByTestId('order-rating-completed-card')).toBeInTheDocument();
    expect(screen.getByText(/¡Gracias por tu valoración!/i)).toBeInTheDocument();
  });

  it('renderiza OrderRatingCard en AccountOrderDetailPage cuando el pedido está entregado', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/configuration')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            configuration: {
              whatsappNumber: '573001234567',
              messages: { orderReceived: 'Pedido recibido', orderStatus: 'Tu orden está {status}' },
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          order: {
            id: 'pedido-cuenta-entregado',
            status: 'entregado',
            total: 18000,
            phone: '3001234567',
            address: 'Cra 43A # 1-50',
            createdAt: '2026-11-07T19:00:00.000Z',
            items: [
              {
                productId: 'mojito',
                name: 'Mojito Artesanal',
                quantity: 1,
                unitPrice: 18000,
                subtotal: 18000,
                customization: { size: '14 oz', flavors: ['Menta'], addOns: [] },
              },
            ],
            statusHistory: [{ status: 'entregado', at: '2026-11-07T20:00:00.000Z' }],
          },
        }),
      });
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<AccountOrderDetailPage params={Promise.resolve({ id: 'pedido-cuenta-entregado' })} />);
    });

    expect(screen.getByTestId('order-rating-card')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /calificación de 1 a 5 estrellas/i })).toBeInTheDocument();
  });
});
