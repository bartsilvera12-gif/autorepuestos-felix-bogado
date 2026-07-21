import type { EstadoCuentaReporte, ProveedoresReporte, ComprasReporte, VentasReporte, ConciliacionReporte, ProductosMasVendidosReporte } from "./types";

/** Filtros del reporte de productos más vendidos (para armar el query string). */
export interface ProductosMasVendidosQuery {
  desde?: string | null;
  hasta?: string | null;
  q?: string | null;
  categoriaId?: string | null;
  proveedorId?: string | null;
  orden?: "monto" | "unidades";
  limite?: number | null;
}

/** Construye el query string compartido por el fetch JSON y el export Excel. */
export function productosMasVendidosQueryString(f: ProductosMasVendidosQuery): string {
  const sp = new URLSearchParams();
  if (f.desde) sp.set("desde", f.desde);
  if (f.hasta) sp.set("hasta", f.hasta);
  if (f.q && f.q.trim()) sp.set("q", f.q.trim());
  if (f.categoriaId) sp.set("categoriaId", f.categoriaId);
  if (f.proveedorId) sp.set("proveedorId", f.proveedorId);
  if (f.orden) sp.set("orden", f.orden);
  if (f.limite && f.limite > 0) sp.set("limite", String(f.limite));
  return sp.toString();
}

async function getReporte<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { credentials: "include", cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) return null;
    return j.data as T;
  } catch (e) {
    console.error("[reportes] getReporte:", e);
    return null;
  }
}

const mq = (mes: string) => encodeURIComponent(mes);

export const getEstadoCuentaReporte = (mes: string) =>
  getReporte<EstadoCuentaReporte>(`/api/reportes/estado-cuenta?mes=${mq(mes)}`);
export const getProveedoresReporte = (mes: string) =>
  getReporte<ProveedoresReporte>(`/api/reportes/proveedores?mes=${mq(mes)}`);
export const getComprasReporte = (mes: string) =>
  getReporte<ComprasReporte>(`/api/reportes/compras?mes=${mq(mes)}`);
export const getVentasReporte = (mes: string) =>
  getReporte<VentasReporte>(`/api/reportes/ventas?mes=${mq(mes)}`);
export const getConciliacionReporte = (mes: string) =>
  getReporte<ConciliacionReporte>(`/api/reportes/conciliacion?mes=${mq(mes)}`);
export const getProductosMasVendidosReporte = (f: ProductosMasVendidosQuery) =>
  getReporte<ProductosMasVendidosReporte>(
    `/api/reportes/productos-mas-vendidos?${productosMasVendidosQueryString(f)}`
  );
