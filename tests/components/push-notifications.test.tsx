import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
const {
  isPushNotificationSupported,
  getNotificationPermission,
  subscribeUserToPush,
} = vi.hoisted(() => ({
  isPushNotificationSupported: vi.fn(),
  getNotificationPermission: vi.fn(),
  subscribeUserToPush: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth }));
vi.mock("@/lib/notifications/web-push", () => ({
  isPushNotificationSupported,
  getNotificationPermission,
  subscribeUserToPush,
}));

import { PushSubscriptionBanner } from "@/components/notifications/PushSubscriptionBanner";

describe("PushSubscriptionBanner Component", () => {
  const mockGetIdToken = vi.fn().mockResolvedValue("mock-jwt-token");

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useAuth.mockReturnValue({
      user: { uid: "client-1", email: "client@example.com", getIdToken: mockGetIdToken },
      loading: false,
    });
    isPushNotificationSupported.mockReturnValue(true);
    getNotificationPermission.mockReturnValue("default");
    subscribeUserToPush.mockResolvedValue({
      success: true,
      permission: "granted",
    });
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("no renderiza nada cuando las notificaciones push no están soportadas en el navegador", () => {
    isPushNotificationSupported.mockReturnValue(false);
    const { container } = render(<PushSubscriptionBanner orderId="order-123" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza el banner con título, botón de activación y opción de descartar cuando el permiso es 'default'", () => {
    render(<PushSubscriptionBanner orderId="order-123" />);

    expect(
      screen.getByText(/¿Quieres enterarte al instante de tu pedido\?/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Activar notificaciones/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ahora no/i })).toBeInTheDocument();
  });

  it("descarta el banner y guarda en sessionStorage al hacer clic en 'Ahora no'", () => {
    const { container } = render(<PushSubscriptionBanner orderId="order-123" />);

    const dismissButton = screen.getByRole("button", { name: /Ahora no/i });
    fireEvent.click(dismissButton);

    expect(container).toBeEmptyDOMElement();
    expect(sessionStorage.getItem("coctels_push_dismissed_order-123")).toBe("true");
  });

  it("descarta el banner al hacer clic en el botón cerrar (X)", () => {
    const { container } = render(<PushSubscriptionBanner orderId="order-456" />);

    const closeButton = screen.getByRole("button", { name: /Descartar aviso de notificaciones/i });
    fireEvent.click(closeButton);

    expect(container).toBeEmptyDOMElement();
    expect(sessionStorage.getItem("coctels_push_dismissed_order-456")).toBe("true");
  });

  it("completa la suscripción exitosamente y muestra confirmación en tiempo real", async () => {
    const onSubscribed = vi.fn();
    render(<PushSubscriptionBanner orderId="order-789" onSubscribed={onSubscribed} />);

    const activateButton = screen.getByRole("button", { name: /Activar notificaciones/i });

    await act(async () => {
      fireEvent.click(activateButton);
    });

    expect(subscribeUserToPush).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-789",
        idToken: "mock-jwt-token",
      })
    );
    expect(onSubscribed).toHaveBeenCalledTimes(1);

    expect(
      screen.getByText(/¡Avisos activados! Te notificaremos en tiempo real/i)
    ).toBeInTheDocument();
  });

  it("muestra mensaje de error cuando los permisos son denegados por el usuario", async () => {
    subscribeUserToPush.mockResolvedValue({
      success: false,
      permission: "denied",
      error: "Permiso de notificaciones denegado.",
    });

    render(<PushSubscriptionBanner orderId="order-denied" />);

    const activateButton = screen.getByRole("button", { name: /Activar notificaciones/i });

    await act(async () => {
      fireEvent.click(activateButton);
    });

    expect(
      screen.getByText(/Notificaciones bloqueadas en tu navegador/i)
    ).toBeInTheDocument();
  });

  it("muestra mensaje descriptivo de notificaciones desactivadas cuando el permiso ya estaba denegado", () => {
    getNotificationPermission.mockReturnValue("denied");

    render(<PushSubscriptionBanner orderId="order-already-denied" />);

    expect(screen.getByText(/Notificaciones desactivadas/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Las notificaciones están bloqueadas en tu navegador/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Activar notificaciones/i })).not.toBeInTheDocument();
  });
});
