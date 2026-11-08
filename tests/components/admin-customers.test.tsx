import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CrmCustomer, CrmSummaryMetrics } from "@/lib/customers/crm";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("fake-token") };

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: true,
  }),
}));

vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-guard">{children}</div>
  ),
}));

import CustomersCrmPage from "@/app/admin/clientes/page";

const mockCustomers: CrmCustomer[] = [
  {
    uid: "cust-vip",
    email: "vip@test.com",
    displayName: "Valeria VIP",
    telefono: "3001234567",
    photoURL: null,
    addressesCount: 2,
    addresses: [],
    deliveredOrdersCount: 6,
    totalOrdersCount: 6,
    totalSpent: 160000,
    averageTicket: 26667,
    lastOrderAt: "2026-05-18T14:00:00.000Z",
    daysSinceLastOrder: 2,
    availablePoints: 160,
    lifetimePoints: 160,
    tier: "oro",
    segment: "vip",
    segmentLabel: "VIP Neón",
  },
  {
    uid: "cust-inactivo",
    email: "inactivo@test.com",
    displayName: "Mateo Inactivo",
    telefono: "3109876543",
    photoURL: null,
    addressesCount: 1,
    addresses: [],
    deliveredOrdersCount: 2,
    totalOrdersCount: 2,
    totalSpent: 40000,
    averageTicket: 20000,
    lastOrderAt: "2026-04-10T10:00:00.000Z",
    daysSinceLastOrder: 35,
    availablePoints: 40,
    lifetimePoints: 40,
    tier: "bronce",
    segment: "inactivo",
    segmentLabel: "Inactivo con Puntos",
  },
  {
    uid: "cust-frecuente",
    email: "frecuente@test.com",
    displayName: "Sofia Frecuente",
    telefono: "3205551234",
    photoURL: null,
    addressesCount: 1,
    addresses: [],
    deliveredOrdersCount: 3,
    totalOrdersCount: 3,
    totalSpent: 75000,
    averageTicket: 25000,
    lastOrderAt: "2026-05-15T12:00:00.000Z",
    daysSinceLastOrder: 5,
    availablePoints: 75,
    lifetimePoints: 75,
    tier: "plata",
    segment: "frecuente",
    segmentLabel: "Frecuente",
  },
  {
    uid: "cust-nuevo",
    email: "nuevo@test.com",
    displayName: "Nicolas Nuevo",
    telefono: null,
    photoURL: null,
    addressesCount: 0,
    addresses: [],
    deliveredOrdersCount: 1,
    totalOrdersCount: 1,
    totalSpent: 15000,
    averageTicket: 15000,
    lastOrderAt: "2026-05-19T08:00:00.000Z",
    daysSinceLastOrder: 1,
    availablePoints: 15,
    lifetimePoints: 15,
    tier: "bronce",
    segment: "nuevo",
    segmentLabel: "Nuevo",
  },
];

const mockMetrics: CrmSummaryMetrics = {
  totalCustomers: 4,
  vipCount: 1,
  frecuenteCount: 1,
  inactivoCount: 1,
  nuevoCount: 1,
  totalSpentAllCustomers: 290000,
  globalAverageTicket: 24167,
  totalAvailablePoints: 290,
};

describe("CustomersCrmPage (/admin/clientes)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/admin/clientes")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ customers: mockCustomers, metrics: mockMetrics }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renderiza la página con título, KPIs globales y tarjetas de clientes", async () => {
    render(<CustomersCrmPage />);

    expect(screen.getByText("Clientes & Retención VIP")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Valeria VIP")).toBeInTheDocument();
      expect(screen.getByText("Mateo Inactivo")).toBeInTheDocument();
      expect(screen.getByText("Sofia Frecuente")).toBeInTheDocument();
      expect(screen.getByText("Nicolas Nuevo")).toBeInTheDocument();
    });

    // Validar KPIs
    expect(screen.getByText("Total Clientes")).toBeInTheDocument();
    expect(screen.getAllByText("VIP Neón").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inactivos + Puntos").length).toBeGreaterThan(0);
  });

  it("filtra clientes por segmento interactivo al hacer clic en los chips", async () => {
    render(<CustomersCrmPage />);

    await waitFor(() => {
      expect(screen.getByText("Mateo Inactivo")).toBeInTheDocument();
    });

    // Clic en chip de filtro "Inactivos con Puntos"
    const inactivosChip = screen.getByRole("button", { name: /Inactivos con Puntos/i });
    fireEvent.click(inactivosChip);

    // Solo debe verse el cliente inactivo
    expect(screen.getByText("Mateo Inactivo")).toBeInTheDocument();
    expect(screen.queryByText("Valeria VIP")).not.toBeInTheDocument();
    expect(screen.queryByText("Sofia Frecuente")).not.toBeInTheDocument();

    // Volver a "Todos"
    const todosChip = screen.getByRole("button", { name: /^Todos/i });
    fireEvent.click(todosChip);

    expect(screen.getByText("Valeria VIP")).toBeInTheDocument();
    expect(screen.getByText("Mateo Inactivo")).toBeInTheDocument();
  });

  it("busca clientes en vivo por nombre o correo con limpieza reactiva", async () => {
    render(<CustomersCrmPage />);

    await waitFor(() => {
      expect(screen.getByText("Valeria VIP")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre, correo o celular/i);
    fireEvent.change(searchInput, { target: { value: "Sofia" } });

    expect(screen.getByText("Sofia Frecuente")).toBeInTheDocument();
    expect(screen.queryByText("Valeria VIP")).not.toBeInTheDocument();
    expect(screen.queryByText("Mateo Inactivo")).not.toBeInTheDocument();

    // Limpiar búsqueda
    const clearBtn = screen.getByLabelText("Limpiar búsqueda");
    fireEvent.click(clearBtn);

    expect(screen.getByText("Valeria VIP")).toBeInTheDocument();
    expect(screen.getByText("Sofia Frecuente")).toBeInTheDocument();
  });

  it("abre el modal de WhatsApp 1-Tap con mensaje personalizado y saldo de puntos", async () => {
    render(<CustomersCrmPage />);

    await waitFor(() => {
      expect(screen.getByText("Mateo Inactivo")).toBeInTheDocument();
    });

    // Encontrar tarjeta del cliente inactivo
    const inactivoCard = screen.getByTestId("customer-card-cust-inactivo");
    const whatsAppBtn = inactivoCard.querySelector("button");
    expect(whatsAppBtn).not.toBeNull();
    fireEvent.click(whatsAppBtn!);

    // Debe abrirse el diálogo con el título del cliente y saldo de puntos
    await waitFor(() => {
      expect(screen.getByText("Campaña WhatsApp para Mateo Inactivo")).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Mensaje Personalizado/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain("¡Hola Mateo!");
    expect(textarea.value).toContain("40 Puntos Coctels");

    // Cambiar a plantilla Happy Hour
    const happyHourBtn = screen.getByRole("button", { name: /Invitación a Happy Hour/i });
    fireEvent.click(happyHourBtn);

    expect(textarea.value).toContain("Happy Hour");
  });

  it("maneja de forma segura a clientes sin celular permitiendo copiar el texto", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<CustomersCrmPage />);

    await waitFor(() => {
      expect(screen.getByText("Nicolas Nuevo")).toBeInTheDocument();
    });

    const nuevoCard = screen.getByTestId("customer-card-cust-nuevo");
    const whatsAppBtn = nuevoCard.querySelector("button");
    fireEvent.click(whatsAppBtn!);

    await waitFor(() => {
      expect(screen.getByText("Campaña WhatsApp para Nicolas Nuevo")).toBeInTheDocument();
    });

    // El botón 'Enviar por WhatsApp' debe estar deshabilitado porque no tiene celular
    const sendBtn = screen.getByRole("button", { name: /Enviar por WhatsApp/i });
    expect(sendBtn).toBeDisabled();

    // El botón copiar mensaje debe funcionar
    const copyBtn = screen.getByRole("button", { name: /^Copiar$/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
  });
});
