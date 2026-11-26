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
import { EmergencyPauseControl } from "@/components/admin/EmergencyPauseControl";
import { StoreAvailabilityBanner } from "@/components/products/StoreAvailabilityBanner";
import { DEFAULT_STORE_CONFIGURATION, type StoreConfiguration } from "@/types/operations";

const allDaysClosedConfig: StoreConfiguration = {
  ...DEFAULT_STORE_CONFIGURATION,
  businessHours: DEFAULT_STORE_CONFIGURATION.businessHours.map((hour) => ({
    ...hour,
    closed: true,
  })),
  scheduledOrders: {
    enabled: false,
    slotIntervalMinutes: 30,
    minLeadMinutes: 45,
    maxDaysAhead: 2,
  },
};

const pausedWithFutureSlotsConfig: StoreConfiguration = {
  ...DEFAULT_STORE_CONFIGURATION,
  businessHours: DEFAULT_STORE_CONFIGURATION.businessHours.map((hour) => ({
    ...hour,
    open: "00:00",
    close: "23:59",
    closed: false,
  })),
  emergencyPause: {
    active: true,
    reason: "Barra llena por evento",
  },
  scheduledOrders: {
    enabled: true,
    slotIntervalMinutes: 30,
    minLeadMinutes: 45,
    maxDaysAhead: 2,
  },
};

describe("StoreAvailabilityBanner, EmergencyPauseControl y Checkout programado", () => {
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

  it("renderiza StoreAvailabilityBanner en estados open, paused y closed", () => {
    const openConfig: StoreConfiguration = {
      ...DEFAULT_STORE_CONFIGURATION,
      businessHours: DEFAULT_STORE_CONFIGURATION.businessHours.map((hour) => ({
        ...hour,
        open: "00:00",
        close: "23:59",
        closed: false,
      })),
    };
    const { rerender } = render(<StoreAvailabilityBanner configuration={openConfig} />);
    expect(screen.getByTestId("store-availability-banner")).toHaveAttribute("data-status", "open");
    expect(screen.getByText(/Abierto ahora/i)).toBeInTheDocument();

    rerender(<StoreAvailabilityBanner configuration={pausedWithFutureSlotsConfig} />);
    expect(screen.getByTestId("store-availability-banner")).toHaveAttribute("data-status", "paused");
    expect(screen.getByText(/Barra llena por evento/i)).toBeInTheDocument();

    rerender(<StoreAvailabilityBanner configuration={allDaysClosedConfig} />);
    expect(screen.getByTestId("store-availability-banner")).toHaveAttribute("data-status", "closed");
    expect(screen.getByText(/está cerrado en este momento/i)).toBeInTheDocument();
  });

  it("auto-selecciona pedido programado cuando la barra está pausada y envía scheduledFor en POST /api/pedidos", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ configuration: pausedWithFutureSlotsConfig }),
        } as Response;
      }
      if (url.includes("/api/pedidos")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ order: { id: "pedido-prog-1" } }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByTestId("checkout-unavailable-alert")).toBeInTheDocument();
      expect(screen.getByTestId("checkout-summary-scheduled")).toBeInTheDocument();
    });

    expect(screen.getByTestId("checkout-fulfillment-now")).toBeDisabled();

    fireEvent.click(screen.getByTestId("checkout-zone-laureles"));
    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), { target: { value: "Ana Pérez" } });
    fireEvent.change(screen.getByLabelText(/Teléfono de Contacto/i), { target: { value: "3245550000" } });
    fireEvent.change(screen.getByLabelText(/Dirección Exacta/i), { target: { value: "Calle 10 # 20-30" } });

    fireEvent.click(screen.getByRole("button", { name: /CONFIRMAR PEDIDO PROGRAMADO/i }));

    await waitFor(() => {
      const orderCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("/api/pedidos"));
      expect(orderCall).toBeDefined();
      const body = JSON.parse(String(orderCall?.[1]?.body ?? "{}"));
      expect(typeof body.scheduledFor).toBe("string");
      expect(Date.parse(body.scheduledFor)).not.toBeNaN();
    });
  });

  it("bloquea el botón de confirmar cuando el local está cerrado y no hay franjas programadas", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ configuration: allDaysClosedConfig }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByTestId("checkout-unavailable-alert")).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", { name: /LOCAL CERRADO/i });
    expect(submitButton).toBeDisabled();
  });

  it("permite pausar 30 min y reanudar desde EmergencyPauseControl llamando PATCH /api/admin/configuration", async () => {
    const onUpdated = vi.fn();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ configuration: pausedWithFutureSlotsConfig }),
    } as Response);

    const { rerender } = render(
      <EmergencyPauseControl
        mode="bar"
        configuration={DEFAULT_STORE_CONFIGURATION}
        onConfigurationUpdated={onUpdated}
        getAuthToken={async () => "staff-token"}
      />,
    );

    fireEvent.click(screen.getByTestId("btn-pause-store-30m"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/admin/configuration",
        expect.objectContaining({
          method: "PATCH",
        }),
      );
      expect(onUpdated).toHaveBeenCalledWith(pausedWithFutureSlotsConfig);
    });

    rerender(
      <EmergencyPauseControl
        mode="bar"
        configuration={pausedWithFutureSlotsConfig}
        onConfigurationUpdated={onUpdated}
        getAuthToken={async () => "staff-token"}
      />,
    );

    fireEvent.click(screen.getByTestId("btn-resume-store-orders"));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
