import { describe, expect, it } from "vitest";

import {
  findMatchingRolePreset,
  getGroupPermissions,
  getModuleAccessLevel,
  ROLE_PERMISSION_GROUPS,
  ROLE_PRESETS,
  setGroupPermissions,
  setModuleAccessLevel,
  summarizeRoleModules,
} from "@/lib/auth/role-presets";
import { ALL_ADMIN_PERMISSIONS } from "@/types/auth";

describe("role-presets", () => {
  it("cubre exactamente los 20 permisos de ALL_ADMIN_PERMISSIONS sin duplicados ni faltantes", () => {
    const groupedPermissions = ROLE_PERMISSION_GROUPS.flatMap((group) =>
      getGroupPermissions(group),
    );
    expect(groupedPermissions).toHaveLength(ALL_ADMIN_PERMISSIONS.length);
    expect(new Set(groupedPermissions).size).toBe(ALL_ADMIN_PERMISSIONS.length);
    expect(new Set(groupedPermissions)).toEqual(new Set(ALL_ADMIN_PERMISSIONS));
  });

  it("resuelve y actualiza el nivel de acceso por módulo (none, read, write)", () => {
    const productosModule = ROLE_PERMISSION_GROUPS[1]!.modules[0]!;
    const reportesModule = ROLE_PERMISSION_GROUPS[2]!.modules[1]!;

    expect(getModuleAccessLevel([], productosModule)).toBe("none");
    expect(getModuleAccessLevel(["productos.read"], productosModule)).toBe("read");
    expect(getModuleAccessLevel(["productos.read", "productos.write"], productosModule)).toBe(
      "write",
    );

    const withWrite = setModuleAccessLevel(["pedidos.read"], productosModule, "write");
    expect(withWrite).toEqual(["pedidos.read", "productos.read", "productos.write"]);

    const downgradedToRead = setModuleAccessLevel(withWrite, productosModule, "read");
    expect(downgradedToRead).toEqual(["pedidos.read", "productos.read"]);

    const cleared = setModuleAccessLevel(downgradedToRead, productosModule, "none");
    expect(cleared).toEqual(["pedidos.read"]);

    // Módulo de solo lectura
    expect(setModuleAccessLevel([], reportesModule, "write")).toEqual(["reportes.read"]);
    expect(getModuleAccessLevel(["reportes.read"], reportesModule)).toBe("read");
  });

  it("activa y limpia todos los permisos de un grupo", () => {
    const pedidosGroup = ROLE_PERMISSION_GROUPS[0]!;
    const enabled = setGroupPermissions(["productos.read"], pedidosGroup, true);
    expect(enabled).toEqual([
      "pedidos.read",
      "pedidos.update",
      "productos.read",
      "notificaciones.read",
    ]);

    const disabled = setGroupPermissions(enabled, pedidosGroup, false);
    expect(disabled).toEqual(["productos.read"]);
  });

  it("detecta plantillas coincidentes independientemente del orden y resume módulos activos", () => {
    const soloProductos = ROLE_PRESETS.find((preset) => preset.id === "solo-productos")!;
    const reversed = [...soloProductos.permissions].reverse();

    expect(findMatchingRolePreset(reversed)?.id).toBe("solo-productos");
    expect(findMatchingRolePreset(["pedidos.read"])).toBeUndefined();

    const summary = summarizeRoleModules(["pedidos.read", "pedidos.update", "reportes.read"]);
    expect(summary).toEqual([
      { id: "pedidos", label: "Pedidos", level: "write", levelLabel: "Gestionar" },
      { id: "reportes", label: "Reportes", level: "read", levelLabel: "Ver" },
    ]);
  });
});
