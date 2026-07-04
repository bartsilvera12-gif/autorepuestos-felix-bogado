"use client";

/**
 * Reporte de CIERRES DE CAJA: cada turno (caja) cerrado con arqueo,
 * diferencia, quién abrió/cerró, ventas del turno.
 * Reutiliza /api/caja/historial (ya devuelve CajaResumen[]).
 */

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { CajaResumen } from "@/lib/caja/types";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

function fmtGs(v: number) { return `Gs. ${Math.round(v).toLocaleString("es-PY")}`; }
function fmtFechaHora(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function fmtDuracion(desde: string, hasta: string | null) {
  if (!hasta) return "—";
  try {
    const d = (new Date(hasta).getTime() - new Date(desde).getTime()) / 1000;
    const h = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    return `${h}h ${m}m`;
  } catch { return "—"; }
}

export default function CierresCajaPage() {
  const [cajas, setCajas] = useState<CajaResumen[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession("/api/caja/historial?limit=200", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setCajas((j.data?.cajas ?? []) as CajaResumen[]); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, []);

  // Sólo cerradas para el reporte contable (las abiertas están activas todavía).
  const cerradas = cajas.filter((c) => c.caja.estado === "cerrada");

  // Totales agregados
  const totales = cerradas.reduce((acc, c) => ({
    vendido: acc.vendido + c.total_vendido,
    efectivo: acc.efectivo + c.total_efectivo,
    tarjeta: acc.tarjeta + c.total_tarjeta,
    transferencia: acc.transferencia + c.total_transferencia,
    diferenciaAbs: acc.diferenciaAbs + Math.abs(c.caja.diferencia ?? 0),
    diferenciaTotal: acc.diferenciaTotal + (c.caja.diferencia ?? 0),
  }), { vendido: 0, efectivo: 0, tarjeta: 0, transferencia: 0, diferenciaAbs: 0, diferenciaTotal: 0 });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Zentra · Reportes"
        title="Cierres de caja"
        description="Historial de turnos cerrados con arqueo, diferencias y ventas por método."
        backHref="/reportes"
        backLabel="Reportes"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard compact label="Turnos cerrados" value={String(cerradas.length)} accent />
        <StatCard compact label="Total vendido" value={fmtGs(totales.vendido)} />
        <StatCard compact label="Diferencias (Σ absoluto)" value={fmtGs(totales.diferenciaAbs)} hint="faltantes + sobrantes" />
        <StatCard compact
          label="Balance neto"
          value={fmtGs(totales.diferenciaTotal)}
          hint={totales.diferenciaTotal < 0 ? "faltante neto" : totales.diferenciaTotal > 0 ? "sobrante neto" : "en cero"}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 sm:px-4 py-2.5 text-left">Caja</th>
                <th className="px-3 sm:px-4 py-2.5 text-left">Apertura</th>
                <th className="px-3 sm:px-4 py-2.5 text-left hidden md:table-cell">Cierre</th>
                <th className="px-3 sm:px-4 py-2.5 text-left hidden lg:table-cell">Duración</th>
                <th className="px-3 sm:px-4 py-2.5 text-left hidden lg:table-cell">Abierta / Cerrada por</th>
                <th className="px-3 sm:px-4 py-2.5 text-right hidden sm:table-cell">Vendido</th>
                <th className="px-3 sm:px-4 py-2.5 text-right">Esperado</th>
                <th className="px-3 sm:px-4 py-2.5 text-right">Contado</th>
                <th className="px-3 sm:px-4 py-2.5 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando ? (
                <tr><td colSpan={9} className="py-8 text-center text-sm text-slate-400">Cargando…</td></tr>
              ) : cerradas.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-sm text-slate-400">Todavía no hay turnos cerrados.</td></tr>
              ) : cerradas.map((c) => {
                const dif = c.caja.diferencia ?? 0;
                const esperado = c.caja.monto_esperado_efectivo ?? 0;
                const contado = c.caja.monto_cierre_contado ?? 0;
                return (
                  <tr key={c.caja.id} className="hover:bg-slate-50">
                    <td className="px-3 sm:px-4 py-2.5 font-mono text-xs text-slate-700">#{c.caja.numero_caja}</td>
                    <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">{fmtFechaHora(c.caja.fecha_apertura)}</td>
                    <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-600 tabular-nums whitespace-nowrap hidden md:table-cell">{fmtFechaHora(c.caja.fecha_cierre)}</td>
                    <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-500 hidden lg:table-cell">{fmtDuracion(c.caja.fecha_apertura, c.caja.fecha_cierre)}</td>
                    <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-600 hidden lg:table-cell">
                      <div>{c.abierta_por_nombre ?? "—"}</div>
                      <div className="text-slate-400">{c.cerrada_por_nombre ?? "—"}</div>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums text-slate-700 hidden sm:table-cell">
                      {fmtGs(c.total_vendido)}
                      <div className="text-[10px] text-slate-400">{c.cantidad_ventas} venta(s)</div>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtGs(esperado)}</td>
                    <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtGs(contado)}</td>
                    <td className={`px-3 sm:px-4 py-2.5 text-right tabular-nums font-semibold ${
                      dif === 0 ? "text-emerald-700" : dif < 0 ? "text-rose-700" : "text-amber-700"
                    }`}>
                      <span className="inline-flex items-center gap-1">
                        {dif === 0
                          ? <CheckCircle2 className="h-3 w-3" />
                          : <AlertTriangle className="h-3 w-3" />}
                        {dif === 0 ? "0" : (dif > 0 ? "+" : "") + Math.round(dif).toLocaleString("es-PY")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
