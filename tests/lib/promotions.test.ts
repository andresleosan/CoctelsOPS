import { describe, expect, it } from "vitest";

import {
  calculatePromotion,
  getDayAndTimeInTimezone,
  isWithinSchedule,
  promotionInputSchema,
} from "@/lib/firestore/promotions";
import type { Promotion, PromotionContext } from "@/types/promotions";

const promotion: Promotion = {
  id: "promo-1",
  code: "FIESTA",
  active: true,
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-12-31T23:59:59.999Z",
  discountType: "percent",
  discountValue: 20,
  minimumSubtotal: 20_000,
  productIds: ["fresa"],
  usageLimit: 10,
  usageCount: 2,
  maxDiscount: 8_000,
};

const context: PromotionContext = {
  promotion,
  subtotal: 30_000,
  now: "2026-08-04T12:00:00.000Z",
  items: [{ productId: "fresa", category: "granizado", subtotal: 30_000, quantity: 1, unitPrice: 30_000 }],
};

describe("calculadora de promociones", () => {
  it("calcula un total determinista y respeta el tope", () => {
    expect(calculatePromotion(context)).toEqual({ applied: true, discount: 6_000, total: 24_000, code: "FIESTA" });
    expect(calculatePromotion(context)).toEqual(calculatePromotion(context));
  });

  it("rechaza promociones vencidas o inactivas", () => {
    expect(calculatePromotion({ ...context, now: "2027-01-01T00:00:00.000Z" })).toMatchObject({ applied: false, reason: "vencida" });
    expect(calculatePromotion({ ...context, promotion: { ...promotion, active: false } })).toMatchObject({ applied: false, reason: "inactiva" });
  });

  it("valida mínimo, alcance y límite de uso", () => {
    expect(calculatePromotion({ ...context, subtotal: 10_000 })).toMatchObject({ applied: false, reason: "mínimo" });
    expect(calculatePromotion({ ...context, items: [{ productId: "mango", category: "granizado", subtotal: 30_000 }] })).toMatchObject({ applied: false, reason: "alcance" });
    expect(calculatePromotion({ ...context, promotion: { ...promotion, usageCount: 10 } })).toMatchObject({ applied: false, reason: "límite" });
  });

  it("aplica descuentos fijos sin superar el subtotal elegible", () => {
    const fixed: Promotion = { ...promotion, discountType: "fixed", discountValue: 50_000, productIds: undefined, maxDiscount: undefined };
    expect(calculatePromotion({ ...context, promotion: fixed, subtotal: 30_000, items: [{ productId: "mango", category: "granizado", subtotal: 30_000 }] })).toMatchObject({ applied: true, discount: 30_000, total: 0 });
  });

  it("no permite que el input de escritura controle el contador de usos", () => {
    const input = promotionInputSchema.parse({ ...promotion, usageCount: 99 });
    expect(input).not.toHaveProperty("usageCount");
  });

  describe("Promociones 2x1 y Happy Hour", () => {
    const promo2x1: Promotion = {
      id: "promo-hh-2x1",
      code: "HAPPY2X1",
      title: "Happy Hour 2x1 Granizados",
      active: true,
      type: "happy_hour",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.999Z",
      discountType: "2x1",
      discountValue: 0,
      minimumSubtotal: 0,
      categoryIds: ["granizado"],
      usageCount: 0,
      isAutomatic: true,
      schedule: {
        daysOfWeek: [5, 6], // Viernes y Sábado
        startTime: "17:00",
        endTime: "20:00",
        timezone: "America/Bogota",
      },
    };

    it("aplica 2x1 dando gratis 1 unidad por cada 2 granizados elegibles", () => {
      // Viernes 7 de agosto de 2026 a las 18:30 hora de Colombia (23:30 UTC)
      const fridayHappyHourUtc = "2026-08-07T23:30:00.000Z";

      // Caso: 2 granizados de $15.000 c/u (subtotal $30.000)
      const result2Items = calculatePromotion({
        promotion: promo2x1,
        subtotal: 30_000,
        now: fridayHappyHourUtc,
        items: [
          { productId: "g-fresa", category: "granizado", subtotal: 30_000, quantity: 2, unitPrice: 15_000 },
        ],
      });
      expect(result2Items).toEqual({
        applied: true,
        discount: 15_000,
        total: 15_000,
        code: "HAPPY2X1",
      });

      // Caso: 3 granizados de $15.000 (subtotal $45.000) -> 1 gratis
      const result3Items = calculatePromotion({
        promotion: promo2x1,
        subtotal: 45_000,
        now: fridayHappyHourUtc,
        items: [
          { productId: "g-fresa", category: "granizado", subtotal: 45_000, quantity: 3, unitPrice: 15_000 },
        ],
      });
      expect(result3Items).toEqual({
        applied: true,
        discount: 15_000,
        total: 30_000,
        code: "HAPPY2X1",
      });

      // Caso: 4 granizados (2 de $15.000 y 2 de $20.000) -> descuenta las 2 unidades más económicas (2x15.000 = 30.000)
      const result4Items = calculatePromotion({
        promotion: promo2x1,
        subtotal: 70_000,
        now: fridayHappyHourUtc,
        items: [
          { productId: "g-fresa", category: "granizado", subtotal: 30_000, quantity: 2, unitPrice: 15_000 },
          { productId: "g-especial", category: "granizado", subtotal: 40_000, quantity: 2, unitPrice: 20_000 },
        ],
      });
      expect(result4Items).toEqual({
        applied: true,
        discount: 30_000,
        total: 40_000,
        code: "HAPPY2X1",
      });
    });

    it("rechaza 2x1 si solo hay 1 unidad en el carrito", () => {
      const fridayHappyHourUtc = "2026-08-07T23:30:00.000Z";
      const result1Item = calculatePromotion({
        promotion: promo2x1,
        subtotal: 15_000,
        now: fridayHappyHourUtc,
        items: [
          { productId: "g-fresa", category: "granizado", subtotal: 15_000, quantity: 1, unitPrice: 15_000 },
        ],
      });
      expect(result1Item).toMatchObject({
        applied: false,
        reason: "mínimo",
      });
    });

    it("valida la franja horaria y rechaza pedidos fuera de horario o de día", () => {
      // Viernes 7 de agosto a las 16:00 Colombia (21:00 UTC) -> antes de las 17:00
      const beforeTime = "2026-08-07T21:00:00.000Z";
      const resBefore = calculatePromotion({
        promotion: promo2x1,
        subtotal: 30_000,
        now: beforeTime,
        items: [{ productId: "g-fresa", category: "granizado", subtotal: 30_000, quantity: 2, unitPrice: 15_000 }],
      });
      expect(resBefore).toMatchObject({ applied: false, reason: "horario" });

      // Viernes 7 de agosto a las 20:30 Colombia (01:30 del 8 de agosto UTC) -> después de las 20:00
      const afterTime = "2026-08-08T01:30:00.000Z";
      const resAfter = calculatePromotion({
        promotion: promo2x1,
        subtotal: 30_000,
        now: afterTime,
        items: [{ productId: "g-fresa", category: "granizado", subtotal: 30_000, quantity: 2, unitPrice: 15_000 }],
      });
      expect(resAfter).toMatchObject({ applied: false, reason: "horario" });

      // Miércoles 5 de agosto a las 18:00 Colombia (23:00 UTC) -> día no programado (solo viernes y sábado)
      const wrongDay = "2026-08-05T23:00:00.000Z";
      const resWrongDay = calculatePromotion({
        promotion: promo2x1,
        subtotal: 30_000,
        now: wrongDay,
        items: [{ productId: "g-fresa", category: "granizado", subtotal: 30_000, quantity: 2, unitPrice: 15_000 }],
      });
      expect(resWrongDay).toMatchObject({ applied: false, reason: "horario" });
    });

    it("extrae correctamente el día y hora en la zona horaria America/Bogota", () => {
      // 2026-08-07T22:30:00Z -> en UTC-5 son las 17:30 de un viernes (5)
      const date = new Date("2026-08-07T22:30:00.000Z");
      const { dayOfWeek, time } = getDayAndTimeInTimezone(date, "America/Bogota");
      expect(dayOfWeek).toBe(5);
      expect(time).toBe("17:30");

      expect(isWithinSchedule(promo2x1.schedule!, "2026-08-07T22:30:00.000Z")).toBe(true);
      expect(isWithinSchedule(promo2x1.schedule!, "2026-08-07T21:30:00.000Z")).toBe(false); // 16:30
    });
  });
});
