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

describe("OpsyChat UI Component", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    usePathname.mockReturnValue("/");
    // Mock scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renderiza el botón flotante (FAB) en rutas públicas", () => {
    render(<OpsyChat />);
    const launcherButton = screen.getByRole("button", { name: /abrir asistente opsy bot/i });
    expect(launcherButton).toBeInTheDocument();
  });

  it("se oculta completamente en las rutas administrativas /admin", () => {
    usePathname.mockReturnValue("/admin/productos");
    render(<OpsyChat />);
    const launcherButton = screen.queryByRole("button", { name: /abrir asistente opsy bot/i });
    expect(launcherButton).toBeNull();
  });

  it("abre el modal de chat al hacer clic en el lanzador y muestra el saludo inicial", () => {
    render(<OpsyChat />);
    const launcherButton = screen.getByRole("button", { name: /abrir asistente opsy bot/i });
    fireEvent.click(launcherButton);

    expect(screen.getByRole("dialog", { name: /chat con opsy bot/i })).toBeInTheDocument();
    expect(screen.getByText(/¡Qué más pues, parce!/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/pregúntale a opsy/i)).toBeInTheDocument();
  });

  it("permite cerrar el chat con el botón de cerrar (X) y restaura el lanzador", () => {
    render(<OpsyChat />);
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));

    const closeButton = screen.getByRole("button", { name: /cerrar chat/i });
    fireEvent.click(closeButton);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /abrir asistente opsy bot/i })).toBeInTheDocument();
  });

  it("permite cerrar el chat pulsando la tecla Escape", () => {
    render(<OpsyChat />);
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("envía un mensaje del usuario y renderiza la respuesta y sugerencias de Opsy", async () => {
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

    render(<OpsyChat />);
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

    // Tarjeta de recomendación de producto
    expect(screen.getByText("Granizado de Maracuyá")).toBeInTheDocument();
    expect(screen.getByText("$15.000 COP")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /ver/i });
    expect(link).toHaveAttribute("href", "/menu?product=prod-maracuya");
  });

  it("permite enviar un mensaje rápidamente al hacer clic en un prompt chip", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: "Los cócteles cítricos son nuestra especialidad.",
        suggestions: [],
      }),
    });

    render(<OpsyChat />);
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

    render(<OpsyChat />);
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
    render(<OpsyChat />);
    fireEvent.click(screen.getByRole("button", { name: /abrir asistente opsy bot/i }));

    const input = screen.getByPlaceholderText(/pregúntale a opsy/i);
    fireEvent.change(input, { target: { value: "Hola Opsy" } });

    const resetButton = screen.getByRole("button", { name: /reiniciar conversación/i });
    fireEvent.click(resetButton);

    expect(screen.getByText(/¡Qué más pues, parce!/i)).toBeInTheDocument();
    expect(screen.queryByText("Hola Opsy")).toBeNull();
  });
});
