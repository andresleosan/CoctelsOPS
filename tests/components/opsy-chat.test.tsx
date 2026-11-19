import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname,
}));

vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) => {
    const cleanProps = { ...props };
    delete cleanProps.priority;
    delete cleanProps.fill;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} {...cleanProps} />;
  },
}));

import OpsyChat from "@/components/opsy/OpsyChat";
import { CartProvider, CART_STORAGE_KEY } from "@/context/cart-context";

function renderOpsyChat() {
  return render(
    <CartProvider>
      <OpsyChat />
    </CartProvider>
  );
}

describe("OpsyChat UI Component", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    usePathname.mockReturnValue("/");
    // Mock scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renderiza el botón flotante (FAB) en rutas públicas", () => {
    renderOpsyChat();
    const launcherButton = screen.getByRole("button", { name: /abrir asistente opsy bot/i });
    expect(launcherButton).toBeInTheDocument();
  });

  it("se oculta completamente en las rutas administrativas /admin", () => {
    usePathname.mockReturnValue("/admin/productos");
    renderOpsyChat();
    const launcherButton = screen.queryByRole("button", { name: /abrir asistente opsy bot/i });
    expect(launcherButton).toBeNull();
  });

  it("abre el modal de chat al hacer clic en el lanzador y muestra el saludo inicial", () => {
    renderOpsyChat();
    const launcherButton = screen.getByRole("button", { name: /abrir asistente opsy bot/i });
    fireEvent.click(launcherButton);

    expect(screen.getByRole("dialog", { name: /chat con opsy bot/i })).toBeInTheDocument();
    expect(screen.getByText(/¡Qué más pues, parce!/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/pregúntale a opsy/i)).toBeInTheDocument();
  });

  it("permite cerrar el chat con el botón de cerrar (X) y restaura el lanzador", () => {
    renderOpsyChat();
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));

    const closeButton = screen.getByRole("button", { name: /cerrar chat/i });
    fireEvent.click(closeButton);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /abrir asistente opsy bot/i })).toBeInTheDocument();
  });

  it("permite cerrar el chat pulsando la tecla Escape", () => {
    renderOpsyChat();
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("envía un mensaje del usuario y al seleccionar una recomendación arma el carrito automáticamente", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: "¡De una parce! El de maracuyá está delicioso.",
        suggestions: [
          {
            id: "prod-maracuya",
            name: "Granizado de Maracuyá",
            category: "granizado",
            priceCop: 15000,
            href: "/menu?product=prod-maracuya",
          },
        ],
      }),
    });

    renderOpsyChat();
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));

    const input = screen.getByPlaceholderText(/pregúntale a opsy/i);
    fireEvent.change(input, { target: { value: "¿Qué granizado me recomiendas?" } });

    const submitButton = screen.getByRole("button", { name: /enviar mensaje/i });
    fireEvent.click(submitButton);

    // Mensaje del usuario visible
    expect(screen.getByText("¿Qué granizado me recomiendas?")).toBeInTheDocument();

    // Esperar respuesta de Opsy
    await waitFor(() => {
      expect(screen.getByText(/¡De una parce! El de maracuyá está delicioso./i)).toBeInTheDocument();
    });

    // Tarjeta de recomendación de producto y enlace secundario a la carta
    expect(screen.getByText("Granizado de Maracuyá")).toBeInTheDocument();
    expect(screen.getByText("$15.000 COP")).toBeInTheDocument();
    const detailLink = screen.getByRole("link", { name: /ver granizado de maracuyá en la carta/i });
    expect(detailLink).toHaveAttribute("href", "/menu?product=prod-maracuya");

    // Al seleccionar el producto se agrega automáticamente al carrito
    fireEvent.click(screen.getByRole("button", { name: /^Agregar Granizado de Maracuyá al carrito$/i }));

    const miniCart = await screen.findByTestId("opsy-mini-cart");
    expect(miniCart).toHaveTextContent("Tu pedido (1 producto)");
    expect(miniCart).toHaveTextContent("$15.000 COP");
    expect(screen.getByRole("link", { name: /pedir ya/i })).toHaveAttribute("href", "/checkout");
    expect(screen.getByRole("link", { name: /carrito/i })).toHaveAttribute("href", "/cart");

    // Incrementar y decrementar desde los controles rápidos de la tarjeta
    fireEvent.click(screen.getByRole("button", { name: /sumar una unidad de granizado de maracuyá/i }));
    expect(miniCart).toHaveTextContent("Tu pedido (2 productos)");
    expect(miniCart).toHaveTextContent("$30.000 COP");

    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      productId: "prod-maracuya",
      quantity: 2,
      price: 15000,
    });

    fireEvent.click(screen.getByRole("button", { name: /quitar una unidad de granizado de maracuyá/i }));
    expect(miniCart).toHaveTextContent("Tu pedido (1 producto)");
  });

  it("permite enviar un mensaje rápidamente al hacer clic en un prompt chip", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: "Los cócteles cítricos son nuestra especialidad.",
        suggestions: [],
      }),
    });

    renderOpsyChat();
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));

    const chip = screen.getByRole("button", { name: /¿Qué me recomiendas cítrico\?/i });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(screen.getByText(/Los cócteles cítricos son nuestra especialidad./i)).toBeInTheDocument();
    });
  });

  it("muestra el mensaje de límite de consultas amigable cuando el servidor devuelve 429", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    renderOpsyChat();
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));

    const input = screen.getByPlaceholderText(/pregúntale a opsy/i);
    fireEvent.change(input, { target: { value: "Pregunta rápida" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar mensaje/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/¡Parce, te tomaste muchos tragos de preguntas!/i)
      ).toBeInTheDocument();
    });
  });

  it("reinicia la conversación al pulsar el botón de reinicio", async () => {
    renderOpsyChat();
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));

    const input = screen.getByPlaceholderText(/pregúntale a opsy/i);
    fireEvent.change(input, { target: { value: "Hola Opsy" } });

    const resetButton = screen.getByRole("button", { name: /reiniciar conversación/i });
    fireEvent.click(resetButton);

    expect(screen.getByText(/¡Qué más pues, parce!/i)).toBeInTheDocument();
    expect(screen.queryByText("Hola Opsy")).toBeNull();
  });

  it("hace fallback a /api/chat cuando /api/opsy/chat devuelve 404, normaliza products y arma el carrito con múltiples tamaños", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          message: "Estas opciones están en nuestra carta. Evita compartir datos personales en el chat.",
          products: [
            {
              id: "canva-limonadas",
              name: "Limonadas",
              description: "Publicado en la carta Canva, página 5.",
              image: "/catalog-placeholder.svg",
              href: "/menu?product=canva-limonadas",
              available: true,
              sizes: [{ id: "size-1", label: "Presentación de la carta", volumeOz: null, priceCop: 9000 }],
            },
            {
              id: "granizado-margarita",
              name: "Granizado Margarita",
              description: "Cítrico con escarchado de sal.",
              image: "/granizados/Lulo.png",
              href: "/menu?product=granizado-margarita",
              available: true,
              sizes: [
                { id: "size-1", label: "12 oz", volumeOz: 12, priceCop: 14000 },
                { id: "size-2", label: "16 oz", volumeOz: 16, priceCop: 18000 },
              ],
            },
          ],
          links: { menu: "/menu", whatsapp: null },
        }),
      });
    global.fetch = fetchMock;

    renderOpsyChat();
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));
    fireEvent.click(screen.getByRole("button", { name: /¿Qué me recomiendas cítrico\?/i }));

    await waitFor(() => {
      expect(screen.getByText(/Estas opciones están en nuestra carta/i)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/opsy/chat", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/chat", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("Limonadas")).toBeInTheDocument();
    expect(screen.getByText("$9.000 COP")).toBeInTheDocument();
    expect(screen.getByText("Granizado Margarita")).toBeInTheDocument();
    expect(screen.getByText("Desde $14.000 COP")).toBeInTheDocument();

    // Seleccionar Limonadas (presentación única) + Granizado Margarita 16 oz (tamaño específico)
    fireEvent.click(screen.getByRole("button", { name: /^Agregar Limonadas$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Agregar Granizado Margarita 16 oz$/i }));

    const miniCart = await screen.findByTestId("opsy-mini-cart");
    expect(miniCart).toHaveTextContent("Tu pedido (2 productos)");
    expect(miniCart).toHaveTextContent("$27.000 COP");

    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      productId: "canva-limonadas",
      price: 9000,
      customization: { size: "Presentación de la carta", flavors: [], addOns: [] },
    });
    expect(saved[1]).toMatchObject({
      productId: "granizado-margarita",
      price: 18000,
      customization: { size: "16 oz", flavors: [], addOns: [] },
    });
  });

  it("muestra el mensaje de error devuelto por el backend cuando falla con 503", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        code: "UNAVAILABLE",
        message: "El asistente no está disponible en este momento. Consulta el menú.",
      }),
    });

    renderOpsyChat();
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));

    const input = screen.getByPlaceholderText(/pregúntale a opsy/i);
    fireEvent.change(input, { target: { value: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar mensaje/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/El asistente no está disponible en este momento\. Consulta el menú\./i)
      ).toBeInTheDocument();
    });
  });
});
