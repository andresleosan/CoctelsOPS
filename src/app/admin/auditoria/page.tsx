"use client";

import { RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import type { AuditEntry } from "@/types/operations";

export default function AuditPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/audit", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json()) as { entries?: AuditEntry[]; error?: string };
      if (!response.ok) throw new Error(body.error);
      setEntries(body.entries ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la auditoría.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (entry) =>
        entry.actorUid.toLowerCase().includes(q) ||
        entry.module.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.entityId.toLowerCase().includes(q),
    );
  }, [entries, searchQuery]);

  return (
    <AdminGuard permission="auditoria.read">
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Control</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Auditoría</h1>
            <p className="mt-1 text-sm text-slate-600">
              Trazabilidad de mutaciones por actor y módulo.
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
        </header>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filtrar por actor, módulo, acción o entidad..."
            className="min-h-[44px] border-slate-300 bg-white pl-9 text-slate-900"
            aria-label="Filtrar eventos de auditoría"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
            ) : filteredEntries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Aún no hay eventos de auditoría para mostrar.
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full min-w-[760px] text-left text-sm text-slate-800">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Actor</th>
                      <th className="p-3">Módulo</th>
                      <th className="p-3">Acción</th>
                      <th className="p-3">Entidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                        <td className="p-3 text-xs text-slate-600">
                          {new Date(entry.createdAt).toLocaleString("es-CO")}
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-800">{entry.actorUid}</td>
                        <td className="p-3 capitalize">
                          <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-800">
                            {entry.module}
                          </Badge>
                        </td>
                        <td className="p-3 capitalize font-medium text-slate-900">{entry.action}</td>
                        <td className="p-3 font-mono text-xs text-slate-600">{entry.entityId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
