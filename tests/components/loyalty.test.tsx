import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth }));
vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { LoyaltyCard } from "@/components/account/LoyaltyCard";
import {
  calculateEarnedPoints,
  calculateLoyaltyRedemption,
  calculateLoyaltySummaryFromOrders,
  qualifiesForDigitalStamp,
  resolveLoyaltyTier,
} from "@/lib/firestore/loyalty";

describe("Programa de Fidelización Puntos Coctels y Sellos Digitales", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("calcula 1 punto por cada $1.000 COP completos", () => {
    expect(calculateEarnedPoints(0)).toBe(0);
    expect(calculateEarnedPoints(999)).toBe(0);
    expect(calculateEarnedPoints(1000)).toBe(1);
    expect(calculateEarnedPoints(15500)).toBe(15);
    expect(calculateEarnedPoints(25000)).toBe(25);
    expect(calculateEarnedPoints(-5000)).toBe(0);
  });

  it("otorga 1 sello digital únicamente en pedidos entregados desde $10.000 COP", () => {
    expect(qualifiesForDigitalStamp(15000, "entregado")).toBe(true);
    expect(qualifiesForDigitalStamp(10000, "entregado")).toBe(true);
    expect(qualifiesForDigitalStamp(9500, "entregado")).toBe(false);
    expect(qualifiesForDigitalStamp(25000, "pendiente")).toBe(false);
    expect(qualifiesForDigitalStamp(25000, "cancelado")).toBe(false);
  });

  it("resuelve el nivel VIP y los puntos faltantes para el siguiente nivel", () => {
    const bronce = resolveLoyaltyTier(20);
    expect(bronce.tier.id).toBe("bronce");
    expect(bronce.nextTier?.id).toBe("plata");
    expect(bronce.pointsToNextTier).toBe(30);

    const plata = resolveLoyaltyTier(75);
    expect(plata.tier.id).toBe("plata");
    expect(plata.nextTier?.id).toBe("oro");
    expect(plata.pointsToNextTier).toBe(75);

    const oro = resolveLoyaltyTier(180);
    expect(oro.tier.id).toBe("oro");
    expect(oro.nextTier).toBeNull();
    expect(oro.pointsToNextTier).toBe(0);
  });

  it("valida y calcula el canje de recompensas y cóctel de cortesía en servidor", () => {
    // Canje exitoso de Cóctel de Cortesía (100 pts -> $15.000 COP descuento)
    const cortesia = calculateLoyaltyRedemption({
      rewardId: "COCTEL_CORTESIA",
      availablePoints: 120,
      subtotalAfterPromo: 30000,
    });
    expect(cortesia.applied).toBe(true);
    expect(cortesia.pointsCost).toBe(100);
    expect(cortesia.discount).toBe(15000);
    expect(cortesia.total).toBe(15000);

    // Rechazo por puntos insuficientes
    const sinPuntos = calculateLoyaltyRedemption({
      rewardId: "DESC_5000",
      availablePoints: 30,
      subtotalAfterPromo: 25000,
    });
    expect(sinPuntos.applied).toBe(false);
    expect(sinPuntos.reason).toMatch(/Puntos insuficientes/i);

    // Rechazo por monto mínimo
    const montoBajo = calculateLoyaltyRedemption({
      rewardId: "DESC_5000",
      availablePoints: 80,
      subtotalAfterPromo: 10000,
    });
    expect(montoBajo.applied).toBe(false);
    expect(montoBajo.reason).toMatch(/monto mínimo/i);
  });

  it("consolida puntos ganados, puntos canjeados y sellos digitales desde el historial de pedidos", () => {
    const summary = calculateLoyaltySummaryFromOrders([
      {
        id: "ord-1",
        total: 35000,
        status: "entregado",
        createdAt: "2026-11-01T18:00:00.000Z",
      },
      {
        id: "ord-2",
        total: 25000,
        status: "entregado",
        createdAt: "2026-11-02T18:00:00.000Z",
      },
      {
        id: "ord-3",
        total: 20000,
        status: "preparando",
        createdAt: "2026-11-03T18:00:00.000Z",
        loyaltyPointsRedeemed: 25,
        loyaltyRewardId: "TOP_GRATIS",
      },
      {
        id: "ord-4",
        total: 18000,
        status: "cancelado",
        createdAt: "2026-11-04T18:00:00.000Z",
        loyaltyPointsRedeemed: 50,
        loyaltyRewardId: "DESC_5000",
      },
    ]);

    // 35 + 25 = 60 puntos ganados en pedidos entregados
    expect(summary.lifetimeEarnedPoints).toBe(60);
    // Solo ord-3 descuenta 25 puntos (ord-4 fue cancelado y devuelve sus puntos)
    expect(summary.totalRedeemedPoints).toBe(25);
    expect(summary.availablePoints).toBe(35);
    expect(summary.totalStamps).toBe(2);
    expect(summary.stampsInCurrentCard).toBe(2);
    expect(summary.tier.id).toBe("plata");
    expect(summary.redeemableRewards.map((r) => r.id)).toEqual(["TOP_GRATIS"]);
  });

  it("renderiza LoyaltyCard con puntos disponibles, sellos marcados y recompensas activas", () => {
    useAuth.mockReturnValue({
      user: { uid: "user-1" },
      loading: false,
      isVerified: true,
    });

    const summary = calculateLoyaltySummaryFromOrders([
      {
        id: "ord-vip-1",
        total: 60000,
        status: "entregado",
        createdAt: "2026-11-05T20:00:00.000Z",
      },
      {
        id: "ord-vip-2",
        total: 50000,
        status: "entregado",
        createdAt: "2026-11-06T20:00:00.000Z",
      },
    ]);

    render(<LoyaltyCard initialSummary={summary} />);

    expect(screen.getByTestId("loyalty-available-points")).toHaveTextContent("110");
    expect(screen.getByText("Plata Cyber")).toBeInTheDocument();
    expect(screen.getByTestId("loyalty-stamp-1")).toHaveAttribute("data-stamped", "true");
    expect(screen.getByTestId("loyalty-stamp-2")).toHaveAttribute("data-stamped", "true");
    expect(screen.getByTestId("loyalty-stamp-3")).toHaveAttribute("data-stamped", "false");
    expect(screen.getAllByText(/Canjear en Checkout/i)).toHaveLength(3);
  });
});
