import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { AdminAccessCard } from "@/components/admin/AdminAccessCard";
import { invalidateAdminSessionCache } from "@/components/admin/admin-session-cache";
import { ALL_ADMIN_PERMISSIONS } from "@/types/auth";

describe("AdminAccessCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAdminSessionCache();
  });

  afterEach(() => {
    cleanup();
  });

  it("muestra el diagnóstico verificado del propietario andres.san1404@gmail.com y permite revalidar", async () => {
    const refreshClaims = vi.fn().mockResolvedValue(undefined);
    const getIdToken = vi.fn().mockResolvedValue("owner-jwt");
    useAuth.mockReturnValue({
      user: {
        uid: "owner-1",
        email: "andres.san1404@gmail.com",
        getIdToken,
      },
      isAdmin: true,
      isVerified: true,
      refreshClaims,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            uid: "owner-1",
            email: "andres.san1404@gmail.com",
            accountType: "admin",
            active: true,
            permissions: [],
          },
          adminAccess: {
            isAdmin: true,
            hasCustomClaim: false,
            isOwnerEmail: true,
            emailVerified: true,
            accountType: "admin",
            active: true,
            effectivePermissions: [...ALL_ADMIN_PERMISSIONS],
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminAccessCard />);

    expect(await screen.findByText("Propietario Admin Activo")).toBeInTheDocument();
    expect(screen.getAllByText("andres.san1404@gmail.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Verificado")).toBeInTheDocument();
    expect(screen.getByText("Acceso total")).toBeInTheDocument();
    expect(screen.queryByText(/Ocultar detalle de áreas/i)).toBeNull();
    expect(screen.queryByText(/Ver qué puedes hacer en el panel/i)).toBeNull();
    expect(screen.queryByText(/Áreas habilitadas/i)).toBeNull();
    expect(screen.queryByText(/firestore\.rules/i)).toBeNull();
    expect(screen.queryByText(/scripts\/set-admin\.ts/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Revalidar permisos/i }));
    await waitFor(() => expect(refreshClaims).toHaveBeenCalledTimes(1));
    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it("muestra alerta clara cuando el servidor rechaza /api/auth/session", async () => {
    useAuth.mockReturnValue({
      user: {
        uid: "owner-2",
        email: "andres.san1404@gmail.com",
        getIdToken: vi.fn().mockResolvedValue("token"),
      },
      isAdmin: true,
      isVerified: true,
      refreshClaims: vi.fn().mockResolvedValue(undefined),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Se requiere una sesión válida" }), { status: 401 }),
      ),
    );

    render(<AdminAccessCard />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/HTTP 401/i);
    expect(screen.getByText(/Error de validación \(401\)/i)).toBeInTheDocument();
  });
});
