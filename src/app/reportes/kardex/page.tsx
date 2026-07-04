"use client";

/**
 * Reporte KARDEX: historial cronológico de movimientos de un producto con
 * saldo running. Cada producto se carga vía selector con buscador.
 */

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import ProductoSearchSelect from "@/components/inventario/ProductoSearchSelect";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";

type KardexItem = {
  id: string;
  fecha: string;
  tipo: "ENTRADA" | "SALIDA";
  cantidad: number;
  costo_unitario: number;
  origen: string;
  referencia: string;
  usuario_nombre: string | null;
  saldo_posterior: number;
};

type KardexResp = {
  producto: {
    id: string; nombre: string; sku: string; unidad_medida: string;
    stock_actual: number; costo_promedio: number;
  };
  resumen: {
    movimientos: number; total_entradas: number; total_salidas: number;
    saldo_calculado: number; diferencia_vs_stock: number;
  };
  items: KardexItem[];
};

function fmtGs(v: number) { return `Gs. ${Math.round(v).toLocaleString("es-PY")}`; }
function fmtFecha(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

const ORIGEN_LABEL: Record<string, string> = {
  compra: "Compra",
  venta: "Venta",
  ajuste_manual: "Ajuste manual",
  inventario_inicial: "Stock inicial",
  produccion: "Producción",
};

export default function KardexPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [productoId, setProductoId] = useState<string>("");
  const [data, setData] = useState<KardexResp | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProductos().then(setProductos).catch(() => setProductos([]));
  }, []);

  useEffect(() => {
    if (!productoId) { setData(null); return; }
    setCargando(true); setError(null);
    fetchWithSupabaseSession(`/api/reportes/kardex?producto_id=${encodeURIComponent(productoId)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
        setData(j.data as KardexResp);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error de red"))
      .finally(() => setCargando(false));
  }, [productoId]);

  // Orden descendente para mostrar (más recientes arriba). Saldo posterior
  // es el que ya vino calculado por el server sobre orden ascendente.
  const itemsDesc = useMemo(() => data ? [...data.items].reverse() : [], [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Zentra · Reportes"
        title="Kardex de producto"
        description="Historial cronológico de movimientos (entradas y salidas) con saldo acumulado."
        backHref="/reportes"
        backLabel="Reportes"
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Producto
        </label>
        <ProductoSearchSelect
          value={productoId}
          onChange={setProductoId}
          productos={productos}
          placeholder="Buscar producto por nombre, SKU o código…"
        />
      </div>

      {cargando && (
        <p className="text-sm text-slate-500">Cargando kardex…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}

      {data && (
        <>
          {/* Resumen del producto */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{data.producto.nombre}</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{data.producto.sku}</p>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Stock actual</p>
                <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                  {data.producto.stock_actual.toLocaleString("es-PY")}
                  <span className="ml-1 text-xs font-normal text-slate-500">{data.producto.unidad_medida}</span>
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-[10px] font-semibold uppercase text-emerald-700">Total entradas</p>
                <p className="mt-1 text-lg font-bold text-emerald-800 tabular-nums">
                  {data.resumen.total_entradas.toLocaleString("es-PY")}
                </p>
              </div>
              <div className="rounded-lg bg-rose-50 border border-rose-100 p-3">
                <p className="text-[10px] font-semibold uppercase text-rose-700">Total salidas</p>
                <p className="mt-1 text-lg font-bold text-rose-800 tabular-nums">
                  {data.resumen.total_salidas.toLocaleString("es-PY")}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Movimientos</p>
                <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                  {data.resumen.movimientos.toLocaleString("es-PY")}
                </p>
              </div>
            </div>

            {Math.abs(data.resumen.diferencia_vs_stock) > 0.01 && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                ⚠️ El saldo calculado por movimientos ({data.resumen.saldo_calculado.toLocaleString("es-PY")}) difiere del stock actual ({data.producto.stock_actual.toLocaleString("es-PY")}). Puede ser por un ajuste manual sin registrar movimiento o por un import.
              </p>
            )}
          </div>

          {/* Tabla de movimientos */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 sm:px-4 py-2.5 text-left">Fecha</th>
                    <th className="px-3 sm:px-4 py-2.5 text-left">Tipo</th>
                    <th className="px-3 sm:px-4 py-2.5 text-left">Origen</th>
                    <th className="px-3 sm:px-4 py-2.5 text-left hidden md:table-cell">Referencia</th>
                    <th className="px-3 sm:px-4 py-2.5 text-right">Cantidad</th>
                    <th className="px-3 sm:px-4 py-2.5 text-right hidden sm:table-cell">Costo unit.</th>
                    <th className="px-3 sm:px-4 py-2.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemsDesc.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400">Sin movimientos.</td></tr>
                  ) : itemsDesc.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">{fmtFecha(it.fecha)}</td>
                      <td className="px-3 sm:px-4 py-2.5">
                        {it.tipo === "ENTRADA" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                            <ArrowDownCircle className="h-3 w-3" /> Entrada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-semibold">
                            <ArrowUpCircle className="h-3 w-3" /> Salida
                          </span>
                        )}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-600">
                        {ORIGEN_LABEL[it.origen] ?? it.origen}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-500 font-mono hidden md:table-cell">{it.referencia}</td>
                      <td className={`px-3 sm:px-4 py-2.5 text-right tabular-nums font-semibold ${it.tipo === "ENTRADA" ? "text-emerald-700" : "text-rose-700"}`}>
                        {it.tipo === "ENTRADA" ? "+" : "−"}{it.cantidad.toLocaleString("es-PY")}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums text-slate-600 hidden sm:table-cell">
                        {it.costo_unitario > 0 ? fmtGs(it.costo_unitario) : "—"}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">
                        {it.saldo_posterior.toLocaleString("es-PY")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
