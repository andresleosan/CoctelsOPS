import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStoreConfiguration } = vi.hoisted(() => ({
  getStoreConfiguration: vi.fn(),
}));

vi.mock("@/lib/firestore/configuration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firestore/configuration")>()),
  getStoreConfiguration,
}));

import { GET } from "@/app/api/configuration/route";
import { StoreConfigurationUnavailableError } from "@/lib/firestore/configuration";
import { DEFAULT_STORE_CONFIGURATION } from "@/types/operations";

describe("/api/configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve configuración válida", async () => {
    getStoreConfiguration.mockResolvedValue(DEFAULT_STORE_CONFIGURATION);

    const response = await GET(new Request("http://localhost/api/configuration"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configuration: DEFAULT_STORE_CONFIGURATION });
  });

  it("devuelve 503 cuando la configuración no está disponible", async () => {
    getStoreConfiguration.mockRejectedValue(new StoreConfigurationUnavailableError());

    const response = await GET(new Request("http://localhost/api/configuration"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "La configuración de la tienda no está disponible" });
  });

  it("devuelve 500 con un mensaje genérico ante un fallo interno", async () => {
    getStoreConfiguration.mockRejectedValue(new Error("fallo interno"));

    const response = await GET(new Request("http://localhost/api/configuration"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "No fue posible completar la solicitud" });
  });
});
