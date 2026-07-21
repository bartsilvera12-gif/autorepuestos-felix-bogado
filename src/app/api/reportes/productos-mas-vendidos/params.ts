import { asuncionRangeBoundsUtc } from "@/lib/fechas/asuncion-bounds";
import type { ProductosMasVendidosParams } from "@/lib/reportes/server/reportes-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parsea y valida los filtros del reporte desde la query string. */
export function parseProductosMasVendidosParams(url: URL): ProductosMasVendidosParams {
  const sp = url.searchParams;
  const desde = FECHA_RE.test(sp.get("desde") ?? "") ? sp.get("desde") : null;
  const hasta = FECHA_RE.test(sp.get("hasta") ?? "") ? sp.get("hasta") : null;
  const { start, end } = asuncionRangeBoundsUtc(desde, hasta);

  const qRaw = (sp.get("q") ?? "").trim();
  const categoriaId = UUID_RE.test(sp.get("categoriaId") ?? "") ? sp.get("categoriaId") : null;
  const proveedorId = UUID_RE.test(sp.get("proveedorId") ?? "") ? sp.get("proveedorId") : null;
  const orden = sp.get("orden") === "unidades" ? "unidades" : "monto";

  const limiteRaw = Number(sp.get("limite"));
  const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.floor(limiteRaw) : null;

  return {
    start,
    end,
    desde,
    hasta,
    q: qRaw || null,
    categoriaId,
    proveedorId,
    orden,
    limite,
  };
}
