import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("fake-token") };

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: true,
  }),
}));

vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="permission-gate">{children}</div>
  ),
}));

vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-guard">{children}</div>
  ),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ord-test-8899" }),
}));

import AdminOrderDetailPage from "@/app/admin/pedidos/[id]/page";
import { OrderKdsBoard } from "@/components/admin/OrderKdsBoard";
import { OrderReceiptPrint } from "@/components/admin/OrderReceiptPrint";
import {
  centerText,
  divider,
  formatItemStickers,
  formatOrderReceiptEscPos,
  formatOrderReceiptText,
  getReceiptServiceLabel,
  getTotalCupCount,
  sanitizeForThermalPrint,
  twoColumns,
} from "@/lib/orders/receipt-formatter";
import type { Order } from "@/types/orders";

const mockSampleOrder: Order = {
  id: "ord-test-8899",
  clienteUid: "usr-4455",
  customerName: "Valentina Montoya",
  phone: "312 987 6543",
  address: "Mesa 3 - Segundo piso",
  tableNumber: "3",
  serviceType: "mesa",
  notes: "Sin azúcar adicional, bien frío por favor",
  items: [
    {
      productId: "prod-granizado-fresa",
      name: "Granizado Tropical",
      quantity: 2,
      unitPrice: 15000,
      subtotal: 30000,
      customization: {
        size: "16 oz",
        flavors: ["Maracuyá", "Mango Biche"],
        addOns: ["Gomitas Ácidas", "Lecherita"],
      },
    },
    {
      productId: "prod-soda-frutos-rojos",
      name: "Soda Artesanal",
      quantity: 1,
      unitPrice: 12000,
      subtotal: 12000,
      customization: {
        size: "12 oz",
        flavors: ["Frutos Rojos"],
        addOns: [],
      },
    },
  ],
  subtotal: 42000,
  total: 37800,
  promotionCode: "DESCUENTO10",
  loyaltyDiscount: 0,
  status: "confirmado",
  createdAt: "2026-11-08T03:30:00.000Z",
  updatedAt: "2026-11-08T03:30:00.000Z",
  audit: {
    createdByUid: "usr-4455",
    createdAt: "2026-11-08T03:30:00.000Z",
  },
};

describe("receipt-formatter: Formateador Térmico y ESC/POS", () => {
  it("sanitiza caracteres especiales a ASCII puro para compatibilidad térmica", () => {
    const raw = "Granizado con Maracuyá, Limón y Piña — ¡Delicioso!";
    const sanitized = sanitizeForThermalPrint(raw);
    expect(sanitized).toBe("Granizado con Maracuya, Limon y Pina - !Delicioso!");
    expect(sanitized).not.toContain("á");
    expect(sanitized).not.toContain("ó");
    expect(sanitized).not.toContain("ñ");
  });

  it("calcula el servicio correspondiente para mesa, pickup y domicilio", () => {
    expect(getReceiptServiceLabel(mockSampleOrder)).toBe("MESA (MESA 3)");

    const pickupOrder: Order = {
      ...mockSampleOrder,
      serviceType: "pickup",
      address: "Barra principal",
      tableNumber: undefined,
    };
    expect(getReceiptServiceLabel(pickupOrder)).toBe("EN BARRA (PICKUP)");

    const deliveryOrder: Order = {
      ...mockSampleOrder,
      serviceType: "delivery",
      address: "Calle 10 #43-20 Apto 401",
      tableNumber: undefined,
    };
    expect(getReceiptServiceLabel(deliveryOrder)).toBe("DOMICILIO");
  });

  it("calcula el total de vasos sumando las cantidades de cada producto", () => {
    // 2 granizados + 1 soda = 3 vasos
    expect(getTotalCupCount(mockSampleOrder)).toBe(3);
  });

  it("centra y divide columnas respetando el ancho de línea 58mm (32 columnas)", () => {
    const centered = centerText("COCTELS", 32);
    expect(centered.length).toBe(32);
    expect(centered.trim()).toBe("COCTELS");

    const cols = twoColumns("CANT PRODUCTO", "TOTAL", 32);
    expect(cols.length).toBe(32);
    expect(cols.startsWith("CANT PRODUCTO")).toBe(true);
    expect(cols.endsWith("TOTAL")).toBe(true);

    const div = divider("=", 32);
    expect(div).toBe("================================");
  });

  it("formatea comanda completa de cocina/barra para 58mm y 80mm", () => {
    const ticket58 = formatOrderReceiptText(mockSampleOrder, { width: "58mm" });
    expect(ticket58).toContain("COCTELS OPS");
    expect(ticket58).toContain("PEDIDO: #TEST-8899");
    expect(ticket58).toContain("MESA (MESA 3)");
    expect(ticket58).toContain("Valentina Montoya");
    expect(ticket58).toContain("2x Granizado Tropical");
    expect(ticket58).toContain("Tam: 16 oz");
    expect(ticket58).toContain("Maracuyá, Mango Biche");
    expect(ticket58).toContain("Gomitas Ácidas, Lecherita");
    expect(ticket58).toContain("1x Soda Artesanal");
    expect(ticket58).toContain("Desc (DESCUENTO10):");
    expect(ticket58).toContain("TOTAL A COBRAR:");
    expect(ticket58).toContain("Sin azúcar adicional, bien frío por favor");

    const ticket80 = formatOrderReceiptText(mockSampleOrder, { width: "80mm" });
    expect(ticket80.includes("=".repeat(48))).toBe(true);
  });

  it("genera etiquetas adhesivas individuales por vaso (stickers de vaso)", () => {
    const stickers = formatItemStickers(mockSampleOrder, { width: "58mm" });
    expect(stickers).toHaveLength(3); // 2 de Granizado + 1 de Soda

    // Vaso 1 de 3: Granizado Tropical
    expect(stickers[0].cupIndex).toBe(1);
    expect(stickers[0].totalCups).toBe(3);
    expect(stickers[0].productName).toBe("Granizado Tropical");
    expect(stickers[0].size).toBe("16 oz");
    expect(stickers[0].flavors).toContain("Maracuyá");
    expect(stickers[0].text).toContain("VASO [1/3]");

    // Vaso 2 de 3: Granizado Tropical
    expect(stickers[1].cupIndex).toBe(2);
    expect(stickers[1].totalCups).toBe(3);
    expect(stickers[1].productName).toBe("Granizado Tropical");
    expect(stickers[1].text).toContain("VASO [2/3]");

    // Vaso 3 de 3: Soda Artesanal
    expect(stickers[2].cupIndex).toBe(3);
    expect(stickers[2].totalCups).toBe(3);
    expect(stickers[2].productName).toBe("Soda Artesanal");
    expect(stickers[2].size).toBe("12 oz");
    expect(stickers[2].text).toContain("VASO [3/3]");
  });

  it("genera buffer binario ESC/POS con inicialización y corte de papel", () => {
    const bytes = formatOrderReceiptEscPos(mockSampleOrder, { width: "58mm" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(50);

    // ESC @ inicial (0x1B, 0x40)
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);

    // Finaliza con corte GS V 66 0 (0x1D, 0x56, 0x42, 0x00)
    const len = bytes.length;
    expect(bytes[len - 4]).toBe(0x1d);
    expect(bytes[len - 3]).toBe(0x56);
    expect(bytes[len - 2]).toBe(0x42);
    expect(bytes[len - 1]).toBe(0x00);
  });
});

describe("OrderReceiptPrint: Componente de Impresión Térmica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("no renderiza nada cuando isOpen es false o no hay orden", () => {
    const { container: c1 } = render(
      <OrderReceiptPrint order={mockSampleOrder} isOpen={false} onClose={vi.fn()} />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <OrderReceiptPrint order={null} isOpen={true} onClose={vi.fn()} />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("renderiza el diálogo con el resumen de la orden y opciones de configuración", () => {
    render(
      <OrderReceiptPrint order={mockSampleOrder} isOpen={true} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId("order-receipt-modal")).toBeInTheDocument();
    expect(screen.getByText(/Impresión Térmica de Barra/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Valentina Montoya/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("btn-format-ticket")).toBeInTheDocument();
    expect(screen.getByTestId("btn-format-stickers")).toBeInTheDocument();
    expect(screen.getByTestId("btn-width-58mm")).toBeInTheDocument();
    expect(screen.getByTestId("btn-width-80mm")).toBeInTheDocument();
  });

  it("permite alternar entre formato Ticket y Etiquetas por Vaso", () => {
    render(
      <OrderReceiptPrint order={mockSampleOrder} isOpen={true} onClose={vi.fn()} />,
    );

    // Por defecto inicia en ticket
    const previewContent = screen.getByTestId("receipt-preview-content");
    expect(previewContent).toHaveTextContent("TOTAL A COBRAR:");

    // Cambiar a etiquetas por vaso
    const btnStickers = screen.getByTestId("btn-format-stickers");
    fireEvent.click(btnStickers);

    // Debe mostrar los vasos individuales
    expect(previewContent).toHaveTextContent("VASO [1/3]");
    expect(previewContent).toHaveTextContent("VASO [2/3]");
    expect(previewContent).toHaveTextContent("VASO [3/3]");
  });

  it("permite alternar el ancho de papel a 80mm", () => {
    render(
      <OrderReceiptPrint order={mockSampleOrder} isOpen={true} onClose={vi.fn()} />,
    );

    const btn80 = screen.getByTestId("btn-width-80mm");
    fireEvent.click(btn80);

    expect(screen.getByText(/Simulación Térmica \(80mm\)/i)).toBeInTheDocument();
  });

  it("ejecuta window.print() al hacer clic en Imprimir", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    render(
      <OrderReceiptPrint order={mockSampleOrder} isOpen={true} onClose={vi.fn()} />,
    );

    const btnPrint = screen.getByTestId("btn-print-now");
    fireEvent.click(btnPrint);

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it("copia el texto formateado al portapapeles y notifica", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <OrderReceiptPrint order={mockSampleOrder} isOpen={true} onClose={vi.fn()} />,
    );

    const btnCopy = screen.getByTestId("btn-copy-receipt");
    fireEvent.click(btnCopy);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("¡Copiado!")).toBeInTheDocument();
    });
  });

  it("descarga el archivo binario ESC/POS al pulsar el botón", () => {
    const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-escpos");
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    render(
      <OrderReceiptPrint order={mockSampleOrder} isOpen={true} onClose={vi.fn()} />,
    );

    const btnDownload = screen.getByTestId("btn-download-escpos");
    fireEvent.click(btnDownload);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-escpos");
  });

  it("llama a onClose al hacer clic en el botón de cerrar", () => {
    const handleClose = vi.fn();
    render(
      <OrderReceiptPrint order={mockSampleOrder} isOpen={true} onClose={handleClose} />,
    );

    const btnClose = screen.getByLabelText("Cerrar modal de impresión");
    fireEvent.click(btnClose);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe("OrderKdsBoard: Integración con Impresión Térmica en 1-Tap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("abre el modal de impresión térmica o invoca onPrintOrder al pulsar el botón de impresora", () => {
    const handlePrintOrder = vi.fn();
    render(
      <OrderKdsBoard
        orders={[mockSampleOrder]}
        onAdvanceOrder={vi.fn()}
        onPrintOrder={handlePrintOrder}
      />,
    );

    const btnPrint = screen.getByTestId(`btn-kds-print-${mockSampleOrder.id}`);
    expect(btnPrint).toBeInTheDocument();

    fireEvent.click(btnPrint);
    expect(handlePrintOrder).toHaveBeenCalledWith(mockSampleOrder);
  });

  it("abre internamente OrderReceiptPrint si onPrintOrder no es proporcionado", () => {
    render(
      <OrderKdsBoard
        orders={[mockSampleOrder]}
        onAdvanceOrder={vi.fn()}
      />,
    );

    const btnPrint = screen.getByTestId(`btn-kds-print-${mockSampleOrder.id}`);
    fireEvent.click(btnPrint);

    // Debe abrir el modal interno
    expect(screen.getByTestId("order-receipt-modal")).toBeInTheDocument();
    expect(screen.getByText(/Impresión Térmica de Barra/i)).toBeInTheDocument();
  });
});

describe("AdminOrderDetailPage: Botón Imprimir Comanda en Detalle de Pedido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza el botón Imprimir Comanda y abre el modal al hacer clic", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/pedidos/ord-test-8899")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ order: mockSampleOrder }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ configuration: { whatsappNumber: "3001234567" } }),
      } as unknown as Response);
    });

    render(<AdminOrderDetailPage />);

    // Esperar a que cargue la orden
    const btnPrint = await screen.findByTestId("btn-open-print-modal");
    expect(btnPrint).toBeInTheDocument();
    expect(btnPrint).toHaveTextContent(/Imprimir Comanda/i);

    fireEvent.click(btnPrint);

    // Modal debe aparecer
    expect(screen.getByTestId("order-receipt-modal")).toBeInTheDocument();
    expect(screen.getByText(/Impresión Térmica de Barra/i)).toBeInTheDocument();
  });
});
