"use client";

/**
 * Reporte GANANCIAS SEMANALES: ventas agrupadas por semana ISO con margen
 * bruto (facturado − costo).
 */

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type SemanaRow = {
  key: string;
  label: string;
  start: string;
  end: string;
  cantidad_ventas: number;
  facturado: number;
  costo: number;
  ganancia: number;
  margen_pct: number;
};

type Resp = { desde: string; hasta: string; semanas: SemanaRow[] };

function fmtGs(v: number) { return `Gs. ${Math.round(v).toLocaleString("es-PY")}`; }
function fmtFecha(ymd: string) {
  try {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  } catch { return ymd; }
}

export default function GananciasSemanalesPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetchWithSupabaseSession("/api/reportes/ganancias-semanales", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.success) setData(j.data as Resp); })
      .finally(() => setCargando(false));
  }, []);

  const totales = (data?.semanas ?? []).reduce((acc, s) => ({
    facturado: acc.facturado + s.facturado,
    costo: acc.costo + s.costo,
    ganancia: acc.ganancia + s.ganancia,
    ventas: acc.ventas + s.cantidad_ventas,
  }), { facturado: 0, costo: 0, ganancia: 0, ventas: 0 });
  const margenTotal = totales.facturado > 0 ? (totales.ganancia / totales.facturado) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Zentra · Reportes"
        title="Ganancias por semana"
        description="Ventas agrupadas por semana ISO con margen bruto (facturado − costo actual del producto)."
        backHref="/reportes"
        backLabel="Reportes"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard compact label="Semanas" value={String(data?.semanas.length ?? 0)} />
        <StatCard compact label="Facturado" value={fmtGs(totales.facturado)} accent />
        <StatCard compact label="Ganancia bruta" value={fmtGs(totales.ganancia)} hint={`margen ${margenTotal.toFixed(1)}%`} />
        <StatCard compact label="Ventas" value={String(totales.ventas)} hint="total operaciones" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 sm:px-4 py-2.5 text-left">Semana</th>
                <th className="px-3 sm:px-4 py-2.5 text-left hidden sm:table-cell">Rango</th>
                <th className="px-3 sm:px-4 py-2.5 text-right">Ventas</th>
                <th className="px-3 sm:px-4 py-2.5 text-right">Facturado</th>
                <th className="px-3 sm:px-4 py-2.5 text-right hidden md:table-cell">Costo</th>
                <th className="px-3 sm:px-4 py-2.5 text-right">Ganancia</th>
                <th className="px-3 sm:px-4 py-2.5 text-right">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400">Cargando…</td></tr>
              ) : (data?.semanas.length ?? 0) === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400">Sin ventas en el período.</td></tr>
              ) : data!.semanas.slice().reverse().map((s) => (
                <tr key={s.key} className="hover:bg-slate-50">
                  <td className="px-3 sm:px-4 py-2.5 font-medium text-slate-900">{s.label}</td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-500 hidden sm:table-cell">
                    {fmtFecha(s.start)} – {fmtFecha(s.end)}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums text-slate-700">{s.cantidad_ventas}</td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmtGs(s.facturado)}</td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums text-slate-600 hidden md:table-cell">{fmtGs(s.costo)}</td>
                  <td className={`px-3 sm:px-4 py-2.5 text-right tabular-nums font-semibold ${s.ganancia > 0 ? "text-emerald-700" : s.ganancia < 0 ? "text-rose-700" : "text-slate-500"}`}>
                    {fmtGs(s.ganancia)}
                  </td>
                  <td className={`px-3 sm:px-4 py-2.5 text-right tabular-nums font-semibold ${
                    s.margen_pct >= 30 ? "text-emerald-700" :
                    s.margen_pct >= 15 ? "text-amber-700" :
                    "text-rose-700"
                  }`}>
                    {s.margen_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500 max-w-2xl">
        <strong>Nota:</strong> el costo se calcula usando el <em>costo_promedio actual</em> de cada producto,
        no el histórico del momento de la venta. Si los costos cambian mucho, el margen real de semanas viejas
        puede diferir del que se ve acá.
      </p>
    </div>
  );
}
