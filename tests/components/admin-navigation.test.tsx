import { describe, expect, it } from "vitest";

import { getVisibleAdminNavigation } from "@/components/admin/admin-navigation";

describe("admin navigation permissions", () => {
  it("only shows pedidos to staff assigned the pedidos read permission", () => {
    const links = getVisibleAdminNavigation(false, ["pedidos.read"]).map((item) => item.href);

    expect(links).toEqual(["/admin/dashboard", "/admin/pedidos"]);
    expect(links).not.toContain("/admin/productos");
    expect(links).not.toContain("/admin/usuarios");
    expect(links).not.toContain("/admin/roles");
    expect(links).not.toContain("/admin/configuracion");
  });

  it("shows every assigned module to an administrator", () => {
    const links = getVisibleAdminNavigation(true, []).map((item) => item.href);

    expect(links).toEqual([
      "/admin/dashboard",
      "/admin/pedidos",
      "/admin/productos",
      "/admin/categorias",
      "/admin/clientes",
      "/admin/usuarios",
    ]);
    expect(links).not.toContain("/admin/roles");
  });

  it("blocks customers even if a malformed permission reaches the client", () => {
    expect(getVisibleAdminNavigation(false, ["admin.all"])).toEqual([]);
  });
});
