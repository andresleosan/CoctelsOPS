import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildQrTargetUrl,
  QrGeneratorCard,
} from "@/components/admin/QrGeneratorCard";

describe("buildQrTargetUrl helper", () => {
  it("generates correct menu URL with mesa parameter", () => {
    const url = buildQrTargetUrl({
      baseUrl: "https://coctelsops.com",
      targetMode: "menu",
      mesa: "4",
    });
    expect(url).toBe("https://coctelsops.com/menu?mesa=4");
  });

  it("generates correct tenant storefront URL with slug and mesa", () => {
    const url = buildQrTargetUrl({
      baseUrl: "https://coctelsops.com/",
      targetMode: "tenant",
      tenantSlug: "la-70",
      mesa: "Barra",
    });
    expect(url).toBe("https://coctelsops.com/m/la-70?mesa=Barra");
  });

  it("handles missing mesa gracefully without search params", () => {
    const url = buildQrTargetUrl({
      baseUrl: "https://coctelsops.com",
      targetMode: "menu",
    });
    expect(url).toBe("https://coctelsops.com/menu");
  });
});

describe("QrGeneratorCard Component", () => {
  beforeEach(() => {
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Mock window.print
    window.print = vi.fn();

    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the QR generator card with default Mesa 1 settings", async () => {
    render(<QrGeneratorCard storeName="Coctels OPS" defaultSlug="principal" />);

    expect(
      screen.getByText(/Generador de Códigos QR para Mesas y Barra/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Mesa 1")).toBeInTheDocument();
      expect(screen.getByTestId("qr-svg-container")).toBeInTheDocument();
    });
  });

  it("updates table number and generated target URL", async () => {
    render(<QrGeneratorCard />);

    await waitFor(() => {
      expect(screen.getByText("Mesa 1")).toBeInTheDocument();
    });

    const tableInput = screen.getByLabelText(/Número o Nombre de Mesa/i);
    fireEvent.change(tableInput, { target: { value: "8" } });

    await waitFor(() => {
      expect(screen.getByText("Mesa 8")).toBeInTheDocument();
      expect(screen.getByText(/mesa=8/i)).toBeInTheDocument();
    });
  });

  it("switches to Barra mode and updates URL with mesa=Barra", async () => {
    render(<QrGeneratorCard />);

    const barraBtn = screen.getByRole("button", { name: /Barra/i });
    fireEvent.click(barraBtn);

    await waitFor(() => {
      expect(screen.getByText("Barra Principal")).toBeInTheDocument();
      expect(screen.getByText(/mesa=Barra/i)).toBeInTheDocument();
    });
  });

  it("switches to Local (/m/[slug]) mode and allows modifying slug", async () => {
    render(<QrGeneratorCard defaultSlug="principal" />);

    const localBtn = screen.getByRole("button", { name: /Local \(\/m\/\[slug\]\)/i });
    fireEvent.click(localBtn);

    await waitFor(() => {
      expect(screen.getByLabelText(/Slug del Local/i)).toBeInTheDocument();
    });

    const slugInput = screen.getByLabelText(/Slug del Local/i);
    fireEvent.change(slugInput, { target: { value: "sede-la-70" } });

    await waitFor(() => {
      expect(screen.getByText(/\/m\/sede-la-70/i)).toBeInTheDocument();
    });
  });

  it("switches to Lote mode and generates multiple table cards", async () => {
    render(<QrGeneratorCard />);

    const loteBtn = screen.getByRole("button", { name: /Lote/i });
    fireEvent.click(loteBtn);

    await waitFor(() => {
      expect(screen.getByText(/Lote de 5 Tarjetas Generadas/i)).toBeInTheDocument();
      expect(screen.getByText("Mesa 1")).toBeInTheDocument();
      expect(screen.getByText("Mesa 5")).toBeInTheDocument();
    });
  });

  it("copies URL to clipboard and gives visual confirmation", async () => {
    render(<QrGeneratorCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copiar Enlace/i })).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole("button", { name: /Copiar Enlace/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("mesa=1")
      );
      expect(screen.getByText(/¡Copiado!/i)).toBeInTheDocument();
    });
  });

  it("triggers SVG download when clicking Descargar SVG", async () => {
    render(<QrGeneratorCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Descargar SVG/i })).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole("button", { name: /Descargar SVG/i });
    fireEvent.click(downloadBtn);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("triggers window.print when clicking Imprimir Tarjeta", async () => {
    render(<QrGeneratorCard />);

    const printBtn = screen.getByRole("button", { name: /Imprimir Tarjeta/i });
    fireEvent.click(printBtn);

    expect(window.print).toHaveBeenCalled();
  });
});
