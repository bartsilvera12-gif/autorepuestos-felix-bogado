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

/** El SKU solo aporta si difiere del nombre (muchos productos lo repiten). */
function skuUtil(sku: string | null, nombre: string): string | null {
  if (!sku) return null;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(sku) === norm(nombre) ? null : sku;
}

/** Estilo del badge de posición: medallas para el top 3, gris para el resto. */
function rankBadgeCls(pos: number): string {
  if (pos === 1) return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
  if (pos === 2) return "bg-slate-200 text-slate-600 ring-1 ring-slate-300";
  if (pos === 3) return "bg-orange-100 text-orange-700 ring-1 ring-orange-200";
  return "bg-slate-50 text-slate-400";
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

  // Paginación (client-side sobre el ranking completo). pageSize 0 = todos.
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(1);

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
    }),
    [desde, hasta, qDebounced, categoriaId, proveedorId, orden]
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

  // Máximo de la métrica activa (monto/unidades) para dimensionar la barra
  // de proporción de cada fila del ranking.
  const maxMetric = useMemo(() => {
    if (!data || data.productos.length === 0) return 0;
    const val = (p: (typeof data.productos)[number]) => (orden === "unidades" ? p.unidades : p.total);
    return data.productos.reduce((m, p) => Math.max(m, val(p)), 0);
  }, [data, orden]);

  // Paginación derivada del ranking completo (client-side).
  const total = data?.productos.length ?? 0;
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  // Al cambiar filtros o tamaño de página, volver a la primera.
  useEffect(() => { setPage(1); }, [filtros, pageSize]);
  // Clamp defensivo si el total encoge por debajo de la página actual.
  const pageSafe = Math.min(page, pageCount);
  const inicio = pageSize > 0 ? (pageSafe - 1) * pageSize : 0;
  const fin = pageSize > 0 ? Math.min(inicio + pageSize, total) : total;
  const visibles = data ? data.productos.slice(inicio, fin) : [];

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
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Ranking de productos</h2>
          {data && data.productos.length > 0 && (
            <span className="text-xs text-slate-400">
              ordenado por {orden === "unidades" ? "unidades" : "monto"}
            </span>
          )}
        </div>

        {cargando ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded-md bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <p className="p-6 text-sm text-slate-400">No se pudo cargar el reporte.</p>
        ) : data.productos.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-600">Sin resultados</p>
            <p className="mt-1 text-sm text-slate-400">No hay ventas de productos para los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-3 font-semibold w-14">#</th>
                  <th className="py-3 pr-4 font-semibold">Producto</th>
                  <th className="py-3 pr-4 font-semibold">Categoría</th>
                  <th className="py-3 pr-4 font-semibold">Proveedor</th>
                  <th className={`py-3 pr-4 font-semibold text-right ${orden === "unidades" ? "text-[#0EA5E9]" : ""}`}>Unidades</th>
                  <th className="py-3 pr-4 font-semibold text-right">Ventas</th>
                  <th className={`py-3 pr-6 font-semibold text-right ${orden === "monto" ? "text-[#0EA5E9]" : ""}`}>Monto total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p, i) => {
                  const pos = inicio + i + 1;
                  const sku = skuUtil(p.sku, p.producto_nombre);
                  const metric = orden === "unidades" ? p.unidades : p.total;
                  const pct = maxMetric > 0 ? Math.max(2, Math.round((metric / maxMetric) * 100)) : 0;
                  return (
                    <tr key={p.producto_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 pl-6 pr-3">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${rankBadgeCls(pos)}`}>
                          {pos}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-medium text-slate-800">{p.producto_nombre}</span>
                        {sku && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 align-middle">{sku}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {p.categoria_nombre
                          ? <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">{p.categoria_nombre}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        {p.proveedor_nombre
                          ? <span className="text-slate-600">{p.proveedor_nombre}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-col items-end gap-1">
                          <span className={`tabular-nums ${orden === "unidades" ? "font-semibold text-slate-800" : "text-slate-600"}`}>{formatNum(p.unidades)}</span>
                          {orden === "unidades" && (
                            <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-[#0EA5E9]" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-500">{p.ventas_count}</td>
                      <td className="py-3 pr-6">
                        <div className="flex flex-col items-end gap-1">
                          <span className={`tabular-nums ${orden === "monto" ? "font-semibold text-slate-800" : "text-slate-700"}`}>{formatGs(p.total)}</span>
                          {orden === "monto" && (
                            <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-[#0EA5E9]" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer de paginación */}
        {data && data.productos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Filas por página</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={0}>Todos</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 tabular-nums">
                {total === 0 ? "0" : `${inicio + 1}–${fin}`} de {total}
              </span>
              {pageSize > 0 && pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((n) => Math.max(1, n - 1))}
                    disabled={pageSafe <= 1}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                  >
                    ← Anterior
                  </button>
                  <span className="px-2 text-xs text-slate-500 tabular-nums">
                    Página {pageSafe} de {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((n) => Math.min(pageCount, n + 1))}
                    disabled={pageSafe >= pageCount}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
