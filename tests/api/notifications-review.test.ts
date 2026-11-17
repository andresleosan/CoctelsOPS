import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, verifyRequest, markNotificationRead } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  verifyRequest: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requirePermission }));
vi.mock("@/lib/auth/verify-request", () => ({ verifyRequest, toAuthorizationResponse: (error: Error & { status?: number }) => Response.json({ error: error.message }, { status: error.status ?? 500 }) }));
vi.mock("@/lib/firestore/notifications", () => ({ listAdminNotifications: vi.fn(), listNotifications: vi.fn(), markNotificationRead }));

import { PATCH } from "@/app/api/notifications/route";

describe("mutación de notificaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({ uid: "customer-1", token: { admin: false }, profile: { accountType: "customer" } });
    verifyRequest.mockResolvedValue({ uid: "customer-1", token: { admin: false }, profile: { accountType: "customer" } });
    markNotificationRead.mockResolvedValue(undefined);
  });

  it("requiere permiso explícito y conserva el UID del usuario", async () => {
    const response = await PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify({ id: "notification-1" }) }));

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "notificaciones.read");
    expect(verifyRequest).not.toHaveBeenCalled();
    expect(markNotificationRead).toHaveBeenCalledWith("notification-1", "customer-1", false);
  });

  it("reconoce al propietario admin verificado al marcar notificaciones del equipo", async () => {
    requirePermission.mockResolvedValueOnce({
      uid: "owner-1",
      token: { email: "andres.san1404@gmail.com", email_verified: true, admin: false },
      profile: { accountType: "admin" },
    });

    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id: "notification-2" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(markNotificationRead).toHaveBeenCalledWith("notification-2", "owner-1", true);
  });
});
