"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import {
  Crown,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminAccessCard } from "@/components/admin/AdminAccessCard";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { RolesManager } from "@/components/admin/RolesManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { esEmailAdmin } from "@/lib/auth-claims";
import type { AccountType, Role, UserProfile } from "@/types/auth";

type AccountFilter = "all" | AccountType;
type UsersPageTab = "usuarios" | "roles";

export default function UsersPage() {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<UsersPageTab>("usuarios");
  const [serverAdmin, setServerAdmin] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promotingUid, setPromotingUid] = useState<string | null>(null);
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: "", displayName: "", password: "" });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "roles") {
      setActiveTab("roles");
    }
  }, []);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        users?: UserProfile[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los usuarios.");
      setUsers(body.users ?? []);
      const rolesResponse = await fetch("/api/admin/roles", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (rolesResponse.ok) {
        const rolesBody = (await rolesResponse.json()) as { roles?: Role[] };
        setRoles(rolesBody.roles ?? []);
      } else {
        setRoles([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los usuarios.");
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

  const rolesById = useMemo(
    () => new Map(roles.map((role) => [role.id, role.name])),
    [roles],
  );

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((account) => {
      if (accountFilter !== "all" && account.accountType !== accountFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (account.displayName ?? "").toLowerCase().includes(q) ||
        account.email.toLowerCase().includes(q) ||
        account.uid.toLowerCase().includes(q)
      );
    });
  }, [accountFilter, searchQuery, users]);

  const hasAdminControl = Boolean(isAdmin || serverAdmin);

  async function toggleActive(account: UserProfile) {
    if (!user || !window.confirm(`¿${account.active ? "Desactivar" : "Activar"} a ${account.displayName ?? account.email}?`)) return;
    setError("");
    setNotice("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(account.uid)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({ active: !account.active }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      user?: UserProfile;
      error?: string;
    };
    if (!response.ok || !body.user) {
      setError(body.error ?? "No se pudo actualizar el usuario.");
      return;
    }
    setUsers((items) =>
      items.map((item) => (item.uid === account.uid ? (body.user as UserProfile) : item)),
    );
  }

  async function toggleAdminRole(account: UserProfile) {
    if (!user) return;
    const makeAdmin = account.accountType !== "admin";
    const confirmed = window.confirm(
      makeAdmin
        ? `¿Convertir a ${account.displayName ?? account.email} en Administrador con acceso total?`
        : `¿Quitar acceso de Administrador a ${account.displayName ?? account.email} y pasarlo a Staff?`,
    );
    if (!confirmed) return;

    setPromotingUid(account.uid);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(account.uid)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ accountType: makeAdmin ? "admin" : "staff" }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        user?: UserProfile;
        error?: string;
      };
      if (!response.ok || !body.user) {
        throw new Error(body.error ?? "No se pudo cambiar el nivel administrativo.");
      }
      setUsers((items) =>
        items.map((item) => (item.uid === account.uid ? (body.user as UserProfile) : item)),
      );
      setNotice(
        makeAdmin
          ? `${account.email} ahora es Administrador. Pídele cerrar y volver a iniciar sesión para activar sus permisos.`
          : `${account.email} pasó a Staff.`,
      );
    } catch (promoteError) {
      setError(
        promoteError instanceof Error
          ? promoteError.message
          : "No se pudo cambiar el nivel administrativo.",
      );
    } finally {
      setPromotingUid(null);
    }
  }

  async function handleAddAdministrator(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setCreatingAdmin(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          email: adminForm.email.trim(),
          displayName: adminForm.displayName.trim() || undefined,
          password: adminForm.password.trim() || undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        user?: UserProfile;
        createdAuthUser?: boolean;
        error?: string;
      };
      if (!response.ok || !body.user) {
        throw new Error(body.error ?? "No se pudo agregar al administrador.");
      }

      const nextUser = body.user;
      setUsers((prev) => {
        const exists = prev.some((item) => item.uid === nextUser.uid);
        return exists
          ? prev.map((item) => (item.uid === nextUser.uid ? nextUser : item))
          : [nextUser, ...prev];
      });
      setAdminForm({ email: "", displayName: "", password: "" });
      setShowAddAdminForm(false);
      setNotice(
        body.createdAuthUser
          ? `Administrador ${nextUser.email} creado y activado correctamente.`
          : `Administrador ${nextUser.email} activado. Si ya tenía sesión iniciada, pídele volver a ingresar.`,
      );
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "No se pudo agregar al administrador.",
      );
    } finally {
      setCreatingAdmin(false);
    }
  }

  function startRoleEdit(account: UserProfile) {
    setEditingUid(account.uid);
    setSelectedRoleIds(account.roleIds);
  }

  async function saveRoles(uid: string) {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ roleIds: selectedRoleIds }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        user?: UserProfile;
        error?: string;
      };
      if (!response.ok || !body.user) throw new Error(body.error ?? "No se pudieron guardar los roles.");
      setUsers((items) =>
        items.map((item) => (item.uid === uid ? (body.user as UserProfile) : item)),
      );
      setEditingUid(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudieron guardar los roles.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminGuard permission="usuarios.read">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Acceso</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Usuarios y Roles</h1>
            <p className="mt-1 text-sm text-slate-600">
              Administra cuentas de equipo, nuevos administradores, roles y permisos del local.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasAdminControl && activeTab === "usuarios" && (
              <Button
                type="button"
                onClick={() => {
                  setShowAddAdminForm((prev) => !prev);
                  setError("");
                }}
                className="min-h-[44px] bg-cyan-600 font-semibold text-white hover:bg-cyan-700"
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Agregar administrador
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </Button>
          </div>
        </div>

        {/* Selector de Pestañas: Usuarios vs Roles y Permisos */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist" aria-label="Gestión de acceso">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "usuarios"}
            onClick={() => setActiveTab("usuarios")}
            className={`flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeTab === "usuarios"
                ? "border border-slate-800 bg-slate-900 text-cyan-300 shadow-sm"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
          >
            <Users className="h-4 w-4" />
            Usuarios y Administradores
          </button>

          <PermissionGate permission="roles.read">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "roles"}
              onClick={() => setActiveTab("roles")}
              className={`flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                activeTab === "roles"
                  ? "border border-slate-800 bg-slate-900 text-cyan-300 shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <KeyRound className="h-4 w-4" />
              Roles y Permisos
            </button>
          </PermissionGate>
        </div>

        {activeTab === "roles" ? (
          <PermissionGate permission="roles.read">
            <RolesManager onRolesChanged={setRoles} />
          </PermissionGate>
        ) : (
          <div className="space-y-6">
            <AdminAccessCard
              compact
              onSessionValidated={(result) => {
                if (result.ok && result.data.adminAccess?.isAdmin) {
                  setServerAdmin(true);
                }
              }}
            />

            {hasAdminControl && showAddAdminForm && (
              <Card className="border-cyan-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-950">
                        Agregar o promover administrador
                      </h2>
                      <p className="text-xs text-slate-600">
                        Si el correo ya existe se promoverá a Administrador; si es nuevo, ingresa una contraseña temporal.
                      </p>
                    </div>
                  </div>
                  <form onSubmit={(e) => void handleAddAdministrator(e)} className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-admin-email" className="text-slate-800">
                        Correo electrónico *
                      </Label>
                      <Input
                        id="new-admin-email"
                        type="email"
                        required
                        placeholder="socio@coctelsops.com"
                        value={adminForm.email}
                        onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                        className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-admin-name" className="text-slate-800">
                        Nombre completo (opcional)
                      </Label>
                      <Input
                        id="new-admin-name"
                        type="text"
                        placeholder="Ej: Laura Gómez"
                        value={adminForm.displayName}
                        onChange={(e) => setAdminForm({ ...adminForm, displayName: e.target.value })}
                        className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-admin-password" className="text-slate-800">
                        Contraseña inicial (opcional si ya tiene cuenta)
                      </Label>
                      <Input
                        id="new-admin-password"
                        type="password"
                        minLength={8}
                        placeholder="Mínimo 8 caracteres"
                        value={adminForm.password}
                        onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                        className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:col-span-3">
                      <Button
                        type="submit"
                        disabled={creatingAdmin}
                        className="min-h-[44px] bg-slate-900 text-white hover:bg-slate-800"
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        {creatingAdmin ? "Guardando..." : "Guardar administrador"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowAddAdminForm(false)}
                        className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {notice && (
              <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
                {notice}
              </p>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar por nombre, correo o UID..."
                  className="min-h-[44px] border-slate-300 bg-white pl-9 text-slate-900"
                  aria-label="Buscar usuarios"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-1">
                {(
                  [
                    { value: "all", label: `Todos (${users.length})` },
                    {
                      value: "admin",
                      label: `Admin (${users.filter((u) => u.accountType === "admin").length})`,
                    },
                    {
                      value: "staff",
                      label: `Staff (${users.filter((u) => u.accountType === "staff").length})`,
                    },
                    {
                      value: "customer",
                      label: `Clientes (${users.filter((u) => u.accountType === "customer").length})`,
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setAccountFilter(item.value)}
                    className={`min-h-[36px] rounded-md px-3 text-xs font-semibold transition-colors ${
                      accountFilter === item.value
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-white" />
            ) : filteredUsers.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white">
                <CardContent className="p-10 text-center text-sm text-slate-600">
                  No encontramos usuarios con los filtros actuales.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredUsers.map((account) => {
                  const isOwner = esEmailAdmin(account.email);
                  const isSelf = user?.uid === account.uid;

                  return (
                    <Card key={account.uid} className="border-slate-200 bg-white shadow-sm">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded-full p-3 ${
                                account.accountType === "admin"
                                  ? "bg-cyan-100 text-cyan-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {account.accountType === "admin" ? (
                                <ShieldCheck className="h-5 w-5" />
                              ) : (
                                <UserCog className="h-5 w-5" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-900">
                                  {account.displayName ?? "Sin nombre"}
                                </p>
                                {isOwner && (
                                  <Badge className="gap-1 bg-cyan-700 text-white hover:bg-cyan-700">
                                    <Crown className="h-3 w-3" /> Propietario
                                  </Badge>
                                )}
                                {isSelf && (
                                  <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-900">
                                    Tu sesión
                                  </Badge>
                                )}
                              </div>
                              <p className="truncate text-sm text-slate-600">
                                {account.email} ·{" "}
                                <span className="capitalize font-medium">{account.accountType}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={account.active ? "default" : "secondary"}
                              className={
                                account.active
                                  ? "bg-emerald-600 text-white hover:bg-emerald-600"
                                  : "bg-slate-200 text-slate-700"
                              }
                            >
                              {account.active ? "Activo" : "Inactivo"}
                            </Badge>
                            {hasAdminControl && !isSelf && !isOwner && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={promotingUid === account.uid}
                                onClick={() => void toggleAdminRole(account)}
                                className={`min-h-[40px] ${
                                  account.accountType === "admin"
                                    ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                    : "border-cyan-300 bg-cyan-50 text-cyan-900 hover:bg-cyan-100"
                                }`}
                              >
                                {promotingUid === account.uid
                                  ? "Actualizando..."
                                  : account.accountType === "admin"
                                    ? "Quitar Admin"
                                    : "Hacer Admin"}
                              </Button>
                            )}
                            <PermissionGate permission="usuarios.manage">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isSelf}
                                title={
                                  isSelf
                                    ? "No puedes desactivar tu propia cuenta administrativa"
                                    : undefined
                                }
                                onClick={() => void toggleActive(account)}
                                className="min-h-[40px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                              >
                                {account.active ? "Desactivar" : "Activar"}
                              </Button>
                            </PermissionGate>
                          </div>
                        </div>

                        <PermissionGate permission="usuarios.manage">
                          <PermissionGate permission="roles.read">
                            <div className="border-t border-slate-100 pt-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                  Roles asignados
                                </p>
                                {editingUid !== account.uid ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isSelf}
                                    title={
                                      isSelf
                                        ? "No puedes modificar tus propios roles administrativos"
                                        : undefined
                                    }
                                    onClick={() => startRoleEdit(account)}
                                    className="min-h-[38px] text-cyan-700 hover:bg-cyan-50 hover:text-cyan-900"
                                  >
                                    Editar roles
                                  </Button>
                                ) : (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      disabled={saving}
                                      onClick={() => void saveRoles(account.uid)}
                                      className="min-h-[38px]"
                                    >
                                      <Save className="h-4 w-4" />{" "}
                                      {saving ? "Guardando..." : "Guardar roles"}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingUid(null)}
                                      className="min-h-[38px] text-slate-700 hover:bg-slate-100"
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {editingUid === account.uid ? (
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  {roles.map((role) => (
                                    <label
                                      key={role.id}
                                      className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedRoleIds.includes(role.id)}
                                        onChange={() =>
                                          setSelectedRoleIds((current) =>
                                            current.includes(role.id)
                                              ? current.filter((id) => id !== role.id)
                                              : [...current, role.id],
                                          )
                                        }
                                        className="h-4 w-4 rounded border-slate-300"
                                      />{" "}
                                      {role.name}
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {account.roleIds.length ? (
                                    account.roleIds.map((roleId) => (
                                      <Badge
                                        key={roleId}
                                        variant="outline"
                                        className="border-slate-300 bg-slate-50 text-slate-700"
                                      >
                                        {rolesById.get(roleId) ?? roleId}
                                      </Badge>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate-500">Sin roles asignados</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </PermissionGate>
                        </PermissionGate>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
