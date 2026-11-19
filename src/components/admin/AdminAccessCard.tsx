"use client";

import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminSession,
  invalidateAdminSessionCache,
  type AdminSessionResult,
} from "@/components/admin/admin-session-cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { esEmailAdmin } from "@/lib/auth-claims";

type AdminAccessCardProps = {
  compact?: boolean;
  onSessionValidated?: (result: AdminSessionResult) => void;
};

export function AdminAccessCard({
  compact = false,
  onSessionValidated,
}: AdminAccessCardProps) {
  const { user, isAdmin, isVerified, refreshClaims } = useAuth();
  const [sessionResult, setSessionResult] = useState<AdminSessionResult | null>(null);
  const [checking, setChecking] = useState(false);

  const checkAccess = useCallback(
    async (force = false) => {
      if (!user) return;
      setChecking(true);
      try {
        if (force) {
          await refreshClaims();
          invalidateAdminSessionCache(user.uid);
        }
        const result = await fetchAdminSession(user, { force });
        setSessionResult(result);
        onSessionValidated?.(result);
      } finally {
        setChecking(false);
      }
    },
    [onSessionValidated, refreshClaims, user],
  );

  useEffect(() => {
    void checkAccess(false);
  }, [checkAccess]);

  if (!user) return null;

  const diagnostic = sessionResult?.data.adminAccess;
  const serverUser = sessionResult?.data.user;
  const isOwnerEmail = diagnostic?.isOwnerEmail ?? esEmailAdmin(user.email);
  const emailVerified = diagnostic?.emailVerified ?? isVerified;
  const serverConfirmedAdmin = Boolean(diagnostic?.isAdmin);
  const hasServerError = sessionResult !== null && !sessionResult.ok;
  const roleLabel =
    serverConfirmedAdmin ||
    isAdmin ||
    diagnostic?.accountType === "admin" ||
    serverUser?.accountType === "admin"
      ? "Administrador"
      : "Equipo (Staff)";

  return (
    <Card
      data-testid="admin-access-card"
      className="border-slate-200 bg-white shadow-sm"
    >
      <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              hasServerError
                ? "bg-amber-100 text-amber-800"
                : serverConfirmedAdmin || isAdmin
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-cyan-100 text-cyan-800"
            }`}
          >
            {hasServerError ? (
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-bold text-slate-900">
                Validación de Permisos y Sesión
              </CardTitle>
              {sessionResult === null || checking ? (
                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                  Verificando servidor...
                </Badge>
              ) : sessionResult.ok ? (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  {serverConfirmedAdmin
                    ? isOwnerEmail
                      ? "Propietario Admin Activo"
                      : "Admin Activo"
                    : "Staff Activo"}
                </Badge>
              ) : (
                <Badge variant="destructive">
                  Error de validación ({sessionResult.status || "Red"})
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Cuenta conectada:{" "}
              <span className="font-semibold text-slate-900">
                {user.email ?? user.uid}
              </span>
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void checkAccess(true)}
          disabled={checking}
          className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
          Revalidar permisos
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {hasServerError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="space-y-1">
              <p className="font-semibold">
                El servidor rechazó o no pudo validar `/api/auth/session` (HTTP{" "}
                {sessionResult.status || "sin respuesta"}).
              </p>
              <p className="text-amber-900">
                {sessionResult.data.error ??
                  "Verifica que el backend esté conectado al mismo proyecto Firebase que el navegador."}
              </p>
            </div>
          </div>
        )}

        <div className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3"}`}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Correo verificado
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <CheckCircle2
                className={`h-4 w-4 ${emailVerified ? "text-emerald-600" : "text-amber-600"}`}
              />
              {emailVerified ? "Verificado" : "Pendiente"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Rol en la tienda
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {roleLabel}{" "}
              <span className="text-xs font-medium text-slate-500">
                ({diagnostic?.active === false ? "inactivo" : "activo"})
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Nivel de acceso
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <KeyRound
                className={`h-4 w-4 ${
                  serverConfirmedAdmin || isOwnerEmail ? "text-emerald-600" : "text-cyan-700"
                }`}
              />
              {sessionResult === null
                ? "Consultando..."
                : serverConfirmedAdmin || isOwnerEmail
                  ? "Acceso total"
                  : "Acceso por áreas"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
