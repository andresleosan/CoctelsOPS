import type { BusinessHour } from "@/types/operations";

export const DEFAULT_TENANT_ID = "coctels-ops";
export const DEFAULT_TENANT_SLUG = "coctels-ops";

export type NegocioPlan = "starter" | "pro" | "enterprise";

export type NegocioBranding = {
  logoUrl: string;
  bannerUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  slogan: string;
};

export type NegocioConfiguration = {
  whatsappNumber: string;
  businessHours: BusinessHour[];
  deliveryZones: string[];
  estimatedDeliveryMinutes: number;
  messages: {
    orderReceived: string;
    orderStatus: string;
    unavailable: string;
  };
};

export type Negocio = {
  id: string;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  plan: NegocioPlan;
  branding: NegocioBranding;
  configuracion: NegocioConfiguration;
  ownerUid: string;
  staffUids: string[];
  createdAt: string;
  updatedAt: string;
};

export type NegocioInput = Omit<Negocio, "id" | "createdAt" | "updatedAt">;

export type NegocioPatch = {
  slug?: string;
  name?: string;
  description?: string;
  active?: boolean;
  plan?: NegocioPlan;
  branding?: Partial<NegocioBranding>;
  configuracion?: Partial<NegocioConfiguration>;
  ownerUid?: string;
  staffUids?: string[];
};

export type UsuarioNegocioRole = "owner" | "staff" | "admin";

export type UsuarioNegocio = {
  uid: string;
  negocioId: string;
  role: UsuarioNegocioRole;
  active: boolean;
  assignedAt: string;
};
