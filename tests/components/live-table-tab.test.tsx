import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveTableTabSheet } from "@/components/orders/LiveTableTabSheet";
import TableServiceBanner from "@/components/products/TableServiceBanner";
import { CartProvider, useCart } from "@/context/cart-context";
import type { PublicTableTab } from "@/types/tabs";

function CartSeeder({
  seed,
}: {
  seed?: boolean;
}) {
  const { addItem } = useCart();

  useEffect(() => {
    if (!seed) return;
    addItem({
      productId: "prod-maracuya",
      name: "Granizado Maracuyá",
      price: 15000,
      quantity: 2,
      image: "/catalog-placeholder.svg",
      customization: {
        size: "16 oz",
        flavors: ["Maracuyá"],
        addOns: ["Gomitas"],
      },
    });
  }, [addItem, seed]);

  return null;
}

const existingTabFixture: PublicTableTab = {
  id: "tab-mesa-4",
  negocioId: "coctels-ops",
  tableNumber: "Mesa 4",
  customerName: "Grupo de Laura",
  guestCount: 2,
  status: "abierta",
  rounds: [
    {
      roundNumber: 1,
      orderId: "ord-r1",
      orderStatus: "preparando",
      items: [
        {
          productId: "prod-fresa",
          name: "Fresa Salvaje",
          quantity: 1,
          unitPrice: 18000,
          subtotal: 18000,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ],
      subtotal: 18000,
      createdAt: "2026-11-22T21:00:00.000Z",
      source: "cliente_qr",
    },
  ],
  itemsCount: 1,
  subtotal: 18000,
  total: 18000,
  openedAt: "2026-11-22T20:55:00.000Z",
  updatedAt: "2026-11-22T21:00:00.000Z",
};

describe("LiveTableTabSheet", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("no se renderiza sin mesa activa ni en modo Barra", () => {
    const { container, rerender } = render(
      <CartProvider>
        <LiveTableTabSheet />
      </CartProvider>,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <CartProvider>
        <LiveTableTabSheet initialMesa="Barra" />
      </CartProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("carga la cuenta en vivo con estados KDS y muestra barra con tap target >= 44px", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tableNumber: "Mesa 4",
          negocioId: "coctels-ops",
          tab: existingTabFixture,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider>
        <LiveTableTabSheet initialMesa="4" negocioId="coctels-ops" />
      </CartProvider>,
    );

    const barButton = await screen.findByRole("button", {
      name: /Abrir cuenta en vivo de Mesa 4/i,
    });
    expect(barButton.className).toContain("min-h-[52px]");

    fireEvent.click(barButton);

    await waitFor(() => {
      expect(screen.getByText(/Historial de rondas en vivo/i)).toBeInTheDocument();
      expect(screen.getByText(/Preparando en barra/i)).toBeInTheDocument();
      expect(screen.getByText(/1x Fresa Salvaje/i)).toBeInTheDocument();
    });
  });

  it("envía una ronda desde el carrito sin exigir login/email, limpia el carrito y actualiza el total", async () => {
    const updatedTab: PublicTableTab = {
      ...existingTabFixture,
      rounds: [
        ...existingTabFixture.rounds,
        {
          roundNumber: 2,
          orderId: "ord-r2",
          orderStatus: "pendiente",
          items: [
            {
              productId: "prod-maracuya",
              name: "Granizado Maracuyá",
              quantity: 2,
              unitPrice: 15000,
              subtotal: 30000,
              customization: { size: "16 oz", flavors: ["Maracuyá"], addOns: ["Gomitas"] },
            },
          ],
          subtotal: 30000,
          createdAt: "2026-11-22T21:10:00.000Z",
          source: "cliente_qr",
        },
      ],
      itemsCount: 3,
      subtotal: 48000,
      total: 48000,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tableNumber: "Mesa 4", negocioId: "coctels-ops", tab: existingTabFixture }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tableNumber: "Mesa 4", negocioId: "coctels-ops", tab: existingTabFixture }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tab: updatedTab,
            orderId: "ord-r2",
            round: updatedTab.rounds[1],
            createdTab: false,
            idempotentReplay: false,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider>
        <CartSeeder seed />
        <LiveTableTabSheet initialMesa="4" negocioId="coctels-ops" />
      </CartProvider>,
    );

    const barButton = await screen.findByRole("button", {
      name: /Abrir cuenta en vivo de Mesa 4/i,
    });
    fireEvent.click(barButton);

    const sendRoundBtn = await screen.findByRole("button", {
      name: /Enviar ronda a barra/i,
    });
    expect(sendRoundBtn.className).toContain("min-h-[48px]");

    fireEvent.click(sendRoundBtn);

    await waitFor(() => {
      expect(screen.getByText(/¡Ronda #2 enviada a la barra!/i)).toBeInTheDocument();
      expect(screen.getByText(/2x Granizado Maracuyá/i)).toBeInTheDocument();
      expect(screen.queryByText(/Ronda por enviar/i)).not.toBeInTheDocument();
    });

    const postCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const headers = (postCall?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBeTruthy();
    const parsedBody = JSON.parse(String((postCall?.[1] as RequestInit).body));
    expect(parsedBody.action).toBe("add_round");
    expect(parsedBody.items).toHaveLength(1);
  });

  it("permite solicitar la cuenta dividida entre comensales en 1 tap", async () => {
    const tabWithBillRequest: PublicTableTab = {
      ...existingTabFixture,
      billRequest: {
        requestedAt: "2026-11-22T21:15:00.000Z",
        splitMode: "equal",
        guestCount: 3,
        perPersonAmount: 6000,
        preferredMethod: "nequi",
      },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tableNumber: "Mesa 4", negocioId: "coctels-ops", tab: existingTabFixture }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tableNumber: "Mesa 4", negocioId: "coctels-ops", tab: existingTabFixture }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tab: tabWithBillRequest }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <CartProvider>
        <LiveTableTabSheet initialMesa="4" negocioId="coctels-ops" />
      </CartProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Abrir cuenta en vivo de Mesa 4/i }),
    );

    const divideBtn = await screen.findByRole("button", { name: /Dividir cuenta/i });
    expect(divideBtn.className).toContain("min-h-[44px]");
    fireEvent.click(divideBtn);

    const incGuestsBtn = screen.getByRole("button", { name: /Aumentar personas/i });
    expect(incGuestsBtn.className).toContain("min-h-[44px]");
    fireEvent.click(incGuestsBtn);

    expect(screen.getByText(/3 personas/i)).toBeInTheDocument();
    expect(screen.getByText(/Total por persona:\s*\$?\s*6\.000/i)).toBeInTheDocument();

    const nequiBtn = screen.getByRole("button", { name: "Nequi" });
    expect(nequiBtn.className).toContain("min-h-[44px]");
    fireEvent.click(nequiBtn);

    const requestBillBtn = screen.getByRole("button", { name: /Solicitar cuenta a la mesa/i });
    expect(requestBillBtn.className).toContain("min-h-[48px]");
    fireEvent.click(requestBillBtn);

    await waitFor(() => {
      expect(screen.getByText(/Cuenta solicitada dividida entre 3 personas/i)).toBeInTheDocument();
    });
  });

  it("se oculta inmediatamente cuando el cliente quita la mesa desde TableServiceBanner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ tableNumber: "Mesa 4", negocioId: "coctels-ops", tab: null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(
      <CartProvider>
        <TableServiceBanner initialMesa="4" />
        <LiveTableTabSheet initialMesa="4" />
      </CartProvider>,
    );

    expect(
      await screen.findByRole("button", { name: /Abrir cuenta en vivo de Mesa 4/i }),
    ).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: /Quitar mesa y pedir para domicilio/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Abrir cuenta en vivo de Mesa 4/i }),
      ).not.toBeInTheDocument();
    });
  });
});
