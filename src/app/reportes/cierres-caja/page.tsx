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
  const [detalle, setDetalle] = useState<CajaResumen | null>(null);

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
                  <tr key={c.caja.id} onClick={() => setDetalle(c)} className="hover:bg-slate-50 cursor-pointer">
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

      {/* Modal detalle de turno cerrado */}
      {detalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Caja #{detalle.caja.numero_caja}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fmtFechaHora(detalle.caja.fecha_apertura)} → {fmtFechaHora(detalle.caja.fecha_cierre)}
                  {" · "}{fmtDuracion(detalle.caja.fecha_apertura, detalle.caja.fecha_cierre)}
                </p>
              </div>
              <button
                onClick={() => setDetalle(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* Arqueo */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Arqueo</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-slate-500">Monto inicial</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{fmtGs(detalle.caja.monto_apertura)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-slate-500">Efectivo esperado</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{fmtGs(detalle.caja.monto_esperado_efectivo ?? 0)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-slate-500">Efectivo contado</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{fmtGs(detalle.caja.monto_cierre_contado ?? 0)}</p>
                  </div>
                  <div className={`rounded-lg border p-2.5 ${
                    (detalle.caja.diferencia ?? 0) === 0 ? "border-emerald-200 bg-emerald-50" :
                    (detalle.caja.diferencia ?? 0) < 0 ? "border-rose-200 bg-rose-50" :
                    "border-amber-200 bg-amber-50"
                  }`}>
                    <p className="text-slate-500">Diferencia</p>
                    <p className={`mt-0.5 font-semibold tabular-nums ${
                      (detalle.caja.diferencia ?? 0) === 0 ? "text-emerald-700" :
                      (detalle.caja.diferencia ?? 0) < 0 ? "text-rose-700" :
                      "text-amber-700"
                    }`}>
                      {(detalle.caja.diferencia ?? 0) > 0 ? "+" : ""}{fmtGs(detalle.caja.diferencia ?? 0)}
                    </p>
                  </div>
                </div>
                {detalle.caja.observacion_cierre && (
                  <p className="mt-2 text-xs text-slate-500 italic">
                    Observación: {detalle.caja.observacion_cierre}
                  </p>
                )}
              </div>

              {/* Ventas */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Ventas del turno ({detalle.cantidad_ventas})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-slate-500">Total vendido</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{fmtGs(detalle.total_vendido)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-slate-500">Efectivo</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{fmtGs(detalle.total_efectivo)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-slate-500">Transferencia</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{fmtGs(detalle.total_transferencia)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-slate-500">Tarjeta</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{fmtGs(detalle.total_tarjeta)}</p>
                  </div>
                </div>
              </div>

              {/* Movimientos manuales */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Movimientos manuales ({detalle.movimientos.length})
                </h4>
                {detalle.movimientos.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Sin movimientos manuales registrados en este turno.</p>
                ) : (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wide">Hora</th>
                          <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wide">Tipo</th>
                          <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wide">Concepto</th>
                          <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wide hidden sm:table-cell">Medio</th>
                          <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wide">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detalle.movimientos.slice().reverse().map((m) => {
                          const tipoBadge =
                            m.tipo === "ingreso" ? "bg-emerald-100 text-emerald-800" :
                            m.tipo === "egreso"  ? "bg-rose-100 text-rose-800" :
                            m.tipo === "retiro"  ? "bg-amber-100 text-amber-800" :
                                                    "bg-slate-100 text-slate-700";
                          return (
                            <tr key={m.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 whitespace-nowrap text-slate-500 tabular-nums">
                                {new Date(m.created_at).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tipoBadge}`}>
                                  {m.tipo}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                <div className="font-medium">{m.concepto}</div>
                                {m.observacion && <div className="text-[11px] text-slate-500">{m.observacion}</div>}
                              </td>
                              <td className="px-3 py-2 text-slate-600 capitalize hidden sm:table-cell">{m.medio_pago}</td>
                              <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                                m.tipo === "ingreso" ? "text-emerald-700" :
                                m.tipo === "egreso" || m.tipo === "retiro" ? "text-rose-700" :
                                "text-slate-700"
                              }`}>
                                {m.tipo === "egreso" || m.tipo === "retiro" ? "−" : m.tipo === "ingreso" ? "+" : ""}
                                {fmtGs(m.monto)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setDetalle(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
