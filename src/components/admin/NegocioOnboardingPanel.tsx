"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  CopyPlus,
  Layers,
  RotateCcw,
  Shield,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_CATALOG_PLACEHOLDER, MAX_IMAGE_BYTES } from "@/lib/catalog/image-hosts";
import { STARTER_CATALOG_TEMPLATE } from "@/lib/catalog/starter-template";
import type {
  CloneCatalogResult,
  CloneCatalogSource,
  Negocio,
  NegocioOnboardingSummary,
  NegocioStaffMember,
  TenantStaffRolePresetId,
  UsuarioNegocioRole,
} from "@/types/tenant";

type NegocioOnboardingPanelProps = {
  negocio: Negocio;
  stats?: NegocioOnboardingSummary;
  canCloneDefaultTenant: boolean;
  onNegocioUpdated: (negocio: Negocio) => void;
  onStatsRefresh: () => Promise<void> | void;
};

type OnboardingTab = "catalog" | "branding" | "staff";

const VALID_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const ROLE_LABELS: Record<UsuarioNegocioRole, string> = {
  owner: "Propietario",
  admin: "Admin local",
  staff: "Staff barra",
};

const STAFF_PRESET_OPTIONS: Array<{ id: Exclude<TenantStaffRolePresetId, "local-manager">; label: string }> = [
  { id: "barra-pedidos", label: "Barra y pedidos (KDS, estado de órdenes y carta)" },
  { id: "solo-productos", label: "Solo productos (menú, categorías y promos)" },
  { id: "inventario-caja", label: "Inventario y caja (insumos, reportes y clientes)" },
  { id: "solo-lectura", label: "Solo lectura (consulta operativa)" },
];

function formatCop(amount: number): string {
  return `$${amount.toLocaleString("es-CO")} COP`;
}

export function NegocioOnboardingPanel({
  negocio,
  stats,
  canCloneDefaultTenant,
  onNegocioUpdated,
  onStatsRefresh,
}: NegocioOnboardingPanelProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<OnboardingTab>("catalog");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Branding R2 state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(
    negocio.branding.logoUrl || DEFAULT_CATALOG_PLACEHOLDER,
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Catalog clone state
  const [cloningSource, setCloningSource] = useState<CloneCatalogSource | null>(null);

  // Staff state
  const [staff, setStaff] = useState<NegocioStaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [submittingStaff, setSubmittingStaff] = useState(false);
  const [updatingStaffUid, setUpdatingStaffUid] = useState<string | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffDisplayName, setStaffDisplayName] = useState("");
  const [staffRole, setStaffRole] = useState<UsuarioNegocioRole>("staff");
  const [staffPreset, setStaffPreset] =
    useState<Exclude<TenantStaffRolePresetId, "local-manager">>("barra-pedidos");
  const [staffPassword, setStaffPassword] = useState("");

  useEffect(() => {
    setLogoFile(null);
    setLogoPreview(negocio.branding.logoUrl || DEFAULT_CATALOG_PLACEHOLDER);
    setNotice("");
    setError("");
  }, [negocio.id, negocio.branding.logoUrl]);

  useEffect(() => {
    return () => {
      if (logoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  const loadStaff = useCallback(async () => {
    if (!user) return;
    setLoadingStaff(true);
    try {
      const response = await fetch(`/api/admin/negocios/${encodeURIComponent(negocio.id)}/staff`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        staff?: NegocioStaffMember[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo cargar el personal del local.");
      }
      setStaff(body.staff ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "No se pudo cargar el personal del local.",
      );
    } finally {
      setLoadingStaff(false);
    }
  }, [negocio.id, user]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  function handleLogoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;

    if (selected.size > MAX_IMAGE_BYTES) {
      setError("El logo supera el límite de 5 MB.");
      return;
    }
    if (!VALID_IMAGE_TYPES.has(selected.type)) {
      setError("Solo se aceptan logos en formato JPEG, PNG o WebP.");
      return;
    }

    setError("");
    setNotice("");
    setLogoFile(selected);
    setLogoPreview(URL.createObjectURL(selected));
  }

  async function handleUploadLogo() {
    if (!user || !logoFile) return;
    setUploadingLogo(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("logo", logoFile);

      const response = await fetch(`/api/admin/negocios/${encodeURIComponent(negocio.id)}/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        body: formData,
      });
      const body = (await response.json().catch(() => ({}))) as {
        negocio?: Negocio;
        error?: string;
      };
      if (!response.ok || !body.negocio) {
        throw new Error(body.error ?? "No se pudo subir el logo a Cloudflare R2.");
      }

      onNegocioUpdated(body.negocio);
      setLogoFile(null);
      setLogoPreview(body.negocio.branding.logoUrl || DEFAULT_CATALOG_PLACEHOLDER);
      setNotice("Logo subido a Cloudflare R2 y aplicado al branding del local.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "No se pudo subir el logo.",
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleResetLogo() {
    if (!user) return;
    setUploadingLogo(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/negocios/${encodeURIComponent(negocio.id)}/logo`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        negocio?: Negocio;
        error?: string;
      };
      if (!response.ok || !body.negocio) {
        throw new Error(body.error ?? "No se pudo restablecer el logo.");
      }

      onNegocioUpdated(body.negocio);
      setLogoFile(null);
      setLogoPreview(DEFAULT_CATALOG_PLACEHOLDER);
      setNotice("Logo restablecido al placeholder oficial de la marca.");
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "No se pudo restablecer el logo.",
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleCloneCatalog(source: CloneCatalogSource) {
    if (!user) return;
    setCloningSource(source);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/negocios/${encodeURIComponent(negocio.id)}/clone-catalog`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify({ source, overwrite: false }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        result?: CloneCatalogResult;
        error?: string;
      };
      if (!response.ok || !body.result) {
        throw new Error(body.error ?? "No se pudo clonar la carta inicial.");
      }

      const { createdCount, skippedCount } = body.result;
      setNotice(
        `Carta clonada: ${createdCount} producto(s) nuevo(s), ${skippedCount} omitido(s) por ya existir.`,
      );
      await onStatsRefresh();
    } catch (cloneError) {
      setError(
        cloneError instanceof Error ? cloneError.message : "No se pudo clonar la carta inicial.",
      );
    } finally {
      setCloningSource(null);
    }
  }

  async function handleAssignStaff(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !staffEmail.trim()) return;
    setSubmittingStaff(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/negocios/${encodeURIComponent(negocio.id)}/staff`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          email: staffEmail.trim().toLowerCase(),
          displayName: staffDisplayName.trim() || undefined,
          password: staffPassword.trim() || undefined,
          role: staffRole,
          rolePresetId: staffRole === "staff" ? staffPreset : "local-manager",
          active: true,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        member?: NegocioStaffMember;
        createdAuthUser?: boolean;
        error?: string;
      };
      if (!response.ok || !body.member) {
        throw new Error(body.error ?? "No se pudo asignar el usuario al local.");
      }

      setNotice(
        body.createdAuthUser
          ? `Cuenta creada y asignada a ${negocio.name}: ${body.member.email}.`
          : `Usuario asignado a ${negocio.name}: ${body.member.email}.`,
      );
      setStaffEmail("");
      setStaffDisplayName("");
      setStaffPassword("");
      await Promise.all([loadStaff(), Promise.resolve(onStatsRefresh())]);
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "No se pudo asignar el miembro de staff.",
      );
    } finally {
      setSubmittingStaff(false);
    }
  }

  async function handleToggleMember(member: NegocioStaffMember) {
    if (!user) return;
    setUpdatingStaffUid(member.uid);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/negocios/${encodeURIComponent(negocio.id)}/staff`, {
        method: member.active ? "DELETE" : "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(
          member.active
            ? { uid: member.uid }
            : { uid: member.uid, role: member.role, active: true },
        ),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo actualizar la membresía del staff.");
      }

      setNotice(
        member.active
          ? `Se desvinculó a ${member.email || member.uid} de ${negocio.name}.`
          : `Se reactivó a ${member.email || member.uid} en ${negocio.name}.`,
      );
      await Promise.all([loadStaff(), Promise.resolve(onStatsRefresh())]);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "No se pudo actualizar la membresía del staff.",
      );
    } finally {
      setUpdatingStaffUid(null);
    }
  }

  const productCount = stats?.productCount ?? 0;
  const activeStaffCount = staff.filter((member) => member.active).length || stats?.staffCount || 0;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
              <Image
                src={negocio.branding.logoUrl || DEFAULT_CATALOG_PLACEHOLDER}
                alt={`Logo actual de ${negocio.name}`}
                fill
                unoptimized
                sizes="48px"
                className="object-cover"
              />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">
                Onboarding SaaS
              </p>
              <CardTitle className="text-lg font-bold text-slate-950">{negocio.name}</CardTitle>
              <p className="text-xs text-slate-600">
                ID: <code className="font-mono text-slate-800">{negocio.id}</code> ·{" "}
                <code className="font-mono text-slate-800">/m/{negocio.slug}</code>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                productCount > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }
            >
              {productCount} producto{productCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-900">
              {activeStaffCount} staff activo{activeStaffCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Pasos de onboarding">
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "catalog"}
            variant={activeTab === "catalog" ? "default" : "outline"}
            onClick={() => setActiveTab("catalog")}
            className={`min-h-[44px] ${
              activeTab === "catalog"
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            <CopyPlus className="h-4 w-4" /> Carta base
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "branding"}
            variant={activeTab === "branding" ? "default" : "outline"}
            onClick={() => setActiveTab("branding")}
            className={`min-h-[44px] ${
              activeTab === "branding"
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            <Camera className="h-4 w-4" /> Logo y branding R2
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "staff"}
            variant={activeTab === "staff" ? "default" : "outline"}
            onClick={() => setActiveTab("staff")}
            className={`min-h-[44px] ${
              activeTab === "staff"
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            <Users className="h-4 w-4" /> Staff del local
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </p>
        )}

        {activeTab === "catalog" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Layers className="h-4 w-4 text-cyan-700" />
                    Plantilla oficial Coctels OPS ({STARTER_CATALOG_TEMPLATE.length} productos)
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Clona granizados, cócteles y sodas con precios reales en COP sin sobrescribir los
                    productos que el local ya personalizó.
                  </p>
                </div>

                <PermissionGate permission="configuracion.write">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={cloningSource !== null}
                      onClick={() => void handleCloneCatalog("starter")}
                      className="min-h-[44px] bg-pink-600 text-white hover:bg-pink-700"
                    >
                      <Sparkles className="h-4 w-4" />
                      {cloningSource === "starter"
                        ? "Clonando carta..."
                        : "Clonar carta base (6 productos)"}
                    </Button>
                    {canCloneDefaultTenant && negocio.id !== "coctels-ops" && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={cloningSource !== null}
                        onClick={() => void handleCloneCatalog("default-tenant")}
                        className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      >
                        <CopyPlus className="h-4 w-4" />
                        {cloningSource === "default-tenant"
                          ? "Clonando sede principal..."
                          : "Clonar desde local principal"}
                      </Button>
                    )}
                  </div>
                </PermissionGate>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {STARTER_CATALOG_TEMPLATE.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.product.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {item.product.availableSizes
                        ?.map((size) => `${size.name} ${formatCop(size.price)}`)
                        .join(" · ") || formatCop(item.product.price)}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-slate-200 text-[10px] uppercase text-slate-700">
                    {item.product.category}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "branding" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-300 bg-slate-950">
                <Image
                  src={logoPreview}
                  alt={`Vista previa del logo de ${negocio.name}`}
                  fill
                  unoptimized
                  sizes="96px"
                  className="object-cover"
                />
              </div>

              <div className="flex-1 space-y-2">
                <h3 className="text-sm font-bold text-slate-900">Logo del local en Cloudflare R2</h3>
                <p className="text-xs text-slate-600">
                  Se guarda de forma aislada en{" "}
                  <code className="font-mono text-slate-800">
                    tenants/{negocio.id}/branding/logo/...
                  </code>{" "}
                  con validación por magic bytes (JPEG, PNG o WebP hasta 5 MB).
                </p>

                <PermissionGate permission="configuracion.write">
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleLogoSelect}
                      aria-label="Seleccionar archivo de logo"
                      className="sr-only"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                    >
                      <Camera className="h-4 w-4" />
                      {logoFile ? "Cambiar imagen" : "Elegir logo"}
                    </Button>
                    <Button
                      type="button"
                      disabled={!logoFile || uploadingLogo}
                      onClick={() => void handleUploadLogo()}
                      className="min-h-[44px] bg-slate-900 text-white hover:bg-slate-800"
                    >
                      {uploadingLogo ? "Subiendo a R2..." : "Subir logo a R2"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingLogo}
                      onClick={() => void handleResetLogo()}
                      className="min-h-[44px] border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      <RotateCcw className="h-4 w-4" /> Restablecer
                    </Button>
                  </div>
                </PermissionGate>
              </div>
            </div>
          </div>
        )}

        {activeTab === "staff" && (
          <div className="space-y-5">
            <PermissionGate permission="configuracion.write">
              <form
                onSubmit={(event) => void handleAssignStaff(event)}
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-cyan-700" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Vincular operador o administrador local
                  </h3>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tenant-staff-email" className="text-slate-800">
                      Correo electrónico
                    </Label>
                    <Input
                      id="tenant-staff-email"
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="barra.sede@coctelsops.com"
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tenant-staff-name" className="text-slate-800">
                      Nombre (opcional)
                    </Label>
                    <Input
                      id="tenant-staff-name"
                      value={staffDisplayName}
                      onChange={(e) => setStaffDisplayName(e.target.value)}
                      placeholder="Ej. Laura Bartender"
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tenant-staff-role" className="text-slate-800">
                      Rol en el local
                    </Label>
                    <select
                      id="tenant-staff-role"
                      value={staffRole}
                      onChange={(e) => setStaffRole(e.target.value as UsuarioNegocioRole)}
                      className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="staff">Staff de barra / operación</option>
                      <option value="admin">Admin de sede</option>
                      <option value="owner">Propietario de sede</option>
                    </select>
                  </div>

                  {staffRole === "staff" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="tenant-staff-preset" className="text-slate-800">
                        Perfil de permisos
                      </Label>
                      <select
                        id="tenant-staff-preset"
                        value={staffPreset}
                        onChange={(e) =>
                          setStaffPreset(
                            e.target.value as Exclude<TenantStaffRolePresetId, "local-manager">,
                          )
                        }
                        className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      >
                        {STAFF_PRESET_OPTIONS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center rounded-md border border-cyan-200 bg-cyan-50 px-3 text-xs text-cyan-900">
                      <Shield className="mr-2 h-4 w-4 shrink-0" />
                      Recibe perfil operativo completo de sede (sin acceso global cross-tenant).
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tenant-staff-password" className="text-slate-800">
                    Contraseña temporal (solo si el correo aún no tiene cuenta, mín. 8 caracteres)
                  </Label>
                  <Input
                    id="tenant-staff-password"
                    type="password"
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    placeholder="Opcional para cuentas existentes"
                    className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submittingStaff}
                  className="min-h-[44px] w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
                >
                  <UserPlus className="h-4 w-4" />
                  {submittingStaff ? "Asignando..." : "Asignar staff al local"}
                </Button>
              </form>
            </PermissionGate>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Equipo vinculado ({staff.length})
              </h4>

              {loadingStaff ? (
                <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
              ) : staff.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
                  Aún no hay miembros de staff vinculados a este local.
                </p>
              ) : (
                <div className="space-y-2">
                  {staff.map((member) => (
                    <div
                      key={member.uid}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {member.displayName || member.email || member.uid}
                          </p>
                          <Badge
                            variant="outline"
                            className="border-slate-300 bg-slate-50 text-[11px] text-slate-800"
                          >
                            {ROLE_LABELS[member.role]}
                          </Badge>
                          <Badge
                            variant={member.active ? "default" : "secondary"}
                            className={
                              member.active
                                ? "bg-emerald-600 text-white hover:bg-emerald-600"
                                : "bg-slate-200 text-slate-700"
                            }
                          >
                            {member.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-slate-600">
                          {member.email || member.uid}
                          {member.roleIds.length > 0 && ` · Roles: ${member.roleIds.join(", ")}`}
                        </p>
                      </div>

                      <PermissionGate permission="configuracion.write">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updatingStaffUid === member.uid}
                          onClick={() => void handleToggleMember(member)}
                          className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        >
                          {member.active ? (
                            <>
                              <UserMinus className="h-4 w-4 text-red-600" /> Desvincular
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4 text-emerald-700" /> Reactivar
                            </>
                          )}
                        </Button>
                      </PermissionGate>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
