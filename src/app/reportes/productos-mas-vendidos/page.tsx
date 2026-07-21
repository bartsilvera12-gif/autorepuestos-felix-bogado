"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import {
  getProductosMasVendidosReporte,
  productosMasVendidosQueryString,
  type ProductosMasVendidosQuery,
} from "@/lib/reportes/storage";
import type { ProductosMasVendidosReporte } from "@/lib/reportes/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
function formatNum(v: number) {
  return v.toLocaleString("es-PY", { maximumFractionDigits: 2 });
}

/** YYYY-MM-DD del primer día del mes actual (hora local). */
function primerDiaMesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
/** YYYY-MM-DD de hoy (hora local). */
function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Categoria = { id: string; nombre: string };
type Proveedor = { id: string; nombre: string };

const inputCls =
  "rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#0EA5E9]";

export default function ProductosMasVendidosPage() {
  // Filtros
  const [desde, setDesde] = useState(primerDiaMesActual());
  const [hasta, setHasta] = useState(hoyISO());
  const [q, setQ] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [orden, setOrden] = useState<"monto" | "unidades">("monto");
  const [limite, setLimite] = useState<number>(0); // 0 = todos

  // Opciones de dropdowns
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  // Datos
  const [data, setData] = useState<ProductosMasVendidosReporte | null>(null);
  const [cargando, setCargando] = useState(true);

  // `q` con debounce para no disparar fetch en cada tecla.
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Carga inicial de catálogos para los filtros.
  useEffect(() => {
    let cancel = false;
    fetch("/api/inventario/categorias", { credentials: "include", cache: "no-store" })
      .then((r) => r.json()).catch(() => null)
      .then((j) => { if (!cancel && j?.success) setCategorias(j.data?.categorias ?? []); });
    fetch("/api/proveedores", { credentials: "include", cache: "no-store" })
      .then((r) => r.json()).catch(() => null)
      .then((j) => { if (!cancel && j?.success) setProveedores(j.data?.proveedores ?? []); });
    return () => { cancel = true; };
  }, []);

  const filtros: ProductosMasVendidosQuery = useMemo(
    () => ({
      desde: desde || null,
      hasta: hasta || null,
      q: qDebounced || null,
      categoriaId: categoriaId || null,
      proveedorId: proveedorId || null,
      orden,
      limite: limite || null,
    }),
    [desde, hasta, qDebounced, categoriaId, proveedorId, orden, limite]
  );

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getProductosMasVendidosReporte(filtros).then((d) => {
      if (!cancel) { setData(d); setCargando(false); }
    });
    return () => { cancel = true; };
  }, [filtros]);

  const exportUrl = `/api/reportes/productos-mas-vendidos/export?${productosMasVendidosQueryString(filtros)}`;
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Zentra · Reportes"
        title="Productos más vendidos"
        description="Ranking de productos por unidades o monto, con filtros por fecha, categoría y proveedor"
        backHref="/reportes"
        backLabel="Reportes"
        actions={<ExportExcelButton url={exportUrl} />}
      />

      {/* Panel de filtros */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Desde</span>
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Hasta</span>
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Buscar producto</span>
            <input
              type="text" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre del producto…" className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Categoría</span>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={inputCls}>
              <option value="">Todas</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Proveedor</span>
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Ordenar por</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value as "monto" | "unidades")} className={inputCls}>
              <option value="monto">Monto vendido (Gs.)</option>
              <option value="unidades">Unidades vendidas</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Mostrar</span>
            <select value={limite} onChange={(e) => setLimite(Number(e.target.value))} className={inputCls}>
              <option value={0}>Todos</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
            </select>
          </label>
        </div>
        {rangoInvalido && (
          <p className="mt-3 text-xs text-rose-600">La fecha “Desde” no puede ser posterior a “Hasta”.</p>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard compact label="Productos en el ranking" value={data ? String(data.cantidadProductos) : "—"} accent />
        <StatCard compact label="Unidades vendidas" value={data ? formatNum(data.totalUnidades) : "—"} hint="suma del ranking" />
        <StatCard compact label="Monto vendido" value={data ? formatGs(data.totalMonto) : "—"} hint="suma del ranking" />
      </div>

      {/* Tabla ranking */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Ranking de productos</h2>
        {cargando ? (
          <p className="text-slate-500 animate-pulse">Cargando…</p>
        ) : !data ? (
          <p className="text-sm text-slate-400">No se pudo cargar el reporte.</p>
        ) : data.productos.length === 0 ? (
          <p className="text-sm text-slate-400">No hay ventas de productos para los filtros seleccionados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2.5 pr-3 font-medium w-10">#</th>
                  <th className="py-2.5 pr-4 font-medium">Producto</th>
                  <th className="py-2.5 pr-4 font-medium">Categoría</th>
                  <th className="py-2.5 pr-4 font-medium">Proveedor</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Unidades</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Ventas</th>
                  <th className="py-2.5 font-medium text-right">Monto total</th>
                </tr>
              </thead>
              <tbody>
                {data.productos.map((p, i) => (
                  <tr key={p.producto_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="py-2.5 pr-3 tabular-nums text-slate-400">{i + 1}</td>
                    <td className="py-2.5 pr-4 text-slate-800">
                      {p.producto_nombre}
                      {p.sku ? <span className="ml-2 font-mono text-xs text-slate-400">{p.sku}</span> : null}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{p.categoria_nombre ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{p.proveedor_nombre ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{formatNum(p.unidades)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500">{p.ventas_count}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold text-slate-800">{formatGs(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
