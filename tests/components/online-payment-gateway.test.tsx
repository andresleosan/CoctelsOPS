import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useCart,
  useAuth,
  useRouter,
  pushSpy,
  clearCartSpy,
  navigateToExternalUrlSpy,
} = vi.hoisted(() => ({
  useCart: vi.fn(),
  useAuth: vi.fn(),
  useRouter: vi.fn(),
  pushSpy: vi.fn(),
  clearCartSpy: vi.fn(),
  navigateToExternalUrlSpy: vi.fn(),
}));

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
vi.mock("@/lib/payments/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/client")>();
  return {
    ...actual,
    navigateToExternalUrl: navigateToExternalUrlSpy,
  };
});

import CheckoutPage from "@/app/checkout/page";
import { OnlinePaymentGatewayCard } from "@/components/orders/OnlinePaymentGatewayCard";
import type { OnlinePaymentGatewayOption, Order } from "@/types/orders";

const configuration = {
  whatsappNumber: "573245550000",
  businessHours: [],
  deliveryZones: ["Centro"],
  estimatedDeliveryMinutes: 45,
  messages: {
    orderReceived: "Recibido",
    orderStatus: "Estado",
    unavailable: "No disponible",
  },
};

const gatewaysFixture: OnlinePaymentGatewayOption[] = [
  {
    provider: "wompi",
    label: "Wompi",
    subtitle: "Tarjeta, PSE, Nequi o Bancolombia",
    mode: "test",
  },
  {
    provider: "bold",
    label: "Bold",
    subtitle: "Tarjeta, PSE o botón Bancolombia",
    mode: "live",
  },
];

describe("TASK-37: Pago online firmado en /checkout y /order-status/[id]", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
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
      clearCart: clearCartSpy,
      getCheckoutItems: vi.fn(() => [
        {
          productId: "fresa",
          quantity: 2,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ]),
    });
    useAuth.mockReturnValue({
      user: { getIdToken: vi.fn().mockResolvedValue("token-customer") },
      loading: false,
      isVerified: true,
    });
    useRouter.mockReturnValue({ replace: vi.fn(), push: pushSpy });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("en /checkout permite seleccionar Pago Online (Bold), crea pedido, solicita sesión firmada y redirige", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return { ok: true, status: 200, json: async () => ({ configuration }) } as Response;
      }
      if (url.includes("/api/payments/checkout-session") && (!init?.method || init.method === "GET")) {
        return { ok: true, status: 200, json: async () => ({ gateways: gatewaysFixture }) } as Response;
      }
      if (url === "/api/pedidos") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ order: { id: "ord-online-1" } }),
        } as Response;
      }
      if (url === "/api/payments/checkout-session" && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            session: {
              provider: "bold",
              checkoutUrl: "https://checkout.bold.co/payment?order-id=COCTELS%3Aord-online-1",
            },
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByTestId("checkout-payment-online-option")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/PAGO ONLINE INSTANTÁNEO \(WOMPI \/ BOLD\)/i));
    fireEvent.click(screen.getByTestId("checkout-gateway-bold"));

    expect(screen.getByRole("button", { name: /PAGAR CON BOLD/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), {
      target: { value: "Laura Gómez" },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono de Contacto/i), {
      target: { value: "3005556677" },
    });
    fireEvent.change(screen.getByLabelText(/Dirección Exacta/i), {
      target: { value: "Calle 10 # 40-20" },
    });

    fireEvent.click(screen.getByRole("button", { name: /PAGAR CON BOLD/i }));

    await waitFor(() => {
      const sessionCall = fetchSpy.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/payments/checkout-session" && init?.method === "POST",
      );
      expect(sessionCall).toBeDefined();
      const body = JSON.parse(String(sessionCall?.[1]?.body ?? "{}"));
      expect(body).toEqual({ orderId: "ord-online-1", provider: "bold" });
      expect(clearCartSpy).toHaveBeenCalled();
      expect(navigateToExternalUrlSpy).toHaveBeenCalledWith(
        "https://checkout.bold.co/payment?order-id=COCTELS%3Aord-online-1",
      );
    });
  });

  it("si falla la creación de sesión online en /checkout, conserva el pedido y redirige a /order-status con paymentInitError=1", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return { ok: true, status: 200, json: async () => ({ configuration }) } as Response;
      }
      if (url.includes("/api/payments/checkout-session") && (!init?.method || init.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ gateways: [gatewaysFixture[0]] }),
        } as Response;
      }
      if (url === "/api/pedidos") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ order: { id: "ord-online-fallback" } }),
        } as Response;
      }
      if (url === "/api/payments/checkout-session" && init?.method === "POST") {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: "Pasarela temporalmente no disponible" }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByTestId("checkout-payment-online-option")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/PAGO ONLINE INSTANTÁNEO \(WOMPI \/ BOLD\)/i));
    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), {
      target: { value: "Carlos Ruiz" },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono de Contacto/i), {
      target: { value: "3019998877" },
    });
    fireEvent.change(screen.getByLabelText(/Dirección Exacta/i), {
      target: { value: "Av 80 # 30-10" },
    });

    fireEvent.click(screen.getByRole("button", { name: /PAGAR CON WOMPI/i }));

    await waitFor(() => {
      expect(clearCartSpy).toHaveBeenCalled();
      expect(navigateToExternalUrlSpy).not.toHaveBeenCalled();
      expect(pushSpy).toHaveBeenCalledWith("/order-status/ord-online-fallback?paymentInitError=1");
    });
  });

  it("OnlinePaymentGatewayCard muestra retorno pendiente con verificación manual, bloquea URLs inseguras y oculta botón si ya está verificado", async () => {
    const baseOrder: Pick<
      Order,
      "id" | "total" | "status" | "paymentVerificationStatus" | "paymentVerification" | "paymentGateway"
    > = {
      id: "ord-status-1",
      total: 35000,
      status: "pendiente",
      paymentVerificationStatus: "pendiente_verificacion",
    };

    const onRefreshStatus = vi.fn();
    const onRedirect = vi.fn();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        session: {
          provider: "wompi",
          checkoutUrl: "https://evil-phishing.example.com/pay",
        },
      }),
    } as Response);

    const { rerender } = render(
      <OnlinePaymentGatewayCard
        order={baseOrder}
        gateways={gatewaysFixture}
        getIdToken={vi.fn().mockResolvedValue("token-123")}
        paymentReturnProvider="wompi"
        paymentInitError
        onRefreshStatus={onRefreshStatus}
        onRedirect={onRedirect}
      />,
    );

    expect(screen.getByTestId("gateway-return-pending")).toBeInTheDocument();
    expect(screen.getByTestId("gateway-init-error-banner")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Verificar estado ahora/i }));
    expect(onRefreshStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("btn-pay-online-gateway"));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(onRedirect).not.toHaveBeenCalled();
      expect(
        screen.getByText(/La URL de pago recibida no pertenece a una pasarela autorizada/i),
      ).toBeInTheDocument();
    });

    rerender(
      <OnlinePaymentGatewayCard
        order={{
          ...baseOrder,
          status: "confirmado",
          paymentVerificationStatus: "verificado",
          paymentGateway: {
            provider: "wompi",
            transactionId: "tx-1",
            eventId: "evt-1",
            status: "approved",
            amountCop: 35000,
            currency: "COP",
            confirmedAt: "2026-11-25T02:00:00.000Z",
          },
        }}
        gateways={gatewaysFixture}
        getIdToken={vi.fn().mockResolvedValue("token-123")}
        paymentReturnProvider="wompi"
      />,
    );

    expect(screen.getByTestId("gateway-return-verified")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-pay-online-gateway")).not.toBeInTheDocument();
  });
});
