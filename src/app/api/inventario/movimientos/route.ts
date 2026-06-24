import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/inventario/movimientos — lista movimientos via PostgREST (compat Hostinger sin pool PG).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    // PostgREST aplica un db-max-rows server-side (1000 por defecto). Para
    // catálogos grandes (importación de inventario inicial puede generar miles
    // de movimientos en un solo día) usamos .range() para esquivarlo y subimos
    // el cap a 20k — la paginación final se hace client-side igual que en
    // /inventario.
    const { data, error } = await ctx.supabase
      .from("movimientos_inventario")
      .select(
        "id, empresa_id, producto_id, producto_nombre, producto_sku, tipo, cantidad, costo_unitario, origen, referencia, fecha, created_at, updated_at, created_by, usuario_nombre"
      )
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .range(0, 19_999);
    if (error) throw new Error(error.message);

    return NextResponse.json(successResponse({ movimientos: data ?? [] }));
  } catch (err) {
    console.error("[/api/inventario/movimientos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}
