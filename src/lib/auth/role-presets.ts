import { ALL_ADMIN_PERMISSIONS, type Permission } from "@/types/auth";

export type ModuleAccessLevel = "none" | "read" | "write";

export type RolePermissionModule = {
  id: string;
  label: string;
  description: string;
  readPermission: Permission;
  writePermission?: Permission;
  writeLabel?: string;
};

export type RolePermissionGroup = {
  id: string;
  title: string;
  modules: RolePermissionModule[];
};

export type RolePreset = {
  id: string;
  label: string;
  description: string;
  permissions: Permission[];
};

export type RoleModuleSummary = {
  id: string;
  label: string;
  level: Exclude<ModuleAccessLevel, "none">;
  levelLabel: string;
};

export const ROLE_PERMISSION_GROUPS: RolePermissionGroup[] = [
  {
    id: "pedidos-barra",
    title: "Pedidos y Barra",
    modules: [
      {
        id: "pedidos",
        label: "Pedidos",
        description: "Consultar pedidos y cambiar estados en barra",
        readPermission: "pedidos.read",
        writePermission: "pedidos.update",
        writeLabel: "Gestionar",
      },
      {
        id: "notificaciones",
        label: "Alertas",
        description: "Ver notificaciones de pedidos y stock",
        readPermission: "notificaciones.read",
      },
    ],
  },
  {
    id: "menu-promos",
    title: "Menú y Promociones",
    modules: [
      {
        id: "productos",
        label: "Productos",
        description: "Ver la carta y crear, editar o pausar productos",
        readPermission: "productos.read",
        writePermission: "productos.write",
        writeLabel: "Guardar",
      },
      {
        id: "categorias",
        label: "Categorías",
        description: "Ver y organizar las secciones del menú",
        readPermission: "categorias.read",
        writePermission: "categorias.write",
        writeLabel: "Editar",
      },
      {
        id: "promociones",
        label: "Promociones",
        description: "Ver y configurar combos o descuentos",
        readPermission: "promociones.read",
        writePermission: "promociones.write",
        writeLabel: "Editar",
      },
    ],
  },
  {
    id: "inventario-reportes",
    title: "Inventario y Reportes",
    modules: [
      {
        id: "inventario",
        label: "Inventario",
        description: "Consultar insumos y registrar ajustes de stock",
        readPermission: "inventario.read",
        writePermission: "inventario.write",
        writeLabel: "Ajustar",
      },
      {
        id: "reportes",
        label: "Reportes",
        description: "Consultar ventas, cierres de caja y métricas",
        readPermission: "reportes.read",
      },
      {
        id: "clientes",
        label: "Clientes",
        description: "Ver historial y datos de clientes",
        readPermission: "clientes.read",
      },
    ],
  },
  {
    id: "seguridad-tienda",
    title: "Seguridad y Tienda",
    modules: [
      {
        id: "usuarios",
        label: "Usuarios",
        description: "Ver cuentas y administrar equipo o admins",
        readPermission: "usuarios.read",
        writePermission: "usuarios.manage",
        writeLabel: "Administrar",
      },
      {
        id: "roles",
        label: "Roles",
        description: "Ver, crear o modificar perfiles de permisos",
        readPermission: "roles.read",
        writePermission: "roles.write",
        writeLabel: "Editar",
      },
      {
        id: "configuracion",
        label: "Configuración",
        description: "Ajustar datos del local, pagos y WhatsApp",
        readPermission: "configuracion.read",
        writePermission: "configuracion.write",
        writeLabel: "Editar",
      },
      {
        id: "auditoria",
        label: "Auditoría",
        description: "Revisar historial de cambios del sistema",
        readPermission: "auditoria.read",
      },
    ],
  },
];

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: "admin-total",
    label: "Administrador total",
    description: "Acceso completo a pedidos, carta, inventario, reportes y configuración.",
    permissions: [...ALL_ADMIN_PERMISSIONS],
  },
  {
    id: "solo-lectura",
    label: "Solo lectura",
    description: "Puede consultar toda la operación sin modificar ni eliminar datos.",
    permissions: [
      "pedidos.read",
      "notificaciones.read",
      "productos.read",
      "categorias.read",
      "promociones.read",
      "inventario.read",
      "reportes.read",
      "clientes.read",
      "usuarios.read",
      "roles.read",
      "configuracion.read",
      "auditoria.read",
    ],
  },
  {
    id: "solo-productos",
    label: "Solo productos",
    description: "Crea, edita y guarda productos, categorías y promociones del menú.",
    permissions: [
      "productos.read",
      "productos.write",
      "categorias.read",
      "categorias.write",
      "promociones.read",
      "promociones.write",
    ],
  },
  {
    id: "barra-pedidos",
    label: "Barra y pedidos",
    description: "Recibe pedidos, actualiza estados en barra y consulta el menú.",
    permissions: ["pedidos.read", "pedidos.update", "notificaciones.read", "productos.read"],
  },
  {
    id: "inventario-caja",
    label: "Inventario y caja",
    description: "Controla stock e insumos, revisa clientes y consulta reportes.",
    permissions: [
      "inventario.read",
      "inventario.write",
      "productos.read",
      "reportes.read",
      "clientes.read",
    ],
  },
];

function normalizePermissions(permissions: readonly Permission[]): Permission[] {
  const unique = new Set(permissions);
  const ordered = ALL_ADMIN_PERMISSIONS.filter((permission) => unique.has(permission));
  const extras = [...unique].filter(
    (permission) => !ALL_ADMIN_PERMISSIONS.includes(permission),
  );
  return [...ordered, ...extras];
}

export function getGroupPermissions(group: RolePermissionGroup): Permission[] {
  return group.modules.flatMap((mod) =>
    mod.writePermission ? [mod.readPermission, mod.writePermission] : [mod.readPermission],
  );
}

export function getModuleAccessLevel(
  permissions: readonly Permission[],
  mod: RolePermissionModule,
): ModuleAccessLevel {
  if (mod.writePermission && permissions.includes(mod.writePermission)) {
    return "write";
  }
  if (permissions.includes(mod.readPermission)) {
    return "read";
  }
  return "none";
}

export function setModuleAccessLevel(
  permissions: readonly Permission[],
  mod: RolePermissionModule,
  level: ModuleAccessLevel,
): Permission[] {
  const toRemove = new Set<Permission>(
    mod.writePermission ? [mod.readPermission, mod.writePermission] : [mod.readPermission],
  );
  const remaining = permissions.filter((permission) => !toRemove.has(permission));

  if (level === "none") {
    return normalizePermissions(remaining);
  }
  if (level === "read" || !mod.writePermission) {
    return normalizePermissions([...remaining, mod.readPermission]);
  }
  return normalizePermissions([...remaining, mod.readPermission, mod.writePermission]);
}

export function setGroupPermissions(
  permissions: readonly Permission[],
  group: RolePermissionGroup,
  enabled: boolean,
): Permission[] {
  const groupPermissions = new Set<Permission>(getGroupPermissions(group));
  const remaining = permissions.filter((permission) => !groupPermissions.has(permission));
  if (!enabled) {
    return normalizePermissions(remaining);
  }
  return normalizePermissions([...remaining, ...groupPermissions]);
}

export function findMatchingRolePreset(
  permissions: readonly Permission[],
): RolePreset | undefined {
  const currentSet = new Set(permissions);
  return ROLE_PRESETS.find((preset) => {
    const presetSet = new Set(preset.permissions);
    if (currentSet.size !== presetSet.size) return false;
    for (const permission of presetSet) {
      if (!currentSet.has(permission)) return false;
    }
    return true;
  });
}

export function summarizeRoleModules(
  permissions: readonly Permission[],
): RoleModuleSummary[] {
  const summaries: RoleModuleSummary[] = [];
  for (const group of ROLE_PERMISSION_GROUPS) {
    for (const mod of group.modules) {
      const level = getModuleAccessLevel(permissions, mod);
      if (level === "none") continue;
      summaries.push({
        id: mod.id,
        label: mod.label,
        level,
        levelLabel: level === "write" ? (mod.writeLabel ?? "Editar") : "Ver",
      });
    }
  }
  return summaries;
}
