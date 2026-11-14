import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("staff-pos-token") };

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

vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="permission-gate">{children}</div>
  ),
}));

import AdminOrdersPage from "@/app/admin/pedidos/page";
import { QuickBarPosModal } from "@/components/admin/QuickBarPosModal";
import { clearOfflineDb, listOfflineQueue } from "@/lib/offline/db";
import {
  balanceMixedPaymentAmounts,
  buildPosOrderPayload,
  calculatePosPayment,
  calculatePosUnitPrice,
  createPosCartItem,
  getQuickCashDenominations,
} from "@/lib/orders/pos-calculator";
import { formatOrderReceiptText } from "@/lib/orders/receipt-formatter";
import { createOrderInputSchema } from "@/lib/validation/orders";
import type { Product } from "@/types/catalog";
import type { Order } from "@/types/orders";

const sampleProducts: Product[] = [
  {
    id: "granizado-lulo",
    name: "Granizado Lulo Neón",
    description: "Lulo fresco escarchado",
    price: 15000,
    image: "/catalog-placeholder.svg",
    category: "granizado",
    availableSizes: [
      { name: "8 oz", price: 10000 },
      { name: "16 oz", price: 15000 },
      { name: "24 oz", price: 25000 },
    ],
    availableFlavors: ["Lulo", "Maracuyá"],
    availableAddOns: [
      { name: "Chamoy", price: 1500 },
      { name: "Gomitas", price: 2000 },
    ],
    stock: 10,
    active: true,
    featured: true,
  },
  {
    id: "mojito-fresa",
    name: "Mojito de Fresa",
    description: "Con ron blanco y hierbabuena",
    price: 18000,
    image: "/catalog-placeholder.svg",
    category: "cocktail",
    availableSizes: [{ name: "14 oz", price: 18000 }],
    availableFlavors: ["Fresa"],
    availableAddOns: [],
    stock: 5,
    active: true,
    featured: false,
  },
  {
    id: "soda-agotada",
    name: "Soda Agotada",
    description: "Sin inventario",
    price: 12000,
    image: "/catalog-placeholder.svg",
    category: "special",
    availableFlavors: [],
    availableAddOns: [],
    stock: 0,
    active: true,
    featured: false,
  },
];

const existingServerOrder: Order = {
  id: "ord-existing-1",
  clienteUid: "cust-1",
  customerName: "Sofía Castro",
  phone: "300 111 2233",
  address: "Mesa 2 - Consumo en local",
  items: [
    {
      productId: "mojito-fresa",
      name: "Mojito de Fresa",
      quantity: 1,
      unitPrice: 22000,
      subtotal: 22000,
      customization: { size: "24 oz", flavors: ["Fresa"], addOns: [] },
    },
  ],
  subtotal: 22000,
  total: 22000,
  status: "pendiente",
  createdAt: "2026-11-13T21:30:00.000Z",
  updatedAt: "2026-11-13T21:30:00.000Z",
  audit: { createdByUid: "cust-1", createdAt: "2026-11-13T21:30:00.000Z" },
};

describe("pos-calculator: cálculos de caja y cobro mixto", () => {
  it("calcula precios unitarios reales por presentación y adiciones", () => {
    const unit24 = calculatePosUnitPrice(sampleProducts[0], {
      size: "24 oz",
      flavors: ["Maracuyá"],
      addOns: ["Chamoy", "Gomitas"],
    });
    expect(unit24).toBe(28500);

    const defaultItem = createPosCartItem(sampleProducts[0]);
    expect(defaultItem.customization.size).toBe("16 oz");
    expect(defaultItem.unitPrice).toBe(15000);
  });

  it("calcula vueltas en efectivo y detecta dinero faltante", () => {
    const validCash = calculatePosPayment({
      total: 30000,
      method: "efectivo",
      cashReceived: 50000,
    });
    expect(validCash.isValid).toBe(true);
    expect(validCash.changeAmount).toBe(20000);
    expect(validCash.shortfall).toBe(0);
    expect(validCash.summaryLabel).toContain("Vueltas $20.000");

    const invalidCash = calculatePosPayment({
      total: 30000,
      method: "efectivo",
      cashReceived: 20000,
    });
    expect(invalidCash.isValid).toBe(false);
    expect(invalidCash.shortfall).toBe(10000);
    expect(invalidCash.validationError).toContain("10.000");
  });

  it("calcula pagos digitales (Nequi, Daviplata, QR) y cobro mixto con vueltas sobre efectivo", () => {
    const qrPayment = calculatePosPayment({
      total: 18000,
      method: "qr",
      digitalReference: "QR-9921",
    });
    expect(qrPayment.isValid).toBe(true);
    expect(qrPayment.digitalAmount).toBe(18000);
    expect(qrPayment.digitalMethod).toBe("qr");
    expect(qrPayment.summaryLabel).toContain("Ref: QR-9921");

    // Cobro mixto: Total $45.000 = $20.000 Nequi + $25.000 Efectivo; paga efectivo con billete de $50.000 -> vueltas $25.000
    const mixed = calculatePosPayment({
      total: 45000,
      method: "mixto",
      digitalMethod: "nequi",
      digitalAmount: 20000,
      cashAmount: 25000,
      cashReceived: 50000,
    });
    expect(mixed.isValid).toBe(true);
    expect(mixed.cashAmount).toBe(25000);
    expect(mixed.digitalAmount).toBe(20000);
    expect(mixed.changeAmount).toBe(25000);
    expect(mixed.summaryLabel).toContain("Nequi $20.000");
    expect(mixed.summaryLabel).toContain("Vueltas $25.000");

    const invalidMixed = calculatePosPayment({
      total: 45000,
      method: "mixto",
      digitalMethod: "daviplata",
      digitalAmount: 20000,
      cashAmount: 20000,
      cashReceived: 20000,
    });
    expect(invalidMixed.isValid).toBe(false);
    expect(invalidMixed.validationError).toContain("5.000");
  });

  it("balancea automáticamente los montos de cobro mixto y sugiere denominaciones COP", () => {
    expect(balanceMixedPaymentAmounts(45000, "digital", 15000)).toEqual({
      digitalAmount: 15000,
      cashAmount: 30000,
    });
    expect(balanceMixedPaymentAmounts(45000, "cash", 60000)).toEqual({
      cashAmount: 45000,
      digitalAmount: 0,
    });

    expect(getQuickCashDenominations(15000)).toEqual([20000, 50000, 100000]);
    expect(getQuickCashDenominations(120000)).toEqual([150000, 200000]);
  });

  it("construye payload válido para servidor y esquema Zod", () => {
    const item = createPosCartItem(sampleProducts[0], { size: "16 oz", flavors: ["Lulo"] }, 2);
    const payment = calculatePosPayment({
      total: 30000,
      method: "mixto",
      digitalMethod: "daviplata",
      digitalAmount: 10000,
      cashAmount: 20000,
      cashReceived: 50000,
    });

    const { payload, preview } = buildPosOrderPayload({
      items: [item],
      serviceType: "mesa",
      tableNumber: "4",
      payment,
    });

    const parsed = createOrderInputSchema.parse(payload);
    expect(parsed.customerName).toBe("Mesa 4");
    expect(parsed.serviceType).toBe("mesa");
    expect(parsed.paymentMethod).toBe("mixto");
    expect(parsed.paymentBreakdown?.changeAmount).toBe(30000);
    expect(preview.total).toBe(30000);
  });

  it("imprime el desglose de pago POS y vueltas en el ticket térmico", () => {
    const receipt = formatOrderReceiptText({
      ...existingServerOrder,
      paymentMethod: "mixto",
      paymentBreakdown: {
        cashAmount: 8000,
        cashReceived: 20000,
        changeAmount: 12000,
        digitalAmount: 10000,
        digitalMethod: "nequi",
        digitalReference: "NQ-4421",
      },
    });

    expect(receipt).toContain("PAGO:");
    expect(receipt).toContain("Efectivo:");
    expect(receipt).toContain("Nequi:");
    expect(receipt).toContain("Recibido:");
    expect(receipt).toContain("Vueltas:");
    expect(receipt).toContain("Ref Digital: NQ-4421");
  });
});

describe("QuickBarPosModal: flujo táctil POS", () => {
  afterEach(() => {
    cleanup();
  });

  it("toma un pedido rápido en barra con cálculo automático de vueltas en efectivo", async () => {
    const onSubmitPosOrder = vi.fn().mockResolvedValue({
      ok: true,
      synced: true,
      order: { ...existingServerOrder, id: "ord-pos-100" },
    });

    render(
      <QuickBarPosModal
        isOpen={true}
        onClose={vi.fn()}
        products={sampleProducts}
        isOnline={true}
        onSubmitPosOrder={onSubmitPosOrder}
      />,
    );

    // 1 tap para agregar Granizado Lulo Neón (16 oz $15.000)
    fireEvent.click(screen.getByTestId("pos-quick-add-granizado-lulo"));
    expect(screen.getByTestId("pos-order-total")).toHaveTextContent("$15.000");

    // El producto agotado no permite agregar
    expect(screen.getByTestId("pos-quick-add-soda-agotada")).toBeDisabled();

    // Tocar billete rápido de $50.000 -> vueltas $35.000
    fireEvent.click(screen.getByTestId("pos-bill-50000"));
    expect(screen.getByTestId("pos-change-display")).toHaveTextContent("$35.000");

    // Enviar pedido
    fireEvent.click(screen.getByTestId("pos-submit-order"));

    await waitFor(() => {
      expect(onSubmitPosOrder).toHaveBeenCalledTimes(1);
    });

    const [submittedPayload, submittedPreview] = onSubmitPosOrder.mock.calls[0];
    expect(submittedPayload.serviceType).toBe("pickup");
    expect(submittedPayload.paymentMethod).toBe("efectivo");
    expect(submittedPayload.paymentBreakdown).toEqual({
      cashAmount: 15000,
      cashReceived: 50000,
      changeAmount: 35000,
      digitalAmount: 0,
    });
    expect(submittedPreview.total).toBe(15000);

    expect(screen.getByTestId("pos-last-order-banner")).toHaveTextContent("Entregar vueltas: $35.000");
  });

  it("permite personalización rápida (24 oz + sabor + adición) y cobro mixto Efectivo + Nequi", async () => {
    const onSubmitPosOrder = vi.fn().mockResolvedValue({ ok: true, synced: true });

    render(
      <QuickBarPosModal
        isOpen={true}
        onClose={vi.fn()}
        products={sampleProducts}
        isOnline={true}
        onSubmitPosOrder={onSubmitPosOrder}
      />,
    );

    // Abrir personalizador inline de Granizado
    fireEvent.click(screen.getByTestId("pos-customize-granizado-lulo"));
    expect(screen.getByTestId("pos-inline-customizer")).toBeInTheDocument();

    // Elegir 24 oz ($25.000), sabor Maracuyá y adición Chamoy (+$1.500) = $26.500
    fireEvent.click(screen.getByRole("button", { name: /24 oz/i }));
    fireEvent.click(screen.getByRole("button", { name: "Maracuyá" }));
    fireEvent.click(screen.getByRole("button", { name: /Chamoy/i }));
    fireEvent.click(screen.getByTestId("pos-confirm-customize"));

    expect(screen.getByTestId("pos-order-total")).toHaveTextContent("$26.500");

    // Seleccionar Cobro Mixto (Efectivo + Nequi)
    fireEvent.click(screen.getByTestId("pos-method-mixto"));
    fireEvent.change(screen.getByTestId("pos-mixed-digital-input"), { target: { value: "10000" } });

    // El monto en efectivo se ajusta automáticamente a $16.500
    expect(screen.getByTestId("pos-mixed-cash-input")).toHaveValue(16500);

    // Cliente entrega billete de $20.000 para la parte en efectivo -> vueltas $3.500
    fireEvent.click(screen.getByTestId("pos-bill-20000"));
    expect(screen.getByTestId("pos-change-display")).toHaveTextContent("$3.500");

    // Referencia Nequi opcional
    fireEvent.change(screen.getByTestId("pos-digital-reference-input"), { target: { value: "8821" } });

    fireEvent.click(screen.getByTestId("pos-submit-order"));

    await waitFor(() => {
      expect(onSubmitPosOrder).toHaveBeenCalledTimes(1);
    });

    const [submittedPayload] = onSubmitPosOrder.mock.calls[0];
    expect(submittedPayload.items[0].customization).toEqual({
      size: "24 oz",
      flavors: ["Maracuyá"],
      addOns: ["Chamoy"],
    });
    expect(submittedPayload.paymentMethod).toBe("mixto");
    expect(submittedPayload.paymentBreakdown).toEqual({
      cashAmount: 16500,
      cashReceived: 20000,
      changeAmount: 3500,
      digitalAmount: 10000,
      digitalMethod: "nequi",
      digitalReference: "8821",
    });
  });

  it("bloquea el cobro si el efectivo recibido es insuficiente", () => {
    render(
      <QuickBarPosModal
        isOpen={true}
        onClose={vi.fn()}
        products={sampleProducts}
        isOnline={true}
        onSubmitPosOrder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("pos-quick-add-granizado-lulo"));
    fireEvent.change(screen.getByTestId("pos-cash-received-input"), { target: { value: "10000" } });

    expect(screen.getByTestId("pos-payment-error")).toHaveTextContent("Faltan $5.000 COP");
    expect(screen.getByTestId("pos-submit-order")).toBeDisabled();
  });
});

describe("AdminOrdersPage: integración POS y encolado resiliente offline", () => {
  const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

  function setOnlineState(online: boolean) {
    Object.defineProperty(window.navigator, "onLine", {
      value: online,
      configurable: true,
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await clearOfflineDb();
    setOnlineState(true);
  });

  afterEach(async () => {
    cleanup();
    await clearOfflineDb();
    if (originalOnLineDescriptor) {
      Object.defineProperty(window.navigator, "onLine", originalOnLineDescriptor);
    }
    vi.unstubAllGlobals();
  });

  it("encola el pedido POS localmente cuando no hay WiFi y lo proyecta de inmediato en Pedidos", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: { method?: string }) => {
      if (url === "/api/pedidos" && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ orders: [existingServerOrder] }),
        });
      }
      if (url === "/api/productos") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ products: sampleProducts }),
        });
      }
      if (url === "/api/pedidos" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              order: {
                ...existingServerOrder,
                id: "ord-synced-from-pos",
                customerName: "Cliente Barra",
                paymentMethod: "qr",
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText("Sofía Castro")).toBeInTheDocument();
    });

    // Simular caída de WiFi durante hora pico antes de tomar pedido en caja
    setOnlineState(false);
    window.dispatchEvent(new Event("offline"));

    // Abrir modal POS Barra
    fireEvent.click(screen.getByTestId("btn-open-quick-pos"));
    expect(screen.getByTestId("quick-bar-pos-modal")).toBeInTheDocument();
    expect(screen.getByTestId("pos-connectivity-badge")).toHaveTextContent(/Modo Offline/i);

    // Agregar bebida, elegir Código QR y encolar offline
    fireEvent.click(screen.getByTestId("pos-quick-add-mojito-fresa"));
    fireEvent.click(screen.getByTestId("pos-method-qr"));
    expect(screen.getByTestId("pos-submit-order")).toHaveTextContent(/Encolar Pedido Offline/i);

    fireEvent.click(screen.getByTestId("pos-submit-order"));

    await waitFor(() => {
      expect(screen.getByTestId("pos-last-order-banner")).toHaveTextContent(/cola offline/i);
    });

    // No se debió enviar POST mientras estaba offline, pero sí quedó en la cola persistente
    const postCallsWhileOffline = fetchMock.mock.calls.filter(
      ([url, opts]) => url === "/api/pedidos" && opts?.method === "POST",
    );
    expect(postCallsWhileOffline).toHaveLength(0);

    const queue = await listOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe("create_order");

    // Cerrar modal y verificar que la comanda provisional aparece en /admin/pedidos con su precio real
    fireEvent.click(screen.getByRole("button", { name: "Cerrar terminal POS" }));
    expect(screen.getByText("Cliente Barra")).toBeInTheDocument();
    expect(screen.getByText("$18.000")).toBeInTheDocument();
    expect(screen.getByTestId("btn-sync-offline-queue")).toHaveTextContent("Sincronizar cola (1)");

    // Recuperar WiFi y verificar sincronización automática contra /api/pedidos
    setOnlineState(true);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      const postCallsAfterOnline = fetchMock.mock.calls.filter(
        ([url, opts]) => url === "/api/pedidos" && opts?.method === "POST",
      );
      expect(postCallsAfterOnline).toHaveLength(1);
    });
  });
});
