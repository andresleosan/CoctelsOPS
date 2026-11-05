import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminDb: vi.fn(),
  getRateLimitIdentity: vi.fn(),
  hashRateLimitIdentity: vi.fn(),
  reserveAIRateLimit: vi.fn(),
  listActiveProducts: vi.fn(),
  listActiveProductsByNegocio: vi.fn(),
  getStoreConfiguration: vi.fn(),
  processOpsyChat: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("@/lib/ai/ai-rate-limit", () => ({
  getRateLimitIdentity: mocks.getRateLimitIdentity,
  hashRateLimitIdentity: mocks.hashRateLimitIdentity,
  reserveAIRateLimit: mocks.reserveAIRateLimit,
}));

vi.mock("@/lib/firestore/products", () => ({
  listActiveProducts: mocks.listActiveProducts,
  listActiveProductsByNegocio: mocks.listActiveProductsByNegocio,
}));

vi.mock("@/lib/firestore/configuration", () => ({
  getStoreConfiguration: mocks.getStoreConfiguration,
}));

vi.mock("@/lib/ai/opsy-guardrails", () => ({
  processOpsyChat: mocks.processOpsyChat,
}));

import { POST } from "@/app/api/opsy/chat/route";

describe("POST /api/opsy/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRateLimitIdentity.mockReturnValue("127.0.0.1");
    mocks.hashRateLimitIdentity.mockReturnValue("test-digest");
    mocks.reserveAIRateLimit.mockResolvedValue(true);
    mocks.listActiveProducts.mockResolvedValue([]);
    mocks.listActiveProductsByNegocio.mockResolvedValue([]);
    mocks.getStoreConfiguration.mockResolvedValue(null);
    mocks.processOpsyChat.mockResolvedValue({
      reply: "¡Qué más parce! Te recomiendo un granizado.",
      suggestions: [
        {
          id: "prod-1",
          name: "Granizado de Maracuyá",
          category: "granizado",
          priceCop: 15000,
          href: "/menu?product=prod-1",
        },
      ],
    });
  });

  it("devuelve 400 cuando el cuerpo no es un JSON válido", async () => {
    const request = new Request("http://localhost:9002/api/opsy/chat", {
      method: "POST",
      body: "invalid-json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("JSON");
  });

  it("devuelve 400 cuando el mensaje está vacío", async () => {
    const request = new Request("http://localhost:9002/api/opsy/chat", {
      method: "POST",
      body: JSON.stringify({ message: "   " }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("vacío");
  });

  it("devuelve 400 cuando el mensaje excede los 1.000 caracteres", async () => {
    const request = new Request("http://localhost:9002/api/opsy/chat", {
      method: "POST",
      body: JSON.stringify({ message: "a".repeat(1001) }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("1.000 caracteres");
  });

  it("devuelve 429 con cabecera Retry-After cuando se excede el rate limit de 5 peticiones", async () => {
    mocks.reserveAIRateLimit.mockResolvedValue(false);

    const request = new Request("http://localhost:9002/api/opsy/chat", {
      method: "POST",
      body: JSON.stringify({ message: "¿Qué cócteles tienen?" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
    const data = await response.json();
    expect(data.code).toBe("RATE_LIMITED");
    expect(data.error).toContain("límite");
  });

  it("devuelve 200 con respuesta y sugerencias válidas", async () => {
    const request = new Request("http://localhost:9002/api/opsy/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "Recomiéndame algo bien rico",
        history: [{ role: "user", content: "Hola" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const data = await response.json();
    expect(data.reply).toContain("granizado");
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].id).toBe("prod-1");
  });

  it("consulta productos aislados por negocio si se envía negocioId", async () => {
    const request = new Request("http://localhost:9002/api/opsy/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "¿Qué granizados hay?",
        negocioId: "negocio-la-parada",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.listActiveProductsByNegocio).toHaveBeenCalledWith("negocio-la-parada");
    expect(mocks.listActiveProducts).not.toHaveBeenCalled();
  });
});

