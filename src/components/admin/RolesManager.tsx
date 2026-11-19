"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { Check, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  findMatchingRolePreset,
  getGroupPermissions,
  getModuleAccessLevel,
  ROLE_PERMISSION_GROUPS,
  ROLE_PRESETS,
  setGroupPermissions,
  setModuleAccessLevel,
  summarizeRoleModules,
  type ModuleAccessLevel,
  type RolePermissionGroup,
  type RolePermissionModule,
  type RolePreset,
} from "@/lib/auth/role-presets";
import { ALL_ADMIN_PERMISSIONS, type Role, type RoleInput } from "@/types/auth";

const blank: RoleInput = { name: "", description: "", active: true, permissions: [] };

const PRESET_NAMES = new Set(ROLE_PRESETS.map((preset) => preset.label));
const PRESET_DESCRIPTIONS = new Set(ROLE_PRESETS.map((preset) => preset.description));

export type RolesManagerProps = {
  onRolesChanged?: (roles: Role[]) => void;
};

export function RolesManager({ onRolesChanged }: RolesManagerProps) {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState<RoleInput>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formCardRef = useRef<HTMLDivElement | null>(null);

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
      const nextRoles = body.roles ?? [];
      setRoles(nextRoles);
      onRolesChanged?.(nextRoles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los roles.");
    } finally {
      setLoading(false);
    }
  }

  const authKey = user?.uid ?? (user ? "authenticated" : null);

  useEffect(() => {
    if (authKey) {
      void load();
    }
  }, [authKey]);

  function edit(role: Role) {
    setEditing(role.id);
    setForm({
      name: role.name,
      description: role.description,
      active: role.active,
      permissions: role.permissions,
    });
    formCardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function applyPreset(preset: RolePreset) {
    setForm((current) => {
      const trimmedName = current.name.trim();
      const trimmedDescription = current.description.trim();
      const canAutofillName = !editing && (trimmedName === "" || PRESET_NAMES.has(trimmedName));
      const canAutofillDescription =
        !editing && (trimmedDescription === "" || PRESET_DESCRIPTIONS.has(trimmedDescription));

      return {
        ...current,
        name: canAutofillName ? preset.label : current.name,
        description: canAutofillDescription ? preset.description : current.description,
        permissions: [...preset.permissions],
      };
    });
  }

  function handleModuleLevelChange(mod: RolePermissionModule, level: ModuleAccessLevel) {
    setForm((current) => ({
      ...current,
      permissions: setModuleAccessLevel(current.permissions, mod, level),
    }));
  }

  function handleToggleGroup(group: RolePermissionGroup, enabled: boolean) {
    setForm((current) => ({
      ...current,
      permissions: setGroupPermissions(current.permissions, group, enabled),
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
    const nextRoles = roles.filter((item) => item.id !== role.id);
    setRoles(nextRoles);
    onRolesChanged?.(nextRoles);
  }

  const activePreset = findMatchingRolePreset(form.permissions);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Roles y permisos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Elige una plantilla rápida o ajusta en horizontal qué puede ver o guardar cada perfil.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar roles
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* Bloque superior: Roles configurados en grid horizontal */}
      <div className="space-y-3">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="h-36 animate-pulse rounded-xl bg-white" />
            <div className="h-36 animate-pulse rounded-xl bg-white" />
          </div>
        ) : roles.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="p-8 text-center text-sm text-slate-600">
              No hay roles configurados. Usa las plantillas de abajo para crear el primero en segundos.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => {
              const matchedPreset = findMatchingRolePreset(role.permissions);
              const moduleSummaries = summarizeRoleModules(role.permissions);
              const visibleModules = moduleSummaries.slice(0, 4);
              const extraModulesCount = Math.max(0, moduleSummaries.length - visibleModules.length);

              return (
                <Card key={role.id} className="border-slate-200 bg-white shadow-sm">
                  <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{role.name}</h3>
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
                          {matchedPreset && (
                            <Badge
                              variant="outline"
                              className="border-cyan-200 bg-cyan-50 text-cyan-800"
                            >
                              {matchedPreset.label}
                            </Badge>
                          )}
                        </div>
                        <PermissionGate permission="roles.write">
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => edit(role)}
                              aria-label={`Editar ${role.name}`}
                              className="min-h-[40px] min-w-[40px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={() => void remove(role)}
                              aria-label={`Eliminar ${role.name}`}
                              className="min-h-[40px] min-w-[40px]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </PermissionGate>
                      </div>

                      <p className="text-sm text-slate-600">
                        {role.description || "Sin descripción"}
                      </p>

                      {visibleModules.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {visibleModules.map((mod) => (
                            <span
                              key={mod.id}
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                mod.level === "write"
                                  ? "bg-slate-900 text-white"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {mod.label}: {mod.levelLabel}
                            </span>
                          ))}
                          {extraModulesCount > 0 && (
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              +{extraModulesCount} más
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="border-t border-slate-100 pt-2.5 text-xs font-medium text-slate-500">
                      {role.permissions.length} de {ALL_ADMIN_PERMISSIONS.length} permisos
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Bloque inferior: Formulario horizontal de ancho completo */}
      <PermissionGate permission="roles.write">
        <div ref={formCardRef}>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-950">
                    {editing ? "Editar rol" : "Crear nuevo rol"}
                  </h3>
                  {!editing && <Plus className="h-4 w-4 text-cyan-700" />}
                </div>
                <span className="text-xs font-medium text-slate-500">
                  Configura quién solo consulta y quién puede guardar cambios
                </span>
              </div>

              <form onSubmit={save} className="space-y-6">
                {/* Fila 1: Nombre, descripción y estado activo en horizontal */}
                <div className="grid gap-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="role-name" className="text-slate-800">
                      Nombre
                    </Label>
                    <Input
                      id="role-name"
                      placeholder="Ej. Solo productos o Barra"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="role-description" className="text-slate-800">
                      Descripción
                    </Label>
                    <Input
                      id="role-description"
                      placeholder="Qué hace esta persona en el local"
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                    />
                  </div>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => setForm({ ...form, active: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Rol activo
                  </label>
                </div>

                {/* Fila 2: Plantillas rápidas de 1 clic en horizontal */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-700" aria-hidden="true" />
                    <span className="text-sm font-semibold text-slate-900">
                      Nivel rápido (1 clic)
                    </span>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                    {ROLE_PRESETS.map((preset) => {
                      const isSelected = activePreset?.id === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => applyPreset(preset)}
                          className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                            isSelected
                              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                              : "border-slate-200 bg-slate-50 text-slate-900 hover:border-cyan-400 hover:bg-cyan-50/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-bold">{preset.label}</span>
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            )}
                          </div>
                          <p
                            className={`mt-1 text-[11px] leading-snug ${
                              isSelected ? "text-slate-200" : "text-slate-600"
                            }`}
                          >
                            {preset.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fila 3: Permisos por área en 4 columnas horizontales */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        Permisos por función ({form.permissions.length} de{" "}
                        {ALL_ADMIN_PERMISSIONS.length})
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          activePreset
                            ? "border-cyan-300 bg-cyan-50 text-cyan-900"
                            : "border-slate-300 bg-slate-50 text-slate-700"
                        }
                      >
                        {activePreset ? activePreset.label : "Personalizado"}
                      </Badge>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            permissions: [...ALL_ADMIN_PERMISSIONS],
                          }))
                        }
                        className="min-h-[36px] rounded-md px-2.5 font-semibold text-cyan-700 hover:bg-cyan-50 hover:text-cyan-900"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, permissions: [] }))}
                        className="min-h-[36px] rounded-md px-2.5 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {ROLE_PERMISSION_GROUPS.map((group) => {
                      const groupPermissions = getGroupPermissions(group);
                      const allGroupEnabled = groupPermissions.every((permission) =>
                        form.permissions.includes(permission),
                      );

                      return (
                        <section
                          key={group.id}
                          aria-label={group.title}
                          className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"
                        >
                          <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                              {group.title}
                            </h4>
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(group, !allGroupEnabled)}
                              className="rounded px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-100/60 hover:text-cyan-900"
                            >
                              {allGroupEnabled ? "Nada" : "Todo"}
                            </button>
                          </div>

                          <div className="space-y-2.5">
                            {group.modules.map((mod) => {
                              const currentLevel = getModuleAccessLevel(form.permissions, mod);
                              const writeButtonLabel = mod.writeLabel ?? "Editar";

                              return (
                                <div
                                  key={mod.id}
                                  className="rounded-lg border border-slate-200 bg-white p-2.5"
                                >
                                  <div className="mb-2">
                                    <p className="text-xs font-semibold text-slate-900">
                                      {mod.label}
                                    </p>
                                    <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                                      {mod.description}
                                    </p>
                                  </div>

                                  <div
                                    role="group"
                                    aria-label={`Permiso de ${mod.label}`}
                                    className="inline-flex w-full rounded-lg bg-slate-100 p-0.5"
                                  >
                                    <button
                                      type="button"
                                      aria-pressed={currentLevel === "none"}
                                      onClick={() => handleModuleLevelChange(mod, "none")}
                                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                        currentLevel === "none"
                                          ? "bg-white text-slate-900 shadow-sm"
                                          : "text-slate-600 hover:text-slate-900"
                                      }`}
                                    >
                                      No
                                    </button>
                                    <button
                                      type="button"
                                      aria-pressed={currentLevel === "read"}
                                      onClick={() => handleModuleLevelChange(mod, "read")}
                                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                        currentLevel === "read"
                                          ? "bg-slate-900 text-white shadow-sm"
                                          : "text-slate-600 hover:text-slate-900"
                                      }`}
                                    >
                                      Ver
                                    </button>
                                    {mod.writePermission && (
                                      <button
                                        type="button"
                                        aria-pressed={currentLevel === "write"}
                                        onClick={() => handleModuleLevelChange(mod, "write")}
                                        className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                          currentLevel === "write"
                                            ? "bg-cyan-700 text-white shadow-sm"
                                            : "text-slate-600 hover:text-slate-900"
                                        }`}
                                      >
                                        {writeButtonLabel}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>

                {/* Barra inferior de acciones */}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
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
        </div>
      </PermissionGate>
    </div>
  );
}
