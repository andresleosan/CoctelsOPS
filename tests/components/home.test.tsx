/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFeaturedProducts, getHomeCategories } = vi.hoisted(() => ({
  getFeaturedProducts: vi.fn(),
  getHomeCategories: vi.fn(),
}));
const { getStoreConfiguration } = vi.hoisted(() => ({
  getStoreConfiguration: vi.fn(),
}));

vi.mock("@/lib/catalog/home", () => ({ getFeaturedProducts, getHomeCategories }));
vi.mock("@/lib/firestore/configuration", () => ({ getStoreConfiguration }));
vi.mock("next/image", () => ({
  default: (props: { alt?: string; src?: string; sizes?: string; priority?: boolean }) => (
    <img alt={props.alt ?? ""} src={props.src} data-sizes={props.sizes} data-priority={props.priority ? "true" : undefined} />
  ),
}));
vi.mock("next/link", () => ({
  default: (props: { children: ReactNode; href: string; className?: string }) => (
    <a href={props.href} className={props.className}>
      {props.children}
    </a>
  ),
}));
vi.mock("@/components/products/ProductCard", () => ({ default: () => <div data-testid="product-card" /> }));
vi.mock("@/components/products/CocktailCarousel", () => ({ default: () => <div data-testid="cocktail-carousel" /> }));

import Home from "@/app/page";

const configuration = {
  whatsappNumber: "573245550000",
  businessHours: [],
  deliveryZones: ["Centro"],
  estimatedDeliveryMinutes: 45,
  messages: { orderReceived: "Recibido", orderStatus: "Estado", unavailable: "No disponible" },
};

const mockCategories = [
  { id: "granizado", name: "Granizados", active: true, order: 1 },
  { id: "cocktail", name: "Cocteles", active: true, order: 2 },
];

describe("Home page component", () => {
  beforeEach(() => {
    getFeaturedProducts.mockResolvedValue([]);
    getHomeCategories.mockResolvedValue(mockCategories);
    getStoreConfiguration.mockResolvedValue(configuration);
  });

  it("renderiza el enlace y teléfono WhatsApp configurados", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("https://wa.me/573245550000");
    expect(html).toContain("573245550000");
    expect(html).not.toContain("573245545530");
  });

  it("omite enlaces y teléfono WhatsApp si falla la configuración", async () => {
    getStoreConfiguration.mockRejectedValue(new Error("configuración no disponible"));

    const html = renderToStaticMarkup(await Home());

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("573245545530");
    expect(html).not.toContain("Pide por WhatsApp");
  });

  it("incorpora la mascota oficial Opsy el Panda con su acento y saludo", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("OPSY EL PANDA");
    expect(html).toContain("¡Refréscate con los originales!");
  });

  it("muestra la barra de acceso rápido a categorías populares en el primer scroll", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("CATEGORÍAS POPULARES");
    expect(html).toContain("Granizados");
    expect(html).toContain("Cocteles");
    expect(html).toContain('href="/menu"');
  });
});
