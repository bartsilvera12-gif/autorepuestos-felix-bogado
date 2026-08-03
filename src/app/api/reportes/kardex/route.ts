import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/kardex?producto_id=X&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Kardex clásico: historial cronológico de movimientos de un producto con
 * saldo acumulado (running balance). Cada fila incluye:
 *   - fecha, tipo (ENTRADA/SALIDA), cantidad, costo_unitario
 *   - origen (compra/venta/ajuste_manual/inventario_inicial)
 *   - referencia (N° control de la compra/venta/anulación)
 *   - saldo posterior a este movimiento
 *
 * Devuelve TODO desde el principio de la historia del producto (no paginado)
 * porque para calcular saldo running hay que arrancar de 0.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase: sb, auth } = ctx;

    const url = new URL(request.url);
    const productoId = (url.searchParams.get("producto_id") ?? "").trim();
    if (!productoId) {
      return NextResponse.json(errorResponse("producto_id es obligatorio."), { status: 400 });
    }
    const desde = url.searchParams.get("desde")?.trim() || null;
    const hasta = url.searchParams.get("hasta")?.trim() || null;

    // Cabecera del producto
    const pQ = await sb
      .from("productos")
      .select("id, nombre, sku, unidad_medida, stock_actual, costo_promedio")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", productoId)
      .maybeSingle();
    if (pQ.error) throw new Error(pQ.error.message);
    if (!pQ.data) return NextResponse.json(errorResponse("Producto no encontrado."), { status: 404 });
    const producto = pQ.data as {
      id: string; nombre: string; sku: string; unidad_medida: string;
      stock_actual: number | string; costo_promedio: number | string;
    };

    // Movimientos ordenados por fecha ascendente (para saldo running).
    let mQ = sb
      .from("movimientos_inventario")
      .select("id, fecha, tipo, cantidad, costo_unitario, origen, referencia, venta_id, usuario_nombre")
      .eq("empresa_id", auth.empresa_id)
      .eq("producto_id", productoId)
      .order("fecha", { ascending: true })
      .limit(10000);
    // Bordes en hora Asunción (UTC-4). Si se usaba Z, se perdían ~4h del último
    // día y se pisaban con el día anterior (movimientos post-20:00 quedaban fuera).
    if (desde) mQ = mQ.gte("fecha", new Date(`${desde}T00:00:00.000-04:00`).toISOString());
    if (hasta) mQ = mQ.lte("fecha", new Date(`${hasta}T23:59:59.999-04:00`).toISOString());
    const mR = await mQ;
    if (mR.error) throw new Error(mR.error.message);

    const movs = (mR.data ?? []) as Array<{
      id: string; fecha: string; tipo: string; cantidad: number | string;
      costo_unitario: number | string | null; origen: string | null;
      referencia: string | null; venta_id: string | null; usuario_nombre: string | null;
    }>;

    // Saldo running desde 0 (chronologico ascendente).
    let saldo = 0;
    let entradas = 0, salidas = 0;
    const items = movs.map((m) => {
      const qty = Number(m.cantidad) || 0;
      const delta = m.tipo === "ENTRADA" ? qty : -qty;
      saldo += delta;
      if (m.tipo === "ENTRADA") entradas += qty; else salidas += qty;
      return {
        id: m.id,
        fecha: m.fecha,
        tipo: m.tipo as "ENTRADA" | "SALIDA",
        cantidad: qty,
        costo_unitario: Number(m.costo_unitario) || 0,
        origen: m.origen ?? "—",
        referencia: m.referencia ?? "—",
        venta_id: m.venta_id,
        usuario_nombre: m.usuario_nombre,
        saldo_posterior: saldo,
      };
    });

    return NextResponse.json(successResponse({
      producto: {
        id: producto.id,
        nombre: producto.nombre,
        sku: producto.sku,
        unidad_medida: producto.unidad_medida,
        stock_actual: Number(producto.stock_actual) || 0,
        costo_promedio: Number(producto.costo_promedio) || 0,
      },
      resumen: {
        movimientos: items.length,
        total_entradas: entradas,
        total_salidas: salidas,
        saldo_calculado: saldo,
        // Diferencia entre saldo running y stock_actual (should be 0 salvo desync).
        diferencia_vs_stock: Number(producto.stock_actual) - saldo,
      },
      items,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar el kardex.";
    console.error("[/api/reportes/kardex]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
