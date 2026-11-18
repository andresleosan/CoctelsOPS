/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: { alt?: string; src?: string }) => (
    <img alt={props.alt ?? ""} src={props.src ?? ""} />
  ),
}));

vi.mock("next/link", () => ({
  default: (props: { children: ReactNode; href: string; className?: string; "aria-label"?: string }) => (
    <a href={props.href} className={props.className} aria-label={props["aria-label"]}>
      {props.children}
    </a>
  ),
}));

import HeroShowcase from "@/components/home/HeroShowcase";

describe("HeroShowcase", () => {
  afterEach(cleanup);

  it("muestra Fresa Salvaje inicialmente y permite cambiar entre sabores reales", () => {
    render(<HeroShowcase />);

    expect(screen.getByRole("heading", { name: "Fresa Salvaje" })).toBeInTheDocument();
    expect(screen.getByText("Top #1 en barra")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ver Fresa Salvaje" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Ver Mango Biche Special" }));

    expect(screen.getByRole("heading", { name: "Mango Biche Special" })).toBeInTheDocument();
    expect(screen.getByText("Favorito paisa")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ver Mango Biche Special" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Ver Fresa Salvaje" })).toHaveAttribute("aria-selected", "false");
  });

  it("incluye el sello oficial circular y enlace directo a /menu", () => {
    render(<HeroShowcase />);

    expect(screen.getByAltText("Sello oficial Coctels OPS")).toHaveAttribute("src", "/brand/coctels-ops-logo.png");
    expect(screen.getByRole("link", { name: "Pedir Fresa Salvaje en el menú" })).toHaveAttribute("href", "/menu");
  });
});
