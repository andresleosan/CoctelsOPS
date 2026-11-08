import { describe, expect, it } from "vitest";

import {
  buildWhatsAppChatUrl,
  buildWhatsAppReactivationMessage,
  calculateDaysSince,
  calculateCrmMetrics,
  classifyCustomerSegment,
  cleanPhoneNumber,
  consolidateCrmCustomer,
  type CrmCustomer,
} from "@/lib/customers/crm";
import type { LoyaltyOrderSnapshot } from "@/lib/firestore/loyalty";
import type { UserProfile } from "@/types/auth";

describe("CRM & Customer Segmentation Core Logic (crm.ts)", () => {
  describe("cleanPhoneNumber", () => {
    it("antepone el código de país '57' para celulares colombianos de 10 dígitos", () => {
      expect(cleanPhoneNumber("3001234567")).toBe("573001234567");
      expect(cleanPhoneNumber("315 987 6543")).toBe("573159876543");
      expect(cleanPhoneNumber("+57 (311) 555-0199")).toBe("573115550199");
    });

    it("mantiene intactos números que ya incluyen el prefijo 573", () => {
      expect(cleanPhoneNumber("573001234567")).toBe("573001234567");
    });

    it("retorna cadena vacía ante entradas nulas, vacías o sin dígitos", () => {
      expect(cleanPhoneNumber("")).toBe("");
      expect(cleanPhoneNumber(null)).toBe("");
      expect(cleanPhoneNumber(undefined)).toBe("");
      expect(cleanPhoneNumber("---")).toBe("");
    });
  });

  describe("classifyCustomerSegment", () => {
    it("clasifica como 'inactivo' si lleva más de 15 días sin compras y tiene saldo de puntos", () => {
      const segment = classifyCustomerSegment({
        deliveredOrdersCount: 3,
        totalSpent: 45000,
        daysSinceLastOrder: 16,
        availablePoints: 45,
        lifetimePoints: 45,
      });
      expect(segment).toBe("inactivo");
    });

    it("clasifica como 'vip' a clientes con gasto >= $100.000 COP", () => {
      const segment = classifyCustomerSegment({
        deliveredOrdersCount: 4,
        totalSpent: 120000,
        daysSinceLastOrder: 3,
        availablePoints: 120,
        lifetimePoints: 120,
      });
      expect(segment).toBe("vip");
    });

    it("clasifica como 'vip' a clientes con tier Oro (>= 150 puntos históricos)", () => {
      const segment = classifyCustomerSegment({
        deliveredOrdersCount: 4,
        totalSpent: 80000,
        daysSinceLastOrder: 5,
        availablePoints: 10,
        lifetimePoints: 160,
      });
      expect(segment).toBe("vip");
    });

    it("clasifica como 'vip' a clientes con 5 o más pedidos entregados", () => {
      const segment = classifyCustomerSegment({
        deliveredOrdersCount: 5,
        totalSpent: 65000,
        daysSinceLastOrder: 4,
        availablePoints: 15,
        lifetimePoints: 65,
      });
      expect(segment).toBe("vip");
    });

    it("clasifica como 'frecuente' a clientes con 2 a 4 pedidos y activos recientemente", () => {
      const segment = classifyCustomerSegment({
        deliveredOrdersCount: 2,
        totalSpent: 35000,
        daysSinceLastOrder: 4,
        availablePoints: 35,
        lifetimePoints: 35,
      });
      expect(segment).toBe("frecuente");
    });

    it("clasifica como 'nuevo' a clientes con 0 o 1 pedido", () => {
      const segment0 = classifyCustomerSegment({
        deliveredOrdersCount: 0,
        totalSpent: 0,
        daysSinceLastOrder: null,
        availablePoints: 0,
        lifetimePoints: 0,
      });
      expect(segment0).toBe("nuevo");

      const segment1 = classifyCustomerSegment({
        deliveredOrdersCount: 1,
        totalSpent: 15000,
        daysSinceLastOrder: 2,
        availablePoints: 15,
        lifetimePoints: 15,
      });
      expect(segment1).toBe("nuevo");
    });
  });

  describe("calculateDaysSince", () => {
    it("calcula con precisión la diferencia en días entre fechas", () => {
      const ref = new Date("2026-05-20T12:00:00.000Z");
      const past = "2026-05-10T12:00:00.000Z";
      expect(calculateDaysSince(past, ref)).toBe(10);
    });

    it("retorna null si la fecha es nula o inválida", () => {
      expect(calculateDaysSince(null)).toBeNull();
      expect(calculateDaysSince("fecha-invalida")).toBeNull();
    });
  });

  describe("buildWhatsAppReactivationMessage & buildWhatsAppChatUrl", () => {
    const mockCustomer = {
      displayName: "Camila Restrepo",
      availablePoints: 50,
      segment: "inactivo" as const,
    };

    it("construye el mensaje de re-activación con puntos y nombre del cliente", () => {
      const msg = buildWhatsAppReactivationMessage(mockCustomer, "reactivacion_puntos");
      expect(msg).toContain("¡Hola Camila!");
      expect(msg).toContain("50 Puntos Coctels");
      expect(msg).toContain("Coctels OPS");
    });

    it("construye el mensaje de trato VIP adecuadamente", () => {
      const msg = buildWhatsAppReactivationMessage(mockCustomer, "saludo_vip");
      expect(msg).toContain("¡Hola Camila!");
      expect(msg).toContain("VIP");
      expect(msg).toContain("50 Puntos Coctels");
    });

    it("usa 'amig@' cuando no hay nombre registrado", () => {
      const msg = buildWhatsAppReactivationMessage({
        displayName: null,
        availablePoints: 20,
        segment: "nuevo",
      });
      expect(msg).toContain("¡Hola amig@!");
    });

    it("genera la URL wa.me correctamente codificada", () => {
      const url = buildWhatsAppChatUrl("3001234567", "¡Hola Mundo!");
      expect(url).toBe("https://wa.me/573001234567?text=%C2%A1Hola%20Mundo!");
    });

    it("retorna null si el teléfono no es válido", () => {
      expect(buildWhatsAppChatUrl("", "mensaje")).toBeNull();
      expect(buildWhatsAppChatUrl(null, "mensaje")).toBeNull();
      expect(buildWhatsAppChatUrl("123", "mensaje")).toBeNull();
    });
  });

  describe("consolidateCrmCustomer", () => {
    const mockProfile: Pick<
      UserProfile,
      "uid" | "email" | "displayName" | "telefono" | "photoURL" | "addresses"
    > = {
      uid: "user-123",
      email: "cliente@test.com",
      displayName: "Juan Perez",
      telefono: "3009876543",
      photoURL: null,
      addresses: [
        {
          id: "addr-1",
          alias: "Casa",
          recipientName: "Juan",
          phone: "3009876543",
          address: "Calle 10 # 20-30",
          neighborhood: "El Poblado",
          city: "Medellín",
        },
      ],
    };

    const orders: LoyaltyOrderSnapshot[] = [
      {
        id: "order-1",
        total: 25000,
        status: "entregado",
        createdAt: "2026-05-01T10:00:00.000Z",
      },
      {
        id: "order-2",
        total: 35000,
        status: "entregado",
        createdAt: "2026-05-15T12:00:00.000Z",
      },
    ];

    it("calcula gasto total, ticket promedio, días desde último pedido y saldo de fidelización", () => {
      const refDate = new Date("2026-05-20T12:00:00.000Z");
      const crm = consolidateCrmCustomer(mockProfile, orders, refDate);

      expect(crm.uid).toBe("user-123");
      expect(crm.totalSpent).toBe(60000);
      expect(crm.deliveredOrdersCount).toBe(2);
      expect(crm.averageTicket).toBe(30000); // 60000 / 2
      expect(crm.availablePoints).toBe(60); // 25 + 35 pts
      expect(crm.daysSinceLastOrder).toBe(5); // May 15 to May 20
      expect(crm.segment).toBe("frecuente");
    });
  });

  describe("calculateCrmMetrics", () => {
    const customers: CrmCustomer[] = [
      {
        uid: "c1",
        email: "c1@test.com",
        displayName: "VIP Cliente",
        telefono: "3001111111",
        photoURL: null,
        addressesCount: 1,
        addresses: [],
        deliveredOrdersCount: 5,
        totalOrdersCount: 5,
        totalSpent: 150000,
        averageTicket: 30000,
        lastOrderAt: "2026-05-10T00:00:00.000Z",
        daysSinceLastOrder: 2,
        availablePoints: 150,
        lifetimePoints: 150,
        tier: "oro",
        segment: "vip",
        segmentLabel: "VIP Neón",
      },
      {
        uid: "c2",
        email: "c2@test.com",
        displayName: "Inactivo Cliente",
        telefono: "3002222222",
        photoURL: null,
        addressesCount: 1,
        addresses: [],
        deliveredOrdersCount: 2,
        totalOrdersCount: 2,
        totalSpent: 50000,
        averageTicket: 25000,
        lastOrderAt: "2026-04-01T00:00:00.000Z",
        daysSinceLastOrder: 25,
        availablePoints: 50,
        lifetimePoints: 50,
        tier: "bronce",
        segment: "inactivo",
        segmentLabel: "Inactivo con Puntos",
      },
      {
        uid: "c3",
        email: "c3@test.com",
        displayName: "Nuevo Cliente",
        telefono: null,
        photoURL: null,
        addressesCount: 0,
        addresses: [],
        deliveredOrdersCount: 1,
        totalOrdersCount: 1,
        totalSpent: 20000,
        averageTicket: 20000,
        lastOrderAt: "2026-05-11T00:00:00.000Z",
        daysSinceLastOrder: 1,
        availablePoints: 20,
        lifetimePoints: 20,
        tier: "bronce",
        segment: "nuevo",
        segmentLabel: "Nuevo",
      },
    ];

    it("consolida correctamente los KPIs globales de clientes", () => {
      const metrics = calculateCrmMetrics(customers);
      expect(metrics.totalCustomers).toBe(3);
      expect(metrics.vipCount).toBe(1);
      expect(metrics.inactivoCount).toBe(1);
      expect(metrics.nuevoCount).toBe(1);
      expect(metrics.frecuenteCount).toBe(0);
      expect(metrics.totalSpentAllCustomers).toBe(220000);
      expect(metrics.totalAvailablePoints).toBe(220);
      expect(metrics.globalAverageTicket).toBe(Math.round(220000 / (5 + 2 + 1))); // 27500
    });
  });
});
