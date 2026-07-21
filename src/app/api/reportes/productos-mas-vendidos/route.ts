import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getReporteProductosMasVendidos } from "@/lib/reportes/server/reportes-pg";
import { parseProductosMasVendidosParams } from "./params";

/** GET /api/reportes/productos-mas-vendidos?desde=&hasta=&q=&categoriaId=&proveedorId=&orden=&limite= */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const params = parseProductosMasVendidosParams(new URL(request.url));
    const data = await getReporteProductosMasVendidos(schema, ctx.auth.empresa_id, params);
    return NextResponse.json(successResponse(data));
  } catch (err) {
    console.error("[/api/reportes/productos-mas-vendidos]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el reporte de productos más vendidos."), { status: 500 });
  }
}
