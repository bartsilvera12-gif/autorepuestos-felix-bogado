import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getReporteProductosMasVendidos } from "@/lib/reportes/server/reportes-pg";
import { sheetFromRows, buildXlsxBufferSheets, xlsxResponseHeaders } from "@/lib/excel/export";
import { parseProductosMasVendidosParams } from "../params";

/** GET /api/reportes/productos-mas-vendidos/export → XLSX (Filtros + Ranking). */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  try {
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const params = parseProductosMasVendidosParams(new URL(request.url));
    const r = await getReporteProductosMasVendidos(schema, ctx.auth.empresa_id, params);
    const f = r.filtros;

    const resumen = [
      { concepto: "Reporte", valor: "Productos más vendidos" },
      { concepto: "Desde", valor: f.desde ?? "(mes actual)" },
      { concepto: "Hasta", valor: f.hasta ?? "(mes actual)" },
      { concepto: "Búsqueda", valor: f.q ?? "—" },
      { concepto: "Categoría", valor: f.categoriaNombre ?? "Todas" },
      { concepto: "Proveedor", valor: f.proveedorNombre ?? "Todos" },
      { concepto: "Orden", valor: f.orden === "unidades" ? "Por unidades" : "Por monto" },
      { concepto: "Top", valor: f.limite ?? "Todos" },
      { concepto: "Productos en el ranking", valor: r.cantidadProductos },
      { concepto: "Unidades vendidas (total)", valor: r.totalUnidades },
      { concepto: "Monto vendido (total)", valor: Math.round(r.totalMonto) },
    ];

    const ranking = r.productos.map((prod, i) => ({ ...prod, rank: i + 1 }));

    const buf = buildXlsxBufferSheets([
      sheetFromRows("Filtros", resumen, [
        { header: "Concepto", value: (x) => x.concepto, width: 30 },
        { header: "Valor", value: (x) => x.valor, width: 34 },
      ]),
      sheetFromRows("Ranking", ranking, [
        { header: "#", value: (x) => x.rank, width: 6 },
        { header: "Producto", value: (x) => x.producto_nombre, width: 36 },
        { header: "SKU", value: (x) => x.sku ?? "", width: 16 },
        { header: "Categoría", value: (x) => x.categoria_nombre ?? "", width: 22 },
        { header: "Proveedor", value: (x) => x.proveedor_nombre ?? "", width: 24 },
        { header: "Unidades", value: (x) => x.unidades, width: 12 },
        { header: "Ventas", value: (x) => x.ventas_count, width: 10 },
        { header: "Monto total", value: (x) => Math.round(x.total), width: 18 },
      ]),
    ]);
    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders("productos-mas-vendidos") });
  } catch (err) {
    console.error("[/api/reportes/productos-mas-vendidos/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
