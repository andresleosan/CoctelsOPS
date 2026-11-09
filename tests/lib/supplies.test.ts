import { describe, expect, it } from "vitest";

import {
  calculateSuppliesKpis,
  calculateSupplyStatus,
  calculateSupplyStock,
  SupplyValidationError,
} from "@/lib/firestore/supplies";
import type { SupplyItem } from "@/types/supplies";

describe("supplies library", () => {
  describe("calculateSupplyStock", () => {
    it("suma correctamente las entradas de inventario", () => {
      expect(calculateSupplyStock(10, { type: "entrada", quantity: 5 })).toBe(15);
      expect(calculateSupplyStock(0, { type: "entrada", quantity: 2.5 })).toBe(2.5);
    });

    it("resta mermas y consumos del stock", () => {
      expect(calculateSupplyStock(10, { type: "merma", quantity: 3 })).toBe(7);
      expect(calculateSupplyStock(10, { type: "consumo", quantity: 4.5 })).toBe(5.5);
    });

    it("fija el nuevo conteo físico con ajuste", () => {
      expect(calculateSupplyStock(10, { type: "ajuste", quantity: 8 })).toBe(8);
      expect(calculateSupplyStock(10, { type: "ajuste", quantity: 0 })).toBe(0);
    });

    it("rechaza mermas o consumos que superan el stock disponible", () => {
      expect(() => calculateSupplyStock(5, { type: "merma", quantity: 6 })).toThrowError(
        SupplyValidationError
      );
      expect(() => calculateSupplyStock(2, { type: "consumo", quantity: 5 })).toThrowError(
        /Stock insuficiente/
      );
    });

    it("rechaza cantidades no válidas o no positivas en entradas", () => {
      expect(() => calculateSupplyStock(10, { type: "entrada", quantity: 0 })).toThrowError(
        /debe ser mayor a 0/
      );
      expect(() => calculateSupplyStock(10, { type: "entrada", quantity: -2 })).toThrowError(
        /debe ser mayor a 0/
      );
    });

    it("rechaza stock negativo en ajustes", () => {
      expect(() => calculateSupplyStock(10, { type: "ajuste", quantity: -1 })).toThrowError(
        /no puede ser negativo/
      );
    });
  });

  describe("calculateSupplyStatus", () => {
    it("devuelve 'critico' cuando el stock es 0 o negativo", () => {
      expect(calculateSupplyStatus(0, 5)).toBe("critico");
      expect(calculateSupplyStatus(-2, 5)).toBe("critico");
    });

    it("devuelve 'bajo' cuando el stock es menor o igual al mínimo", () => {
      expect(calculateSupplyStatus(5, 5)).toBe("bajo");
      expect(calculateSupplyStatus(3, 5)).toBe("bajo");
    });

    it("devuelve 'ok' cuando el stock supera el mínimo", () => {
      expect(calculateSupplyStatus(6, 5)).toBe("ok");
      expect(calculateSupplyStatus(100, 20)).toBe("ok");
    });
  });

  describe("calculateSuppliesKpis", () => {
    it("calcula los totales, categorías de semáforo y valor estimado en COP", () => {
      const mockSupplies: SupplyItem[] = [
        {
          id: "1",
          negocioId: "coctels-ops",
          name: "Ron Medellín 750ml",
          category: "licor",
          unit: "botella",
          currentStock: 0,
          minStock: 2,
          costPerUnit: 35000,
          status: "critico",
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "2",
          negocioId: "coctels-ops",
          name: "Pulpa de Maracuyá",
          category: "pulpa",
          unit: "kg",
          currentStock: 1.5,
          minStock: 3,
          costPerUnit: 12000,
          status: "bajo",
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "3",
          negocioId: "coctels-ops",
          name: "Vasos 16 oz",
          category: "desechable",
          unit: "unidad",
          currentStock: 100,
          minStock: 20,
          costPerUnit: 300,
          status: "ok",
          createdAt: "",
          updatedAt: "",
        },
      ];

      const kpis = calculateSuppliesKpis(mockSupplies);

      expect(kpis.total).toBe(3);
      expect(kpis.criticos).toBe(1);
      expect(kpis.bajos).toBe(1);
      expect(kpis.ok).toBe(1);
      // 0*35000 + 1.5*12000 + 100*300 = 0 + 18000 + 30000 = 48000
      expect(kpis.valorTotalCop).toBe(48000);
    });
  });
});
