export type AccountType = "customer" | "staff" | "admin";

export type Permission = `${string}.${string}`;

export type Address = {
  id: string;
  alias: string;
  recipientName: string;
  phone: string;
  address: string;
  neighborhood: string;
  city: string;
  notes?: string;
};

export type DateValue = string | number | { seconds: number; nanoseconds: number };

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  telefono: string | null;
  addresses: Address[];
  active: boolean;
  accountType: AccountType;
  roleIds: string[];
  permissions?: Permission[];
  negocioId?: string;
  negocioRole?: "owner" | "staff" | "admin";
  createdAt: DateValue;
  lastLoginAt: DateValue;
};

export type CustomerProfile = Pick<UserProfile, "uid" | "email" | "displayName" | "photoURL" | "telefono" | "addresses">;

export type Role = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  permissions: Permission[];
  createdAt: DateValue;
  updatedAt: DateValue;
};

export type RoleInput = Pick<Role, "name" | "description" | "active" | "permissions">;

export type AuthProfile = {
  email: string;
  displayName: string | null;
  photoURL: string | null;
  emailVerified?: boolean;
};

export type TokenClaims = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  admin?: boolean;
  [key: string]: unknown;
};

export type VerifiedUser = {
  uid: string;
  token: TokenClaims;
  profile: UserProfile;
  permissions: Permission[];
};

export const ALL_ADMIN_PERMISSIONS: readonly Permission[] = [
  "pedidos.read",
  "pedidos.update",
  "productos.read",
  "productos.write",
  "categorias.read",
  "categorias.write",
  "clientes.read",
  "usuarios.read",
  "usuarios.manage",
  "roles.read",
  "roles.write",
  "inventario.read",
  "inventario.write",
  "promociones.read",
  "promociones.write",
  "reportes.read",
  "configuracion.read",
  "configuracion.write",
  "auditoria.read",
  "notificaciones.read",
] as const;

export type AdminAccessDiagnostic = {
  isAdmin: boolean;
  hasCustomClaim: boolean;
  isOwnerEmail: boolean;
  emailVerified: boolean;
  accountType: AccountType;
  active: boolean;
  effectivePermissions: Permission[];
};
