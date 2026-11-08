import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HappyHourBanner } from "@/components/products/HappyHourBanner";
import type { Promotion } from "@/types/promotions";

const activePromotion: Promotion = {
  id: "promo-hh-1",
  code: "HAPPY2X1",
  title: "¡Happy Hour 2x1 en Granizados!",
  description: "Compra 1 granizado y lleva el segundo gratis en barra.",
  active: true,
  type: "happy_hour",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-12-31T23:59:59.999Z",
  discountType: "2x1",
  discountValue: 0,
  minimumSubtotal: 0,
  categoryIds: ["granizado"],
  usageCount: 0,
  isAutomatic: true,
  schedule: {
    daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
    startTime: "17:00",
    endTime: "23:59",
    timezone: "America/Bogota",
  },
};

const scheduledPromotion: Promotion = {
  id: "promo-hh-2",
  code: "NOCTURNO",
  title: "Noche de Cócteles 20% OFF",
  description: "Todos los cócteles con descuento especial.",
  active: true,
  type: "happy_hour",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-12-31T23:59:59.999Z",
  discountType: "percent",
  discountValue: 20,
  minimumSubtotal: 20000,
  categoryIds: ["cocktail"],
  usageCount: 0,
  isAutomatic: true,
  schedule: {
    daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
    startTime: "21:00",
    endTime: "23:59",
    timezone: "America/Bogota",
  },
};

describe("HappyHourBanner Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });

  it("renderiza banner de Happy Hour activo con badge 2x1, título y cuenta regresiva", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activeHappyHours: [activePromotion],
        todayScheduled: [activePromotion],
        serverTime: "2026-08-07T18:00:00.000Z",
      }),
    });

    render(<HappyHourBanner />);

    await waitFor(() => {
      expect(screen.getByText(/happy hour activo/i)).toBeInTheDocument();
      expect(screen.getByText(/¡Happy Hour 2x1 en Granizados!/i)).toBeInTheDocument();
      expect(screen.getByText(/segundo gratis en barra/i)).toBeInTheDocument();
      expect(screen.getByText(/termina en/i)).toBeInTheDocument();
    });

    const ctaButton = screen.getByRole("button", { name: /aprovechar 2x1/i });
    expect(ctaButton).toBeInTheDocument();
  });

  it("ejecuta callback onExploreCategory al presionar el botón de aprovechar", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activeHappyHours: [activePromotion],
        todayScheduled: [activePromotion],
        serverTime: "2026-08-07T18:00:00.000Z",
      }),
    });

    const handleExplore = vi.fn();
    render(<HappyHourBanner onExploreCategory={handleExplore} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /aprovechar 2x1/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /aprovechar 2x1/i }));
    expect(handleExplore).toHaveBeenCalledWith("granizado");
  });

  it("renderiza aviso de próximo Happy Hour programado cuando aún no está activo", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activeHappyHours: [],
        todayScheduled: [scheduledPromotion],
        serverTime: "2026-08-07T14:00:00.000Z",
      }),
    });

    render(<HappyHourBanner />);

    await waitFor(() => {
      expect(screen.getByText(/próximo happy hour hoy/i)).toBeInTheDocument();
      expect(screen.getByText(/21:00 - 23:59/)).toBeInTheDocument();
      expect(screen.getByText(/Noche de Cócteles 20% OFF/i)).toBeInTheDocument();
    });
  });

  it("no muestra nada si no hay promociones activas ni programadas para hoy", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activeHappyHours: [],
        todayScheduled: [],
        serverTime: "2026-08-07T14:00:00.000Z",
      }),
    });

    const { container } = render(<HappyHourBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
