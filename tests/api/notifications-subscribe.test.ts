import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyRequest,
  savePushSubscription,
  removePushSubscription,
  getPushSubscriptionsForUser,
} = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  savePushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
  getPushSubscriptionsForUser: vi.fn(),
}));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyRequest,
  AuthorizationError: class AuthorizationError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  toAuthorizationResponse: (error: Error & { status?: number }) =>
    Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));

vi.mock("@/lib/firestore/push-subscriptions", () => ({
  savePushSubscription,
  removePushSubscription,
  getPushSubscriptionsForUser,
}));

import { DELETE, GET, POST } from "@/app/api/notifications/subscribe/route";

describe("API /api/notifications/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("devuelve clave pública VAPID y subscribed=false si no hay usuario autenticado", async () => {
      verifyRequest.mockRejectedValue(new Error("No token"));

      const res = await GET(new Request("http://localhost/api/notifications/subscribe"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.subscribed).toBe(false);
      expect(typeof json.vapidPublicKey).toBe("string");
    });

    it("devuelve subscribed=true si el usuario tiene suscripciones activas", async () => {
      verifyRequest.mockResolvedValue({ uid: "user-123" });
      getPushSubscriptionsForUser.mockResolvedValue([
        {
          id: "sub-1",
          uid: "user-123",
          subscription: { endpoint: "https://push.example.com", keys: { p256dh: "key", auth: "auth" } },
        },
      ]);

      const res = await GET(new Request("http://localhost/api/notifications/subscribe"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.subscribed).toBe(true);
      expect(json.count).toBe(1);
    });
  });

  describe("POST", () => {
    it("falla con 401 si no hay usuario autenticado", async () => {
      const err = new Error("No autenticado") as Error & { status?: number };
      err.status = 401;
      verifyRequest.mockRejectedValue(err);

      const res = await POST(
        new Request("http://localhost/api/notifications/subscribe", {
          method: "POST",
          body: JSON.stringify({
            subscription: {
              endpoint: "https://push.example.com/123",
              keys: { p256dh: "key", auth: "auth" },
            },
          }),
        })
      );
      expect(res.status).toBe(401);
    });

    it("falla con 422 si la suscripción tiene formato inválido", async () => {
      verifyRequest.mockResolvedValue({ uid: "user-123" });

      const res = await POST(
        new Request("http://localhost/api/notifications/subscribe", {
          method: "POST",
          body: JSON.stringify({
            subscription: {
              endpoint: "not-a-valid-url",
            },
          }),
        })
      );
      expect(res.status).toBe(422);
    });

    it("guarda exitosamente la suscripción para el usuario", async () => {
      verifyRequest.mockResolvedValue({ uid: "user-123" });
      savePushSubscription.mockResolvedValue({ id: "doc-abc" });

      const res = await POST(
        new Request("http://localhost/api/notifications/subscribe", {
          method: "POST",
          headers: { "user-agent": "Mozilla/5.0 Test" },
          body: JSON.stringify({
            subscription: {
              endpoint: "https://fcm.googleapis.com/fcm/send/sample-token",
              keys: { p256dh: "p256dh-sample", auth: "auth-sample" },
            },
            orderId: "order-99",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.id).toBe("doc-abc");
      expect(savePushSubscription).toHaveBeenCalledWith(
        "user-123",
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/sample-token",
          keys: { p256dh: "p256dh-sample", auth: "auth-sample" },
        },
        "order-99",
        "Mozilla/5.0 Test"
      );
    });
  });

  describe("DELETE", () => {
    it("falla con 401 si no hay usuario autenticado", async () => {
      const err = new Error("No autenticado") as Error & { status?: number };
      err.status = 401;
      verifyRequest.mockRejectedValue(err);

      const res = await DELETE(
        new Request("http://localhost/api/notifications/subscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/abc" }),
        })
      );
      expect(res.status).toBe(401);
    });

    it("elimina la suscripción existente", async () => {
      verifyRequest.mockResolvedValue({ uid: "user-123" });
      removePushSubscription.mockResolvedValue(true);

      const res = await DELETE(
        new Request("http://localhost/api/notifications/subscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/abc" }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.removed).toBe(true);
      expect(removePushSubscription).toHaveBeenCalledWith("user-123", "https://fcm.googleapis.com/fcm/send/abc");
    });
  });
});
