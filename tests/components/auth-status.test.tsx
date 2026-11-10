import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { logout, mockUseAuth } = vi.hoisted(() => ({
  logout: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock("@/lib/auth-client", () => ({ logout }));

import { AuthStatus } from "@/components/auth/AuthStatus";

describe("AuthStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { uid: "customer-1", displayName: "Cliente" },
      loading: false,
      isAdmin: false,
    });
  });

  it("permite cerrar sesión desde el menú móvil autenticado", async () => {
    logout.mockResolvedValue(undefined);
    render(createElement(AuthStatus, { mobileMenu: true }));

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("muestra el botón de acceso Staff cuando el usuario no ha iniciado sesión", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
    });

    render(createElement(AuthStatus, { mobileMenu: false }));

    const staffLink = screen.getByRole("link", { name: /Staff/i });
    expect(staffLink).toBeInTheDocument();
    expect(staffLink).toHaveAttribute("href", "/admin/login");
  });

  it("muestra la opción de Acceso Staff & Barra en el menú móvil cuando no ha iniciado sesión", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
    });

    render(createElement(AuthStatus, { mobileMenu: true }));

    const staffLink = screen.getByRole("link", { name: /Acceso Staff & Barra/i });
    expect(staffLink).toBeInTheDocument();
    expect(staffLink).toHaveAttribute("href", "/admin/login");
  });
});
