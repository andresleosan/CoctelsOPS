export type PromotionDiscountType = "percent" | "fixed" | "2x1";

export type PromotionType = "standard" | "happy_hour" | "combo";

export type HappyHourSchedule = {
  /**
   * Días de la semana permitidos:
   * 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado
   */
  daysOfWeek: number[];
  /** Hora de inicio en formato HH:mm 24 horas (ej. "17:00") */
  startTime: string;
  /** Hora de finalización en formato HH:mm 24 horas (ej. "20:00") */
  endTime: string;
  /** Zona horaria IANA (por defecto America/Bogota) */
  timezone?: string;
};

export type Promotion = {
  id: string;
  code: string;
  title?: string;
  description?: string;
  active: boolean;
  type?: PromotionType;
  startsAt: string;
  endsAt: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  minimumSubtotal: number;
  productIds?: string[];
  categoryIds?: string[];
  usageLimit?: number;
  usageCount: number;
  maxDiscount?: number;
  isAutomatic?: boolean;
  schedule?: HappyHourSchedule;
  createdAt?: string;
  updatedAt?: string;
};

export type PromotionInput = Omit<Promotion, "id" | "usageCount" | "createdAt" | "updatedAt">;

export type PromotionContextItem = {
  productId: string;
  category: string;
  subtotal: number;
  quantity?: number;
  unitPrice?: number;
};

export type PromotionContext = {
  promotion: Promotion;
  subtotal: number;
  items: PromotionContextItem[];
  now?: string;
};

export type PromotionResult = {
  applied: boolean;
  discount: number;
  total: number;
  code?: string;
  reason?: "inactiva" | "vencida" | "mínimo" | "alcance" | "límite" | "horario" | "inválida";
};

export type ActivePromotionsResponse = {
  activeHappyHours: Promotion[];
  todayScheduled: Promotion[];
  serverTime: string;
};
