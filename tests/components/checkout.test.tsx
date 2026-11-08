import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCart } = vi.hoisted(() => ({ useCart: vi.fn() }));
const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
const { useRouter } = vi.hoisted(() => ({ useRouter: vi.fn() }));

vi.mock("@/context/cart-context", () => ({ useCart }));
vi.mock("@/hooks/use-auth", () => ({ useAuth }));
vi.mock("next/navigation", () => ({ useRouter }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import CheckoutPage from "@/app/checkout/page";

const configuration = {
  whatsappNumber: "573245550000",
  businessHours: [],
  deliveryZones: ["Centro"],
  estimatedDeliveryMinutes: 60,
  messages: { orderReceived: "Recibido", orderStatus: "Estado", unavailable: "No disponible" },
};

describe("Checkout delivery estimate", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    useCart.mockReturnValue({
      totalPrice: 0,
      items: [],
      clearCart: vi.fn(),
      getCheckoutItems: vi.fn(() => []),
    });
    useAuth.mockReturnValue({ user: {}, loading: false, isVerified: true });
    useRouter.mockReturnValue({ replace: vi.fn(), push: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("no muestra una estimación cuando la configuración no está disponible", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);

    render(<CheckoutPage />);

    expect(screen.queryByText(/Entrega estimada/)).not.toBeInTheDocument();
  });

  it("muestra la estimación configurada por la API", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ configuration }),
    } as Response);

    render(<CheckoutPage />);

    await waitFor(() => expect(screen.getByText("Entrega estimada: 60 min")).toBeInTheDocument());
  });

  it("permite seleccionar modo En Mesa y solicita el identificador de mesa", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ configuration }),
    } as Response);

    render(<CheckoutPage />);

    const mesaBtn = screen.getByRole("button", { name: /En Mesa/i });
    fireEvent.click(mesaBtn);

    expect(screen.getByLabelText(/Número o Identificador de Mesa/i)).toBeInTheDocument();
  });

  it("permite seleccionar modo En Barra y muestra indicación de barra", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ configuration }),
    } as Response);

    render(<CheckoutPage />);

    const barraBtn = screen.getByRole("button", { name: /En Barra/i });
    fireEvent.click(barraBtn);

    expect(screen.getByText(/Retiro en Barra Principal/i)).toBeInTheDocument();
  });
});
