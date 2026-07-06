"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import MesSelector from "@/components/reportes/MesSelector";
import { getVentasReporte } from "@/lib/reportes/storage";
import { mesActualAsuncion } from "@/lib/fechas/asuncion-bounds";
import type { VentasReporte, TipoPrecioReporte } from "@/lib/reportes/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}
const TP: { key: TipoPrecioReporte; label: string; badge: string }[] = [
  { key: "minorista", label: "Minorista", badge: "bg-slate-100 text-slate-600" },
  { key: "mayorista", label: "Mayorista", badge: "bg-indigo-100 text-indigo-700" },
  { key: "distribuidor", label: "Distribuidor", badge: "bg-emerald-100 text-emerald-700" },
  { key: "costo", label: "Al costo", badge: "bg-amber-100 text-amber-700" },
];

/** Semana ISO (lunes-domingo). Devuelve key año-Wnn, label corto y rango. */
function isoWeekKey(iso: string): { key: string; label: string; start: string; end: string } {
  const d = new Date(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  const year = target.getUTCFullYear();
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayNum));
  const sunday = new Date(monday.getTime()); sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) => `${String(dt.getUTCDate()).padStart(2,"0")}/${String(dt.getUTCMonth()+1).padStart(2,"0")}`;
  return { key: `${year}-W${String(week).padStart(2,"0")}`, label: `Sem ${week}`, start: fmt(monday), end: fmt(sunday) };
}

export default function VentasReportePage() {
  const [mes, setMes] = useState(mesActualAsuncion());
  const [data, setData] = useState<VentasReporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<"detalle" | "semana">("detalle");

  // Agrupación por semana ISO — client-side sobre data.ventas + data.items.
  // Además del resumen (ventas, total), incluye el desglose de productos
  // vendidos en esa semana para el detalle expandible.
  type SemanaRow = {
    key: string; label: string; start: string; end: string;
    ventas: number; total: number;
    productos: Array<{ nombre: string; cantidad: number; total: number }>;
  };
  const porSemana = useMemo<SemanaRow[]>(() => {
    if (!data?.ventas || data.ventas.length === 0) return [];
    // Resumen por semana desde ventas (cantidad + total).
    const map = new Map<string, {
      key: string; label: string; start: string; end: string;
      ventas: number; total: number; prodMap: Map<string, { cantidad: number; total: number }>;
    }>();
    for (const v of data.ventas) {
      const w = isoWeekKey(v.fecha);
      let ex = map.get(w.key);
      if (!ex) { ex = { ...w, ventas: 0, total: 0, prodMap: new Map() }; map.set(w.key, ex); }
      ex.ventas += 1;
      ex.total += Number(v.total) || 0;
    }
    // Desglose por producto desde items.
    for (const it of (data.items ?? [])) {
      const w = isoWeekKey(it.fecha);
      const ex = map.get(w.key);
      if (!ex) continue;
      const nombre = it.producto_nombre;
      const prev = ex.prodMap.get(nombre) ?? { cantidad: 0, total: 0 };
      prev.cantidad += Number(it.cantidad) || 0;
      prev.total += Number(it.total_linea) || 0;
      ex.prodMap.set(nombre, prev);
    }
    return [...map.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((s) => ({
        key: s.key, label: s.label, start: s.start, end: s.end,
        ventas: s.ventas, total: s.total,
        productos: [...s.prodMap.entries()]
          .map(([nombre, v]) => ({ nombre, ...v }))
          .sort((a, b) => b.total - a.total),
      }));
  }, [data]);

  const [semanaAbierta, setSemanaAbierta] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getVentasReporte(mes).then((d) => { if (!cancel) { setData(d); setCargando(false); } });
    return () => { cancel = true; };
  }, [mes]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Zentra · Reportes"
        title="Ventas"
        description="Facturación y operaciones comerciales del período"
        backHref="/reportes"
        backLabel="Reportes"
        actions={
          <div className="flex items-center gap-3">
            <MesSelector mes={mes} onChange={setMes} />
            <ExportExcelButton url={`/api/reportes/ventas/export?mes=${mes}`} />
          </div>
        }
      />

      {cargando ? (
        <p className="text-slate-500 animate-pulse">Cargando…</p>
      ) : !data ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-slate-500">
          No se pudo cargar el reporte de ventas.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard compact label="Total vendido" value={formatGs(data.totalVendido)} accent />
            <StatCard compact label="Ventas" value={String(data.cantidadVentas)} hint={`${data.cantidadItems} ítems / líneas`} />
            <StatCard compact label="Ticket promedio" value={formatGs(data.ticketPromedio)} hint="por venta" />
            <StatCard compact label="Unidades vendidas" value={String(data.unidadesVendidas)} />
            <StatCard compact label="Ítems vendidos" value={String(data.cantidadItems)} />
          </div>

          {/* Desglose por tipo de precio */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Por tipo de precio</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {TP.map(({ key, label, badge }) => (
                <div key={key} className="rounded-xl border border-slate-200 p-4">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}>{label}</span>
                  <p className="mt-2 text-lg font-bold tabular-nums text-slate-800">{formatGs(data.porTipoPrecio[key].total)}</p>
                  <p className="text-xs text-slate-400">{data.porTipoPrecio[key].items} {data.porTipoPrecio[key].items === 1 ? "ítem" : "ítems"}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Detalle de ventas — con toggle Detalle | Por semana */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-800">Ventas del mes</h2>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setVista("detalle")}
                  className={`px-3 py-1 rounded-md transition-colors ${vista === "detalle" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  Detalle
                </button>
                <button
                  type="button"
                  onClick={() => setVista("semana")}
                  className={`px-3 py-1 rounded-md transition-colors ${vista === "semana" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  Por semana
                </button>
              </div>
            </div>
            {data.ventas.length === 0 ? (
              <p className="text-sm text-slate-400">No hay ventas en el período.</p>
            ) : vista === "semana" ? (
              <div className="space-y-3">
                {porSemana.map((s) => {
                  const abierta = semanaAbierta === s.key;
                  return (
                    <div key={s.key} className="rounded-lg border border-slate-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setSemanaAbierta(abierta ? null : s.key)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${abierta ? "bg-slate-50" : "hover:bg-slate-50"}`}
                      >
                        <div className="flex items-baseline gap-3 flex-wrap min-w-0">
                          <span className="font-semibold text-slate-900">{s.label}</span>
                          <span className="text-xs text-slate-500 tabular-nums">{s.start} – {s.end}</span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs text-slate-600">{s.ventas} venta{s.ventas === 1 ? "" : "s"}</span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs text-slate-500">{s.productos.length} producto{s.productos.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="tabular-nums font-bold text-slate-900">{formatGs(s.total)}</span>
                          <span className={`transition-transform text-slate-400 ${abierta ? "rotate-180" : ""}`}>▾</span>
                        </div>
                      </button>
                      {abierta && (
                        <div className="border-t border-slate-200 bg-white overflow-x-auto">
                          {s.productos.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-slate-400">Sin items en la semana.</p>
                          ) : (
                            <table className="w-full text-left text-sm">
                              <thead className="bg-slate-50">
                                <tr className="text-slate-500">
                                  <th className="py-2 px-4 font-medium text-xs uppercase tracking-wide">Producto</th>
                                  <th className="py-2 px-4 font-medium text-right text-xs uppercase tracking-wide">Cantidad</th>
                                  <th className="py-2 px-4 font-medium text-right text-xs uppercase tracking-wide">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {s.productos.map((p) => (
                                  <tr key={p.nombre} className="hover:bg-slate-50">
                                    <td className="py-2 px-4 text-slate-800">{p.nombre}</td>
                                    <td className="py-2 px-4 text-right tabular-nums text-slate-700">{p.cantidad.toLocaleString("es-PY")}</td>
                                    <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{formatGs(p.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Fecha</th>
                      <th className="py-2.5 pr-4 font-medium">N° Venta</th>
                      <th className="py-2.5 pr-4 font-medium">Cliente</th>
                      <th className="py-2.5 pr-4 font-medium">Pago</th>
                      <th className="py-2.5 pr-4 font-medium text-right">Ítems</th>
                      <th className="py-2.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ventas.map((v) => (
                      <tr key={v.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 text-slate-600 text-xs tabular-nums">{formatFecha(v.fecha)}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500">{v.numero_control}</td>
                        <td className="py-3 pr-4 text-slate-700">{v.cliente ?? "—"}</td>
                        <td className="py-3 pr-4 text-slate-600 capitalize">{v.metodo_pago ?? "—"}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{v.items_count}</td>
                        <td className="py-3 text-right tabular-nums font-semibold text-slate-800">{formatGs(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Total por producto */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Total por producto</h2>
            {data.porProducto.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Producto</th>
                      <th className="py-2.5 pr-4 font-medium text-right">Cantidad</th>
                      <th className="py-2.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porProducto.map((p, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-4 text-slate-700">{p.producto_nombre}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">{p.cantidad}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-slate-800">{formatGs(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
