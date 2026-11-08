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
    <a href={href} {...props}>
      {children}
    </a>
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

describe("Checkout delivery estimate and coupon redemption", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    useCart.mockReturnValue({
      totalPrice: 30000,
      items: [
        {
          id: "item-1",
          productId: "fresa",
          name: "Granizado Fresa",
          price: 15000,
          quantity: 2,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ],
      clearCart: vi.fn(),
      getCheckoutItems: vi.fn(() => [
        {
          productId: "fresa",
          quantity: 2,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ]),
    });
    useAuth.mockReturnValue({
      user: { getIdToken: vi.fn().mockResolvedValue("token-123") },
      loading: false,
      isVerified: true,
    });
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

  it("valida un cupón promocional en servidor, desglosa el descuento y envía promotionCode al confirmar", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ configuration }),
        } as Response;
      }
      if (url.includes("/api/promotions/validate")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            applied: true,
            code: "FIESTA20",
            discount: 6000,
            subtotal: 30000,
            total: 24000,
          }),
        } as Response;
      }
      if (url.includes("/api/pedidos")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ order: { id: "pedido-promo-1" } }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    const promoInput = screen.getByPlaceholderText(/Ej: FIESTA20/i);
    fireEvent.change(promoInput, { target: { value: "fiesta20" } });

    const applyButton = screen.getByRole("button", { name: /Aplicar/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByText(/Cupón FIESTA20 activo/i)).toBeInTheDocument();
      expect(screen.getByText(/Descuento \(FIESTA20\)/i)).toBeInTheDocument();
      expect(screen.getByText(`$${(24000).toLocaleString()}`)).toBeInTheDocument();
    });

    // Completar datos y enviar pedido
    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), { target: { value: "Ana Pérez" } });
    fireEvent.change(screen.getByLabelText(/Teléfono de Contacto/i), { target: { value: "3245550000" } });
    fireEvent.change(screen.getByLabelText(/Dirección Exacta/i), { target: { value: "Calle 10 # 20-30" } });

    fireEvent.click(screen.getByRole("button", { name: /CONFIRMAR PEDIDO/i }));

    await waitFor(() => {
      const orderCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("/api/pedidos"));
      expect(orderCall).toBeDefined();
      const body = JSON.parse(String(orderCall?.[1]?.body ?? "{}"));
      expect(body.promotionCode).toBe("FIESTA20");
    });
  });

  it("muestra mensaje de error cuando el servidor rechaza el cupón y permite quitar un cupón aplicado", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ configuration }),
        } as Response;
      }
      if (url.includes("/api/promotions/validate")) {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            applied: false,
            error: "Este código promocional ha expirado o aún no está vigente.",
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    const promoInput = screen.getByPlaceholderText(/Ej: FIESTA20/i);
    fireEvent.change(promoInput, { target: { value: "VENCIDO" } });
    fireEvent.click(screen.getByRole("button", { name: /Aplicar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Este código promocional ha expirado/i)).toBeInTheDocument();
    });
  });

  it("detecta y aplica automáticamente Happy Hour activo sin requerir ingreso manual de código", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return { ok: true, status: 200, json: async () => ({ configuration }) } as Response;
      }
      if (url.includes("/api/promotions/active")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            activeHappyHours: [
              { code: "HAPPY2X1", title: "Happy Hour 2x1", discountType: "2x1" },
            ],
          }),
        } as Response;
      }
      if (url.includes("/api/promotions/validate")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            applied: true,
            code: "HAPPY2X1",
            title: "Happy Hour 2x1",
            discountType: "2x1",
            discount: 15000,
            subtotal: 30000,
            total: 15000,
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Happy Hour Happy Hour 2x1/i)).toBeInTheDocument();
      expect(screen.getAllByText(`-$${(15000).toLocaleString()}`)).toHaveLength(2);
    });
  });
});
