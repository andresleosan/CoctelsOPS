"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { Crown, RefreshCw, Save, Search, ShieldCheck, UserCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminAccessCard } from "@/components/admin/AdminAccessCard";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { esEmailAdmin } from "@/lib/auth-claims";
import type { AccountType, Role, UserProfile } from "@/types/auth";

type AccountFilter = "all" | AccountType;

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    void load();
  }, [user]);

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

  async function toggleActive(account: UserProfile) {
    if (!user || !window.confirm(`¿${account.active ? "Desactivar" : "Activar"} a ${account.displayName ?? account.email}?`)) return;
    setError("");
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
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Usuarios y Permisos</h1>
            <p className="mt-1 text-sm text-slate-600">
              Verifica tu sesión administrativa y gestiona cuentas de staff y clientes.
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

        <AdminAccessCard compact />

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

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}

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
                                    {roleId}
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
    </AdminGuard>
  );
}
