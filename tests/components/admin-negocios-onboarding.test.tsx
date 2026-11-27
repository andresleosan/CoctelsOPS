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
  }),
}));

vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import NegociosAdminPage from "@/app/admin/negocios/page";
import {
  ADVANCED_ADMIN_NAVIGATION,
  getVisibleAdminNavigation,
} from "@/components/admin/admin-navigation";

const initialNegocio = {
  id: "neg-poblado",
  slug: "coctels-poblado",
  name: "Coctels OPS Poblado",
  description: "Sede El Poblado",
  active: true,
  plan: "pro",
  branding: {
    logoUrl: "/catalog-placeholder.svg",
    slogan: "Granizados artesanales",
    primaryColor: "#E5196E",
    accentColor: "#00BCD4",
  },
  configuracion: {
    whatsappNumber: "573001234567",
    businessHours: [{ day: "Lunes a Domingo", open: "12:00", close: "23:00" }],
    deliveryZones: ["El Poblado"],
    estimatedDeliveryMinutes: 30,
    messages: {
      orderReceived: "Recibido",
      orderStatus: "Preparando",
      unavailable: "Cerrado",
    },
  },
  ownerUid: "owner-1",
  staffUids: ["staff-1"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Navegación y Onboarding SaaS en /admin/negocios (TASK-40)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const OriginalURL = globalThis.URL;
    class PatchedURL extends OriginalURL {
      static createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/logo-preview");
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", PatchedURL);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("expone /admin/negocios en ADVANCED_ADMIN_NAVIGATION para usuarios con configuracion.read", () => {
    expect(ADVANCED_ADMIN_NAVIGATION.some((item) => item.href === "/admin/negocios")).toBe(true);
    const links = getVisibleAdminNavigation(false, ["configuracion.read"]).map(
      (item) => item.href,
    );
    expect(links).toContain("/admin/negocios");
  });

  it("permite clonar la carta base en 1 clic, subir logo a R2, asignar staff y crear local con clonación", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/admin/negocios" && method === "GET") {
        return new Response(
          JSON.stringify({
            negocios: [initialNegocio],
            canCreate: true,
            stats: { "neg-poblado": { productCount: 0, staffCount: 1 } },
          }),
          { status: 200 },
        );
      }

      if (url === "/api/admin/negocios/neg-poblado/staff" && method === "GET") {
        return new Response(
          JSON.stringify({
            staff: [
              {
                uid: "staff-1",
                email: "barra@poblado.com",
                displayName: "Camila Barra",
                negocioId: "neg-poblado",
                role: "staff",
                active: true,
                assignedAt: "2026-01-01T00:00:00.000Z",
                accountType: "staff",
                roleIds: ["barra-pedidos"],
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url === "/api/admin/negocios/neg-poblado/clone-catalog" && method === "POST") {
        return new Response(
          JSON.stringify({
            result: {
              negocioId: "neg-poblado",
              source: "starter",
              createdCount: 6,
              skippedCount: 0,
              productIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
            },
          }),
          { status: 200 },
        );
      }

      if (url === "/api/admin/negocios/neg-poblado/logo" && method === "POST") {
        return new Response(
          JSON.stringify({
            negocio: {
              ...initialNegocio,
              branding: {
                ...initialNegocio.branding,
                logoUrl: "https://cdn.coctelsops.com/tenants/neg-poblado/branding/logo/logo.png",
              },
            },
            logoUrl: "https://cdn.coctelsops.com/tenants/neg-poblado/branding/logo/logo.png",
          }),
          { status: 200 },
        );
      }

      if (url === "/api/admin/negocios/neg-poblado/staff" && method === "POST") {
        return new Response(
          JSON.stringify({
            member: {
              uid: "staff-2",
              email: "nuevo@poblado.com",
              displayName: "Mateo",
              negocioId: "neg-poblado",
              role: "staff",
              active: true,
              assignedAt: "2026-01-01T00:00:00.000Z",
              accountType: "staff",
              roleIds: ["barra-pedidos"],
            },
            createdAuthUser: false,
          }),
          { status: 200 },
        );
      }

      if (url === "/api/admin/negocios" && method === "POST") {
        return new Response(
          JSON.stringify({
            id: "neg-laureles",
            clonedCatalog: {
              negocioId: "neg-laureles",
              source: "starter",
              createdCount: 6,
              skippedCount: 0,
              productIds: ["a"],
            },
          }),
          { status: 201 },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<NegociosAdminPage />);

    await screen.findByRole("heading", { name: "Coctels OPS Poblado" });
    expect(screen.getByText("0 prod.")).toBeTruthy();
    expect(screen.getByText("1 staff")).toBeTruthy();

    // 1. Clonar carta base en 1 clic
    fireEvent.click(screen.getByRole("button", { name: /Clonar carta base/i }));
    await screen.findByText(/Carta clonada: 6 producto\(s\) nuevo\(s\)/i);

    // 2. Subir logo a Cloudflare R2
    fireEvent.click(screen.getByRole("tab", { name: /Logo y branding R2/i }));
    const fileInput = screen.getByLabelText(/Seleccionar archivo de logo/i);
    const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [pngFile] } });
    fireEvent.click(screen.getByRole("button", { name: /Subir logo a R2/i }));
    await screen.findByText(/Logo subido a Cloudflare R2/i);

    // 3. Asignar staff al local
    fireEvent.click(screen.getByRole("tab", { name: /Staff del local/i }));
    await screen.findByText("Camila Barra");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "nuevo@poblado.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Asignar staff al local/i }));
    await screen.findByText(/Usuario asignado a Coctels OPS Poblado: nuevo@poblado.com/i);

    // 4. Crear nuevo local con clonación automática
    fireEvent.change(screen.getByLabelText("Nombre del local"), {
      target: { value: "Coctels Laureles" },
    });
    fireEvent.change(screen.getByLabelText("Descripción"), {
      target: { value: "Sede en Laureles" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Crear local/i }));

    await waitFor(() => {
      const postCreateCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/admin/negocios" && init?.method === "POST",
      );
      expect(postCreateCall).toBeDefined();
      const body = JSON.parse(String(postCreateCall?.[1]?.body));
      expect(body.slug).toBe("coctels-laureles");
      expect(body.cloneStarterCatalog).toBe(true);
    });
  });
});
