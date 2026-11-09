export type SupplyCategory = "licor" | "pulpa" | "mezclador" | "desechable" | "topping" | "otro";

export type SupplyUnit = "ml" | "l" | "g" | "kg" | "unidad" | "botella";

export type SupplyStatus = "ok" | "bajo" | "critico";

export type SupplyItem = {
  id: string;
  negocioId: string;
  name: string;
  category: SupplyCategory;
  unit: SupplyUnit;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  supplier?: string;
  status: SupplyStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplyItemInput = {
  negocioId?: string;
  name: string;
  category: SupplyCategory;
  unit: SupplyUnit;
  currentStock: number;
  minStock: number;
  costPerUnit?: number;
  supplier?: string;
  notes?: string;
};

export type SupplyMovementType = "entrada" | "merma" | "ajuste" | "consumo";

export type SupplyMovementInput = {
  supplyId: string;
  type: SupplyMovementType;
  quantity: number;
  reason: string;
  actorUid: string;
  actorEmail?: string;
  negocioId?: string;
};

export type SupplyMovement = {
  id: string;
  supplyId: string;
  supplyName: string;
  negocioId: string;
  type: SupplyMovementType;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  reason: string;
  actorUid: string;
  actorEmail?: string;
  createdAt: string;
};

export type SuppliesKpis = {
  total: number;
  criticos: number;
  bajos: number;
  ok: number;
  valorTotalCop: number;
};

export function calculateSupplyStatus(currentStock: number, minStock: number): SupplyStatus {
  if (currentStock <= 0) return "critico";
  if (currentStock <= minStock) return "bajo";
  return "ok";
}
