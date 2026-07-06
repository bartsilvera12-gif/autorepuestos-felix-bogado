import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * PATCH /api/gastos/[id] — actualiza un gasto (parcial).
 * DELETE /api/gastos/[id] — elimina un gasto.
 *
 * Service role para saltear RLS del schema tenant (el browser client anon
 * no logra pasar la sesión → los writes se rechazan).
 */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (body.categoria !== undefined) update.categoria = typeof body.categoria === "string" ? body.categoria.trim() || null : null;
    if (body.descripcion !== undefined) update.descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() || null : null;
    if (body.monto !== undefined) {
      const monto = Number(body.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return NextResponse.json(errorResponse("El monto debe ser mayor a 0."), { status: 400 });
      }
      update.monto = monto;
    }
    if (body.tipo !== undefined) update.tipo = body.tipo === "fijo" ? "fijo" : "variable";
    if (body.recurrente !== undefined) update.recurrente = Boolean(body.recurrente);
    if (body.frecuencia !== undefined) update.frecuencia = typeof body.frecuencia === "string" ? body.frecuencia.trim() || null : null;
    if (body.fecha !== undefined) {
      if (typeof body.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) update.fecha = body.fecha;
      else return NextResponse.json(errorResponse("Fecha inválida."), { status: 400 });
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(errorResponse("Sin campos para actualizar."), { status: 400 });
    }

    const { data, error } = await supabase
      .from("gastos")
      .update(update)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    if (!id) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const { error } = await supabase
      .from("gastos")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ eliminado: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
