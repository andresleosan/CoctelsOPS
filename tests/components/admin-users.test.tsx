import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = {
  uid: "owner-1",
  email: "andres.san1404@gmail.com",
  getIdToken: vi.fn().mockResolvedValue("fake-token"),
};

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: true,
    isVerified: true,
    refreshClaims: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import UsersPage from "@/app/admin/usuarios/page";

const initialUsers = [
  {
    uid: "owner-1",
    email: "andres.san1404@gmail.com",
    displayName: "Andres Santiago",
    photoURL: null,
    telefono: null,
    addresses: [],
    active: true,
    accountType: "admin",
    roleIds: ["admin"],
    permissions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "2026-01-01T00:00:00.000Z",
  },
  {
    uid: "staff-2",
    email: "barra@coctelsops.com",
    displayName: "Camila Barra",
    photoURL: null,
    telefono: null,
    addresses: [],
    active: true,
    accountType: "staff",
    roleIds: ["bartender"],
    permissions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "2026-01-01T00:00:00.000Z",
  },
];

const initialRoles = [
  {
    id: "bartender",
    name: "Bartender",
    description: "Prepara pedidos",
    active: true,
    permissions: ["pedidos.read", "pedidos.update"],
  },
];

describe("UsersPage con Roles integrados y gestión de administradores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("permite agregar un administrador, promover un usuario a Admin y cambiar a la pestaña Roles y Permisos", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { uid: "owner-1", accountType: "admin", active: true, permissions: [] },
            adminAccess: { isAdmin: true, isOwnerEmail: true, emailVerified: true, active: true },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/api/admin/users") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ users: initialUsers }), { status: 200 });
      }
      if (url.endsWith("/api/admin/users") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            user: {
              ...initialUsers[1],
              uid: "admin-nuevo",
              email: "socio@coctelsops.com",
              displayName: "Socio Nuevo",
              accountType: "admin",
              roleIds: ["admin"],
            },
            createdAuthUser: true,
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/api/admin/users/staff-2") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            user: {
              ...initialUsers[1],
              accountType: "admin",
              roleIds: ["admin"],
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/api/admin/roles")) {
        return new Response(JSON.stringify({ roles: initialRoles }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UsersPage />);

    expect(await screen.findByText("Camila Barra")).toBeInTheDocument();
    expect(screen.getByText("Bartender")).toBeInTheDocument();

    // 1. Agregar administrador desde el formulario
    fireEvent.click(screen.getByRole("button", { name: /Agregar administrador/i }));
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: "socio@coctelsops.com" },
    });
    fireEvent.change(screen.getByLabelText(/Nombre completo/i), {
      target: { value: "Socio Nuevo" },
    });
    fireEvent.change(screen.getByLabelText(/Contraseña inicial/i), {
      target: { value: "ClaveSegura123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Guardar administrador/i }));

    expect(await screen.findByText("Socio Nuevo")).toBeInTheDocument();

    // 2. Promover usuario existente con 1 tap ("Hacer Admin")
    fireEvent.click(screen.getByRole("button", { name: "Hacer Admin" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users/staff-2",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ accountType: "admin" }),
        }),
      );
    });

    // 3. Cambiar a pestaña Roles y Permisos integrada
    fireEvent.click(screen.getByRole("tab", { name: /Roles y Permisos/i }));
    expect(await screen.findByRole("heading", { name: "Roles y permisos" })).toBeInTheDocument();
    expect(screen.getByText("Prepara pedidos")).toBeInTheDocument();
  });
});
