/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, useAuth, useRouter, pushSpy, clearCartSpy } = vi.hoisted(() => ({
  useCart: vi.fn(),
  useAuth: vi.fn(),
  useRouter: vi.fn(),
  pushSpy: vi.fn(),
  clearCartSpy: vi.fn(),
}));

vi.mock("@/context/cart-context", () => ({ useCart }));
vi.mock("@/hooks/use-auth", () => ({ useAuth }));
vi.mock("next/navigation", () => ({ useRouter }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const cleanProps: Record<string, unknown> = { ...props };
    delete cleanProps.unoptimized;
    delete cleanProps.fill;
    delete cleanProps.priority;
    return <img alt={String(props.alt ?? "")} {...cleanProps} />;
  },
}));
vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: ReactNode }) => (
    <div data-testid="admin-guard">{children}</div>
  ),
}));
vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => (
    <div data-testid="permission-gate">{children}</div>
  ),
}));

import CashRegisterPage from "@/app/admin/caja/page";
import CheckoutPage from "@/app/checkout/page";
import { OrderKdsBoard } from "@/components/admin/OrderKdsBoard";
import type { CashTransferVerificationItem } from "@/types/cash-register";
import type { Order } from "@/types/orders";

const configuration = {
  whatsappNumber: "573245550000",
  businessHours: [],
  deliveryZones: ["Centro"],
  estimatedDeliveryMinutes: 45,
  messages: {
    orderReceived: "Recibido",
    orderStatus: "Estado",
    unavailable: "No disponible",
  },
};

describe("Checkout transfer proof upload", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:proof-preview"),
      revokeObjectURL: vi.fn(),
    });
    useCart.mockReturnValue({
      totalPrice: 30000,
      items: [
        {
          id: "item-1",
          productId: "fresa",
          name: "Granizado Fresa",
          price: 15000,
          quantity: 2,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ],
      clearCart: clearCartSpy,
      getCheckoutItems: vi.fn(() => [
        {
          productId: "fresa",
          quantity: 2,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ]),
    });
    useAuth.mockReturnValue({
      user: { getIdToken: vi.fn().mockResolvedValue("token-customer") },
      loading: false,
      isVerified: true,
    });
    useRouter.mockReturnValue({ replace: vi.fn(), push: pushSpy });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("valida el archivo de comprobante, muestra preview y lo sube a /api/pedidos/[id]/comprobante tras crear el pedido", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ configuration }),
        } as Response;
      }
      if (url === "/api/pedidos") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ order: { id: "pedido-proof-1" } }),
        } as Response;
      }
      if (url === "/api/pedidos/pedido-proof-1/comprobante") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            paymentVerificationStatus: "pendiente_verificacion",
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    fireEvent.click(screen.getByText(/TRANSFERENCIA \(NEQUI \/ DAVIPLATA \/ BANCOLOMBIA\)/i));
    fireEvent.click(screen.getByRole("button", { name: "Nequi" }));
    fireEvent.change(screen.getByLabelText(/Referencia o últimos 4 dígitos/i), {
      target: { value: "Ref 7788" },
    });

    const fileInput = screen.getByLabelText(/Adjuntar comprobante de transferencia/i);

    const invalidFile = new File(["GIF89a"], "malo.gif", { type: "image/gif" });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });
    expect(
      screen.getByText(/Solo se aceptan comprobantes en formato JPEG, PNG o WebP/i),
    ).toBeInTheDocument();

    const validFile = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "nequi-captura.png",
      { type: "image/png" },
    );
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(
      screen.getByAltText("Vista previa del comprobante de transferencia"),
    ).toHaveAttribute("src", "blob:proof-preview");

    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), {
      target: { value: "Laura Torres" },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono de Contacto/i), {
      target: { value: "3004445566" },
    });
    fireEvent.change(screen.getByLabelText(/Dirección Exacta/i), {
      target: { value: "Calle 30 # 15-20" },
    });

    fireEvent.click(screen.getByRole("button", { name: /CONFIRMAR PEDIDO/i }));

    await waitFor(() => {
      const proofCall = fetchSpy.mock.calls.find(
        ([url]) => String(url) === "/api/pedidos/pedido-proof-1/comprobante",
      );
      expect(proofCall).toBeDefined();
      const body = proofCall?.[1]?.body as FormData;
      expect(body.get("channel")).toBe("nequi");
      expect(body.get("reference")).toBe("Ref 7788");
      expect(body.get("comprobante")).toBeInstanceOf(File);
      expect(clearCartSpy).toHaveBeenCalled();
      expect(pushSpy).toHaveBeenCalledWith("/order-status/pedido-proof-1");
    });
  });
});

describe("KDS and Caja 1-tap transfer proof verification", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { getIdToken: vi.fn().mockResolvedValue("token-staff") },
      loading: false,
      isVerified: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("muestra comprobante en KDS, abre vista ampliada y permite aprobar o rechazar en 1 tap", () => {
    const orderWithProof: Order = {
      id: "ord-kds-proof-1",
      clienteUid: "cli-1",
      customerName: "Sofía Mejía",
      phone: "3120001122",
      address: "Mesa 3 - Consumo en local",
      items: [
        {
          productId: "granizado-fresa",
          name: "Granizado Fresa",
          quantity: 1,
          unitPrice: 15000,
          subtotal: 15000,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ],
      subtotal: 15000,
      total: 15000,
      status: "pendiente",
      paymentMethod: "nequi",
      paymentBreakdown: {
        cashAmount: 0,
        cashReceived: 0,
        changeAmount: 0,
        digitalAmount: 15000,
        digitalMethod: "nequi",
        digitalReference: "Ref 8842",
      },
      paymentVerificationStatus: "pendiente_verificacion",
      paymentProof: {
        url: "https://cdn.example.com/comprobante-kds.png",
        key: "orders/payment-proofs/ord-kds-proof-1/uuid.png",
        contentType: "image/png",
        uploadedAt: "2026-11-24T01:00:00.000Z",
        uploadedByUid: "cli-1",
        channel: "nequi",
        reference: "Ref 8842",
      },
      createdAt: "2026-11-24T01:00:00.000Z",
      updatedAt: "2026-11-24T01:00:00.000Z",
      audit: { createdByUid: "cli-1", createdAt: "2026-11-24T01:00:00.000Z" },
    };

    const onVerifyPayment = vi.fn();
    render(
      <OrderKdsBoard
        orders={[orderWithProof]}
        nowMs={Date.parse("2026-11-24T01:04:00.000Z")}
        onAdvanceOrder={vi.fn()}
        onVerifyPayment={onVerifyPayment}
      />,
    );

    expect(
      screen.getByTestId("payment-verification-badge-ord-kds-proof-1"),
    ).toHaveTextContent("Pago por verificar");
    expect(screen.getByText("Ref: Ref 8842")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("btn-view-proof-ord-kds-proof-1"));
    expect(
      screen.getByRole("dialog", { name: /Comprobante de transferencia pedido ord-kds-proof-1/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    fireEvent.click(screen.getByTestId("btn-verify-payment-ord-kds-proof-1"));
    expect(onVerifyPayment).toHaveBeenCalledWith(orderWithProof, "verificado", undefined);

    fireEvent.click(screen.getByTestId("btn-reject-payment-ord-kds-proof-1"));
    fireEvent.click(screen.getByRole("button", { name: "Monto no coincide con el total" }));
    fireEvent.click(screen.getByTestId("btn-confirm-reject-ord-kds-proof-1"));
    expect(onVerifyPayment).toHaveBeenCalledWith(
      orderWithProof,
      "rechazado",
      "Monto no coincide con el total",
    );
  });

  it("permite aprobar y rechazar comprobantes en 1 tap desde /admin/caja", async () => {
    const pendingTransfer: CashTransferVerificationItem = {
      orderId: "ord-caja-1",
      customerName: "Mateo Restrepo",
      phone: "3102223344",
      total: 42000,
      status: "pendiente",
      createdAt: "2026-11-24T01:15:00.000Z",
      paymentMethod: "daviplata",
      digitalChannel: "daviplata",
      digitalReference: "Ref 1102",
      paymentVerificationStatus: "pendiente_verificacion",
      paymentProof: {
        url: "https://cdn.example.com/comprobante-caja.png",
        uploadedAt: "2026-11-24T01:16:00.000Z",
        channel: "daviplata",
        reference: "Ref 1102",
      },
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/caja" && (!init?.method || init.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            activeShift: null,
            liveSales: null,
            history: [],
            transferOrders: [pendingTransfer],
          }),
        } as Response;
      }
      if (url === "/api/pedidos/ord-caja-1/comprobante" && init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            order: { id: "ord-caja-1" },
            paymentVerificationStatus: "verificado",
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CashRegisterPage />);

    await waitFor(() => {
      expect(screen.getByTestId("cash-transfer-row-ord-caja-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-verify-payment-ord-caja-1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pedidos/ord-caja-1/comprobante",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "verificado" }),
        }),
      );
    });

    fireEvent.click(screen.getByTestId("btn-reject-payment-ord-caja-1"));
    fireEvent.click(screen.getByRole("button", { name: "Comprobante borroso o ilegible" }));
    fireEvent.click(screen.getByTestId("btn-confirm-reject-ord-caja-1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pedidos/ord-caja-1/comprobante",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "rechazado",
            reason: "Comprobante borroso o ilegible",
          }),
        }),
      );
    });
  });
});
