import { describe, expect, it } from "vitest";

import {
  evaluateStoreAvailability,
  getAvailableScheduledSlots,
  validateOrderSchedule,
  type StoreScheduleConfig,
} from "@/lib/orders/store-schedule";
import { DEFAULT_STORE_CONFIGURATION } from "@/types/operations";

const baseConfig: StoreScheduleConfig = {
  timezone: "America/Bogota",
  businessHours: [
    { day: "Lunes", open: "10:00", close: "22:00", closed: false },
    { day: "Martes", open: "10:00", close: "22:00", closed: true },
    { day: "Miércoles", open: "10:00", close: "22:00", closed: false },
    { day: "Jueves", open: "10:00", close: "22:00", closed: false },
    { day: "Viernes", open: "10:00", close: "23:00", closed: false },
    { day: "Sábado", open: "10:00", close: "23:00", closed: false },
    { day: "Domingo", open: "12:00", close: "20:00", closed: false },
  ],
  emergencyPause: { active: false },
  scheduledOrders: {
    enabled: true,
    slotIntervalMinutes: 30,
    minLeadMinutes: 45,
    maxDaysAhead: 2,
  },
};

describe("store-schedule (horarios, pausa de emergencia y pedidos programados)", () => {
  it("detecta estado abierto dentro de horario y cerrado antes/después de apertura", () => {
    // Jueves 2026-11-26 14:00 Bogotá (UTC-5 -> 19:00Z)
    const openNow = new Date("2026-11-26T19:00:00.000Z");
    const openState = evaluateStoreAvailability(baseConfig, openNow);
    expect(openState.status).toBe("open");
    expect(openState.isOpenNow).toBe(true);
    expect(openState.isWithinBusinessHours).toBe(true);

    // Jueves 2026-11-26 08:30 Bogotá (UTC-5 -> 13:30Z)
    const beforeOpen = new Date("2026-11-26T13:30:00.000Z");
    const closedBefore = evaluateStoreAvailability(baseConfig, beforeOpen);
    expect(closedBefore.status).toBe("closed");
    expect(closedBefore.isOpenNow).toBe(false);
    expect(closedBefore.nextOpenWindow?.isToday).toBe(true);
    expect(closedBefore.nextOpenWindow?.open).toBe("10:00");

    // Martes 2026-11-24 14:00 Bogotá (UTC-5 -> 19:00Z) - día marcado closed: true
    const closedDay = new Date("2026-11-24T19:00:00.000Z");
    const closedDayState = evaluateStoreAvailability(baseConfig, closedDay);
    expect(closedDayState.status).toBe("closed");
    expect(closedDayState.nextOpenWindow?.isTomorrow).toBe(true);
    expect(closedDayState.nextOpenWindow?.dayLabel).toBe("Mañana");
  });

  it("trata businessHours vacío como abierto por defecto salvo que exista pausa", () => {
    const noHoursConfig: StoreScheduleConfig = {
      ...DEFAULT_STORE_CONFIGURATION,
      businessHours: [],
      emergencyPause: { active: false },
    };
    expect(evaluateStoreAvailability(noHoursConfig).status).toBe("open");
    expect(
      evaluateStoreAvailability({
        ...noHoursConfig,
        emergencyPause: { active: true, reason: "Barra saturada" },
      }).status,
    ).toBe("paused");
  });

  it("evalúa pausa activa manual, con resumeAt futuro y con resumeAt expirado", () => {
    const now = new Date("2026-11-26T19:00:00.000Z"); // 14:00 Bogotá

    const futurePause = evaluateStoreAvailability(
      {
        ...baseConfig,
        emergencyPause: {
          active: true,
          reason: "Alta demanda en barra",
          resumeAt: "2026-11-26T19:45:00.000Z",
        },
      },
      now,
    );
    expect(futurePause.status).toBe("paused");
    expect(futurePause.isPaused).toBe(true);
    expect(futurePause.canOrderNow).toBe(false);
    expect(futurePause.pauseReason).toBe("Alta demanda en barra");

    const expiredPause = evaluateStoreAvailability(
      {
        ...baseConfig,
        emergencyPause: {
          active: true,
          reason: "Pausa ya vencida",
          resumeAt: "2026-11-26T18:30:00.000Z",
        },
      },
      now,
    );
    expect(expiredPause.status).toBe("open");
    expect(expiredPause.isPaused).toBe(false);
    expect(expiredPause.isOpenNow).toBe(true);
  });

  it("genera franjas programadas respetando anticipación mínima, pausas y días cerrados", () => {
    // Jueves 14:00 Bogotá (19:00Z). minLead 45m -> earliest 14:45 -> primer slot 15:00 (20:00Z)
    const now = new Date("2026-11-26T19:00:00.000Z");
    const slots = getAvailableScheduledSlots(baseConfig, now);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].time24).toBe("15:00");
    expect(slots[0].dayLabel).toBe("Hoy");

    // Pausa indefinida (sin resumeAt) salta franjas a mañana
    const indefinitePauseSlots = getAvailableScheduledSlots(
      {
        ...baseConfig,
        emergencyPause: { active: true, reason: "Barra saturada" },
      },
      now,
    );
    expect(indefinitePauseSlots.length).toBeGreaterThan(0);
    expect(indefinitePauseSlots[0].dayLabel).toBe("Mañana");

    // Pausa con resumeAt a las 16:00 Bogotá (21:00Z) permite slots desde las 16:00 hoy
    const timedPauseSlots = getAvailableScheduledSlots(
      {
        ...baseConfig,
        emergencyPause: {
          active: true,
          resumeAt: "2026-11-26T21:00:00.000Z",
        },
      },
      now,
    );
    expect(timedPauseSlots[0].dayLabel).toBe("Hoy");
    expect(timedPauseSlots[0].time24).toBe("16:00");

    // Deshabilitado -> []
    expect(
      getAvailableScheduledSlots(
        {
          ...baseConfig,
          scheduledOrders: {
            enabled: false,
            slotIntervalMinutes: 30,
            minLeadMinutes: 45,
            maxDaysAhead: 2,
          },
        },
        now,
      ),
    ).toEqual([]);
  });

  it("valida pedidos inmediatos y programados en servidor con reglas estrictas", () => {
    // Jueves 14:00 Bogotá (19:00Z)
    const now = new Date("2026-11-26T19:00:00.000Z");
    // Jueves 08:30 Bogotá (13:30Z) - cerrado
    const closedNow = new Date("2026-11-26T13:30:00.000Z");

    // Inmediato cerrado -> STORE_CLOSED
    const immediateClosed = validateOrderSchedule({
      config: baseConfig,
      serviceType: "delivery",
      now: closedNow,
    });
    expect(immediateClosed).toMatchObject({ allowed: false, code: "STORE_CLOSED" });

    // Inmediato pausado -> STORE_PAUSED
    const immediatePaused = validateOrderSchedule({
      config: {
        ...baseConfig,
        emergencyPause: { active: true, reason: "Saturado" },
      },
      serviceType: "delivery",
      now,
    });
    expect(immediatePaused).toMatchObject({ allowed: false, code: "STORE_PAUSED" });

    // Programado en mesa -> INVALID_SCHEDULE_TIME
    const mesaScheduled = validateOrderSchedule({
      config: baseConfig,
      serviceType: "mesa",
      scheduledFor: "2026-11-26T21:00:00.000Z",
      now,
    });
    expect(mesaScheduled).toMatchObject({ allowed: false, code: "INVALID_SCHEDULE_TIME" });

    // Programado fuera de horario (23:30 jueves, cuando cierra a 22:00)
    const outsideHours = validateOrderSchedule({
      config: baseConfig,
      serviceType: "delivery",
      scheduledFor: "2026-11-27T04:30:00.000Z", // 23:30 Bogotá jueves
      now,
    });
    expect(outsideHours).toMatchObject({ allowed: false, code: "INVALID_SCHEDULE_TIME" });

    // Programado válido para las 16:00 Bogotá (21:00Z) estando cerrado a las 08:30
    const validScheduled = validateOrderSchedule({
      config: baseConfig,
      serviceType: "delivery",
      scheduledFor: "2026-11-26T21:00:00.000Z",
      now: closedNow,
    });
    expect(validScheduled).toMatchObject({
      allowed: true,
      fulfillmentMode: "scheduled",
      scheduledFor: "2026-11-26T21:00:00.000Z",
    });
  });
});
