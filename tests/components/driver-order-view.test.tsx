import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("fake-driver-token") };

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: true,
  }),
}));

vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-guard">{children}</div>
  ),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ pedidoId: "ord-driver-1234" }),
}));

import DriverOrderPage from "@/app/repartidor/[pedidoId]/page";
import {
  buildDriverCallHref,
  buildDriverWhatsAppHref,
  buildGoogleMapsHref,
  buildWazeHref,
  DriverOrderView,
} from "@/components/delivery/DriverOrderView";
import type { Order } from "@/types/orders";

const BASE_TIME = Date.parse("2026-11-13T20:00:00.000Z");

const sampleDeliveryOrder: Order = {
  id: "ord-driver-1234",
  clienteUid: "cli-99",
  customerName: "Sebastián Cardona",
  phone: "311 456 7890",
  address: "Calle 66D # 37-20, Villa Hermosa",
  notes: "Portería edificio azul, llamar al llegar",
  serviceType: "delivery",
  items: [
    {
      productId: "granizado-ops",
      name: "Granizado OPS",
      quantity: 2,
      unitPrice: 15000,
      subtotal: 30000,
      customization: {
        size: "16 oz",
        flavors: ["Maracuyá", "Cereza"],
        addOns: ["Gomitas", "Chamoy"],
      },
    },
    {
      productId: "malteada-oreo",
      name: "Malteada Oreo",
      quantity: 1,
      unitPrice: 15000,
      subtotal: 15000,
      customization: {
        size: "14 oz",
        flavors: ["Oreo"],
        addOns: [],
      },
    },
  ],
  subtotal: 45000,
  total: 45000,
  status: "en_camino",
  createdAt: "2026-11-13T19:48:00.000Z", // 12 min ago -> warning
  updatedAt: "2026-11-13T19:55:00.000Z",
  audit: {
    createdByUid: "cli-99",
    createdAt: "2026-11-13T19:48:00.000Z",
  },
};

describe("DriverOrderView domain helpers", () => {
  it("formats telephone links with tel: scheme cleanly", () => {
    expect(buildDriverCallHref("311 456 7890")).toBe("tel:3114567890");
    expect(buildDriverCallHref("+57 (311) 456-7890")).toBe("tel:+573114567890");
  });

  it("normalizes 10-digit Colombian mobile numbers with 57 prefix and formats WhatsApp message", () => {
    const href = buildDriverWhatsAppHref(sampleDeliveryOrder, sampleDeliveryOrder.phone);
    expect(href.startsWith("https://wa.me/573114567890?text=")).toBe(true);

    const decoded = decodeURIComponent(href.split("?text=")[1]);
    expect(decoded).toContain("Sebastián Cardona");
    expect(decoded).toContain("#ord-driv");
    expect(decoded).toContain("45.000");
    expect(decoded).toContain("Calle 66D # 37-20, Villa Hermosa");
  });

  it("builds Google Maps and Waze URLs with Medellín geographic context", () => {
    const gmaps = buildGoogleMapsHref("Calle 66D # 37-20, Villa Hermosa");
    expect(gmaps.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(decodeURIComponent(gmaps)).toContain("Calle 66D # 37-20, Villa Hermosa, Medellín, Colombia");

    const waze = buildWazeHref("Calle 66D # 37-20, Villa Hermosa");
    expect(waze.startsWith("https://waze.com/ul?q=")).toBe(true);
    expect(waze).toContain("&navigate=yes");
    expect(decodeURIComponent(waze)).toContain("Calle 66D # 37-20, Villa Hermosa, Medellín, Colombia");

    const gmapsAlreadyMedellin = buildGoogleMapsHref("Cra 43A # 10-20, Medellín");
    expect(decodeURIComponent(gmapsAlreadyMedellin)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Cra 43A # 10-20, Medellín",
    );
  });
});

describe("DriverOrderView component", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders customer info, delivery address, notes, recipe breakdown, total, and action links", () => {
    render(
      <DriverOrderView
        order={sampleDeliveryOrder}
        nowMs={BASE_TIME}
        onConfirmDelivery={vi.fn()}
      />,
    );

    expect(screen.getByTestId("driver-order-view")).toBeInTheDocument();
    expect(screen.getByText("Sebastián Cardona")).toBeInTheDocument();
    expect(screen.getByTestId("driver-delivery-address")).toHaveTextContent(
      "Calle 66D # 37-20, Villa Hermosa",
    );
    expect(screen.getByTestId("driver-delivery-notes")).toHaveTextContent(
      "Portería edificio azul, llamar al llegar",
    );
    expect(screen.getByText("3 vasos")).toBeInTheDocument();
    expect(screen.getByText("2x Granizado OPS")).toBeInTheDocument();
    expect(screen.getByText("Maracuyá, Cereza")).toBeInTheDocument();
    expect(screen.getByText(/Gomitas, Chamoy/)).toBeInTheDocument();
    expect(screen.getByTestId("driver-order-total")).toHaveTextContent("$45.000 COP");

    expect(screen.getByTestId("btn-driver-call")).toHaveAttribute("href", "tel:3114567890");
    expect(screen.getByTestId("btn-driver-whatsapp")).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/573114567890?text="),
    );
    expect(screen.getByTestId("btn-gps-waze")).toHaveAttribute(
      "href",
      expect.stringContaining("https://waze.com/ul?q="),
    );
    expect(screen.getByTestId("btn-gps-gmaps")).toHaveAttribute(
      "href",
      expect.stringContaining("https://www.google.com/maps/search/?api=1&query="),
    );
  });

  it("copies delivery address to clipboard when clicking copy button", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(
      <DriverOrderView
        order={sampleDeliveryOrder}
        nowMs={BASE_TIME}
        onConfirmDelivery={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("btn-copy-address"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("Calle 66D # 37-20, Villa Hermosa");
      expect(screen.getByTestId("btn-copy-address")).toHaveTextContent("¡Dirección copiada!");
    });
  });

  it("requires payment confirmation checkbox and selected payment method before confirming delivery", () => {
    const handleConfirm = vi.fn();
    render(
      <DriverOrderView
        order={sampleDeliveryOrder}
        nowMs={BASE_TIME}
        onConfirmDelivery={handleConfirm}
      />,
    );

    const confirmButton = screen.getByTestId("btn-confirm-delivery");
    expect(confirmButton).toBeDisabled();

    const transferenciaBtn = screen.getByTestId("payment-method-transferencia");
    const datafonoBtn = screen.getByTestId("payment-method-datafono");
    const efectivoBtn = screen.getByTestId("payment-method-efectivo");

    expect(efectivoBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(datafonoBtn);
    expect(datafonoBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(transferenciaBtn);
    expect(transferenciaBtn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTestId("checkbox-payment-collected"));
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleConfirm).toHaveBeenCalledWith({
      paymentCollected: true,
      paymentMethod: "transferencia",
    });
  });

  it("shows delivered banner and hides confirmation button when order is already entregado", () => {
    render(
      <DriverOrderView
        order={{ ...sampleDeliveryOrder, status: "entregado" }}
        nowMs={BASE_TIME}
        onConfirmDelivery={vi.fn()}
      />,
    );

    expect(screen.getByTestId("driver-delivered-banner")).toHaveTextContent(
      "¡Pedido Entregado Exitosamente!",
    );
    expect(screen.queryByTestId("btn-confirm-delivery")).not.toBeInTheDocument();
  });
});

describe("DriverOrderPage integration (/repartidor/[pedidoId])", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the order, confirms payment collection, patches status to entregado, and updates UI", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: { method?: string; body?: string }) => {
      if (url === "/api/pedidos/ord-driver-1234?view=admin" && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ order: sampleDeliveryOrder }),
        });
      }
      if (url === "/api/pedidos/ord-driver-1234" && options?.method === "PATCH") {
        const parsed = JSON.parse(options.body ?? "{}") as { status: Order["status"] };
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              order: { ...sampleDeliveryOrder, status: parsed.status },
            }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<DriverOrderPage />);

    await waitFor(() => {
      expect(screen.getByTestId("driver-order-view")).toBeInTheDocument();
    });

    expect(screen.getByText("Sebastián Cardona")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("payment-method-efectivo"));
    fireEvent.click(screen.getByTestId("checkbox-payment-collected"));
    fireEvent.click(screen.getByTestId("btn-confirm-delivery"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pedidos/ord-driver-1234",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "entregado",
            reason: "Entregado - Cobro en efectivo",
          }),
        }),
      );
      expect(screen.getByTestId("driver-delivered-banner")).toBeInTheDocument();
    });
  });

  it("transitions preparando -> en_camino -> entregado when confirming delivery on an un-dispatched order", async () => {
    const preparingOrder: Order = { ...sampleDeliveryOrder, status: "preparando" };
    const fetchMock = vi.fn().mockImplementation((url: string, options?: { method?: string; body?: string }) => {
      if (url === "/api/pedidos/ord-driver-1234?view=admin" && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ order: preparingOrder }),
        });
      }
      if (url === "/api/pedidos/ord-driver-1234" && options?.method === "PATCH") {
        const parsed = JSON.parse(options.body ?? "{}") as { status: Order["status"] };
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              order: { ...preparingOrder, status: parsed.status },
            }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<DriverOrderPage />);

    await waitFor(() => {
      expect(screen.getByTestId("btn-start-route")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("payment-method-datafono"));
    fireEvent.click(screen.getByTestId("checkbox-payment-collected"));
    fireEvent.click(screen.getByTestId("btn-confirm-delivery"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pedidos/ord-driver-1234",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "en_camino",
            reason: "Repartidor en camino",
          }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pedidos/ord-driver-1234",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "entregado",
            reason: "Entregado - Cobro en datafono",
          }),
        }),
      );
      expect(screen.getByTestId("driver-delivered-banner")).toBeInTheDocument();
    });
  });
});
