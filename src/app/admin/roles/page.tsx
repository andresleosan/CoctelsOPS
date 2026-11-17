"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { ALL_ADMIN_PERMISSIONS, type Permission, type Role, type RoleInput } from "@/types/auth";

const PERMISSION_GROUPS: Array<{ title: string; permissions: Permission[] }> = [
  {
    title: "Pedidos y Barra",
    permissions: ["pedidos.read", "pedidos.update", "notificaciones.read"],
  },
  {
    title: "Catálogo y Promociones",
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
    title: "Inventario y Reportes",
    permissions: ["inventario.read", "inventario.write", "reportes.read", "clientes.read"],
  },
  {
    title: "Seguridad y Configuración",
    permissions: [
      "usuarios.read",
      "usuarios.manage",
      "roles.read",
      "roles.write",
      "configuracion.read",
      "configuracion.write",
      "auditoria.read",
    ],
  },
];

const blank: RoleInput = { name: "", description: "", active: true, permissions: [] };

export default function RolesPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState<RoleInput>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/roles", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        roles?: Role[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los roles.");
      setRoles(body.roles ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los roles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [user]);

  function edit(role: Role) {
    setEditing(role.id);
    setForm({
      name: role.name,
      description: role.description,
      active: role.active,
      permissions: role.permissions,
    });
  }

  function toggle(permission: Permission) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError("");
    setSaving(true);
    try {
      const response = await fetch(
        editing ? `/api/admin/roles/${encodeURIComponent(editing)}` : "/api/admin/roles",
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify(form),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar el rol.");
      setForm(blank);
      setEditing(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el rol.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: Role) {
    if (!user || !window.confirm(`¿Eliminar el rol ${role.name}?`)) return;
    const response = await fetch(`/api/admin/roles/${encodeURIComponent(role.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "No se pudo eliminar el rol.");
      return;
    }
    setRoles((items) => items.filter((item) => item.id !== role.id));
  }

  return (
    <AdminGuard permission="roles.read">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Acceso</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Roles y permisos</h1>
            <p className="mt-1 text-sm text-slate-600">
              Define perfiles operativos por estación (bartender, cajero, catálogo o supervisor).
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-3">
            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-white" />
            ) : roles.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white">
                <CardContent className="p-10 text-center text-sm text-slate-600">
                  No hay roles configurados.
                </CardContent>
              </Card>
            ) : (
              roles.map((role) => (
                <Card key={role.id} className="border-slate-200 bg-white shadow-sm">
                  <CardContent className="flex items-start justify-between gap-3 p-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-900">{role.name}</h2>
                        <Badge
                          variant={role.active ? "default" : "secondary"}
                          className={
                            role.active
                              ? "bg-emerald-600 text-white hover:bg-emerald-600"
                              : "bg-slate-200 text-slate-700"
                          }
                        >
                          {role.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {role.description || "Sin descripción"}
                      </p>
                      <p className="mt-2 text-xs font-medium text-slate-500">
                        {role.permissions.length} de {ALL_ADMIN_PERMISSIONS.length} permisos
                      </p>
                    </div>
                    <PermissionGate permission="roles.write">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => edit(role)}
                          aria-label={`Editar ${role.name}`}
                          className="min-h-[44px] min-w-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => void remove(role)}
                          aria-label={`Eliminar ${role.name}`}
                          className="min-h-[44px] min-w-[44px]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </PermissionGate>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <PermissionGate permission="roles.write">
            <Card className="h-fit border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900">
                    {editing ? "Editar rol" : "Nuevo rol"}
                  </h2>
                  {!editing && <Plus className="h-4 w-4 text-cyan-700" />}
                </div>
                <form onSubmit={save} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="role-name" className="text-slate-800">
                      Nombre
                    </Label>
                    <Input
                      id="role-name"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role-description" className="text-slate-800">
                      Descripción
                    </Label>
                    <Input
                      id="role-description"
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                    />
                  </div>
                  <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => setForm({ ...form, active: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />{" "}
                    Rol activo
                  </label>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">
                        Permisos ({form.permissions.length})
                      </span>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              permissions: [...ALL_ADMIN_PERMISSIONS],
                            }))
                          }
                          className="font-semibold text-cyan-700 hover:text-cyan-900"
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, permissions: [] }))}
                          className="font-semibold text-slate-500 hover:text-slate-800"
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>

                    {PERMISSION_GROUPS.map((group) => (
                      <fieldset
                        key={group.title}
                        className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-600">
                          {group.title}
                        </legend>
                        {group.permissions.map((permission) => (
                          <label
                            key={permission}
                            className="flex min-h-[32px] cursor-pointer items-center gap-2 text-xs text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(permission)}
                              onChange={() => toggle(permission)}
                              className="h-4 w-4 rounded border-slate-300"
                            />{" "}
                            <span className="font-mono">{permission}</span>
                          </label>
                        ))}
                      </fieldset>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={saving} className="min-h-[44px]">
                      {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear rol"}
                    </Button>
                    {editing && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          setForm(blank);
                        }}
                        className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </PermissionGate>
        </div>
      </div>
    </AdminGuard>
  );
}
