import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/gastos
 * Gastos operativos del tenant (service role).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("gastos")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("fecha", { ascending: false });

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * POST /api/gastos
 * Crea un gasto. Service role para saltear el RLS del schema tenant (el
 * browser client anon no logra pasar la sesión → los inserts se rechazan).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("El monto debe ser mayor a 0."), { status: 400 });
    }
    const fecha = typeof body.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : null;
    if (!fecha) return NextResponse.json(errorResponse("Fecha inválida (usar YYYY-MM-DD)."), { status: 400 });

    const categoria = typeof body.categoria === "string" ? body.categoria.trim() : "";
    const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() : "";
    const tipo = body.tipo === "fijo" ? "fijo" : "variable";
    const recurrente = Boolean(body.recurrente);
    const frecuencia = typeof body.frecuencia === "string" ? body.frecuencia.trim() : "";

    const { data, error } = await supabase
      .from("gastos")
      .insert({
        empresa_id: auth.empresa_id,
        categoria: categoria || null,
        descripcion: descripcion || null,
        monto,
        tipo,
        recurrente,
        frecuencia: frecuencia || null,
        fecha,
      })
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
