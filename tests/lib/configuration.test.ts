import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, runTransaction, transactionGet, transactionSet, transactionCreate } = vi.hoisted(() => ({
  get: vi.fn(),
  runTransaction: vi.fn(),
  transactionGet: vi.fn(),
  transactionSet: vi.fn(),
  transactionCreate: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({ get, id: "principal" }),
    }),
    runTransaction,
  }),
}));

import {
  emergencyPausePatchSchema,
  getStoreConfiguration,
  StoreConfigurationUnavailableError,
  storeConfigurationSchema,
  updateEmergencyPause,
} from "@/lib/firestore/configuration";
import { DEFAULT_STORE_CONFIGURATION } from "@/types/operations";

describe("configuración del negocio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        get: transactionGet,
        set: transactionSet,
        create: transactionCreate,
      }),
    );
  });

  it("rechaza horas imposibles aunque respeten el formato HH:mm", () => {
    expect(() => storeConfigurationSchema.parse({ ...DEFAULT_STORE_CONFIGURATION, businessHours: DEFAULT_STORE_CONFIGURATION.businessHours.map((hour, index) => index === 0 ? { ...hour, open: "29:90" } : hour) })).toThrow();
  });

  it("rechaza rangos iguales o invertidos porque no se soportan turnos nocturnos implícitos", () => {
    expect(() => storeConfigurationSchema.parse({ ...DEFAULT_STORE_CONFIGURATION, businessHours: DEFAULT_STORE_CONFIGURATION.businessHours.map((hour, index) => index === 0 ? { ...hour, open: "18:00", close: "18:00" } : hour) })).toThrow("cierre");
    expect(() => storeConfigurationSchema.parse({ ...DEFAULT_STORE_CONFIGURATION, businessHours: DEFAULT_STORE_CONFIGURATION.businessHours.map((hour, index) => index === 0 ? { ...hour, open: "18:00", close: "09:00" } : hour) })).toThrow("cierre");
  });

  it("rechaza una configuración ausente en lectura estricta y usa defaults solo cuando se permite", async () => {
    get.mockResolvedValue({ exists: false });

    await expect(getStoreConfiguration()).rejects.toBeInstanceOf(StoreConfigurationUnavailableError);
    await expect(getStoreConfiguration({ allowDefaults: true })).resolves.toEqual(DEFAULT_STORE_CONFIGURATION);
  });

  it("rechaza una configuración almacenada con un WhatsApp inválido en lectura estricta", async () => {
    get.mockResolvedValue({
      exists: true,
      data: () => ({ ...DEFAULT_STORE_CONFIGURATION, whatsappNumber: "123" }),
    });

    await expect(getStoreConfiguration()).rejects.toBeInstanceOf(StoreConfigurationUnavailableError);
  });

  it("valida configuración de pedidos programados y pausa de emergencia", () => {
    const parsed = storeConfigurationSchema.parse({
      ...DEFAULT_STORE_CONFIGURATION,
      timezone: "America/Bogota",
      emergencyPause: { active: true, reason: "Barra llena" },
      scheduledOrders: {
        enabled: true,
        slotIntervalMinutes: 30,
        minLeadMinutes: 45,
        maxDaysAhead: 2,
      },
    });
    expect(parsed.emergencyPause?.active).toBe(true);
    expect(parsed.scheduledOrders?.slotIntervalMinutes).toBe(30);

    expect(() =>
      storeConfigurationSchema.parse({
        ...DEFAULT_STORE_CONFIGURATION,
        scheduledOrders: {
          enabled: true,
          slotIntervalMinutes: 5,
          minLeadMinutes: 45,
          maxDaysAhead: 2,
        },
      }),
    ).toThrow();

    expect(() => emergencyPausePatchSchema.parse({ active: true, durationMinutes: 5 })).toThrow();
  });

  it("activa y desactiva la pausa de emergencia con transacción y auditoría", async () => {
    transactionGet.mockResolvedValue({
      exists: true,
      data: () => DEFAULT_STORE_CONFIGURATION,
    });

    const paused = await updateEmergencyPause(
      { active: true, reason: "Mucha demanda", durationMinutes: 30 },
      "staff-1",
    );
    expect(paused.emergencyPause?.active).toBe(true);
    expect(paused.emergencyPause?.reason).toBe("Mucha demanda");
    expect(paused.emergencyPause?.resumeAt).toBeDefined();
    expect(transactionSet).toHaveBeenCalledTimes(1);
    expect(transactionCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "emergency_pause_on",
        module: "configuracion",
      }),
    );

    const resumed = await updateEmergencyPause({ active: false }, "staff-1");
    expect(resumed.emergencyPause?.active).toBe(false);
    expect(resumed.emergencyPause?.resumeAt).toBeUndefined();
  });
});
