import type { ServiceType } from "@/types/orders";

export type BarDisplayStage = "preparing" | "ready";
export type BarDisplayServiceFilter = "all" | "local";

export type BarDisplayTicket = {
  orderId: string;
  turnCode: string;
  displayName: string;
  serviceType: ServiceType;
  tableNumber?: string;
  itemsCount: number;
  stage: BarDisplayStage;
  status: "confirmado" | "preparando" | "en_camino";
  createdAt: string;
  updatedAt: string;
};

export type BarDisplaySnapshot = {
  negocioId: string;
  slug?: string;
  storeName: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  emergencyPauseActive: boolean;
  emergencyPauseReason?: string;
  preparing: BarDisplayTicket[];
  ready: BarDisplayTicket[];
  updatedAt: string;
};
