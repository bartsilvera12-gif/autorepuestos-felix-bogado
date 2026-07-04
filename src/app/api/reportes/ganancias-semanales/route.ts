import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/ganancias-semanales?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Agrupa ventas por SEMANA (lunes a domingo) y calcula:
 *   - total facturado (Σ precio × cantidad)
 *   - costo estimado (Σ costo_promedio × cantidad, usando costo actual del producto)
 *   - ganancia = facturado − costo
 *   - margen % = ganancia / facturado
 *
 * El costo usado es el `costo_promedio` ACTUAL del producto, no el histórico
 * del momento de la venta. Para autopartes con costos estables es OK; si en
 * el futuro se necesita costo histórico por venta, hay que persistir el costo
 * en ventas_items (columna nueva).
 *
 * Excluye ventas anuladas.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase: sb, auth } = ctx;

    const url = new URL(request.url);
    const desdeIn = url.searchParams.get("desde")?.trim() || null;
    const hastaIn = url.searchParams.get("hasta")?.trim() || null;
    // Default: últimas 13 semanas
    const now = new Date();
    const desde = desdeIn ?? new Date(now.getTime() - 91 * 86400_000).toISOString().slice(0, 10);
    const hasta = hastaIn ?? now.toISOString().slice(0, 10);

    // Traer ventas + items del rango. Excluir anuladas.
    const vQ = await sb
      .from("ventas")
      .select("id, fecha, total")
      .eq("empresa_id", auth.empresa_id)
      .neq("estado", "anulada")
      .gte("fecha", `${desde}T00:00:00.000Z`)
      .lte("fecha", `${hasta}T23:59:59.999Z`);
    if (vQ.error) throw new Error(vQ.error.message);
    const ventas = (vQ.data ?? []) as Array<{ id: string; fecha: string; total: number | string }>;
    if (ventas.length === 0) {
      return NextResponse.json(successResponse({ desde, hasta, semanas: [] }));
    }

    const ventaIds = ventas.map((v) => v.id);

    // Items con precio y cantidad para calcular facturación real por item.
    const iQ = await sb
      .from("ventas_items")
      .select("venta_id, producto_id, cantidad, precio_venta")
      .eq("empresa_id", auth.empresa_id)
      .in("venta_id", ventaIds);
    if (iQ.error) throw new Error(iQ.error.message);
    const items = (iQ.data ?? []) as Array<{
      venta_id: string; producto_id: string; cantidad: number | string; precio_venta: number | string;
    }>;

    // Costo promedio actual de todos los productos involucrados.
    const productoIds = [...new Set(items.map((i) => i.producto_id))];
    const pQ = productoIds.length > 0
      ? await sb.from("productos").select("id, costo_promedio").in("id", productoIds)
      : { data: [], error: null };
    if (pQ.error) throw new Error(pQ.error.message);
    const costoPorProducto = new Map<string, number>();
    for (const p of (pQ.data ?? []) as Array<{ id: string; costo_promedio: number | string }>) {
      costoPorProducto.set(p.id, Number(p.costo_promedio) || 0);
    }

    // Índice venta_id → fecha
    const fechaPorVenta = new Map(ventas.map((v) => [v.id, v.fecha]));

    // ISO week: (año, número de semana ISO)
    function isoWeekKey(dateIso: string): { key: string; label: string; start: string; end: string } {
      const d = new Date(dateIso);
      // Semana ISO: jueves como pivote (algoritmo estándar).
      const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = (target.getUTCDay() + 6) % 7; // lunes = 0
      target.setUTCDate(target.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
      const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
      const year = target.getUTCFullYear();
      const key = `${year}-W${String(week).padStart(2, "0")}`;
      // Rango de fechas de la semana (lunes a domingo)
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - dayNum);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
      return { key, label: `Sem ${week} · ${year}`, start: fmt(monday), end: fmt(sunday) };
    }

    // Agrupación
    type Bucket = { key: string; label: string; start: string; end: string;
      ventas: Set<string>; facturado: number; costo: number; };
    const buckets = new Map<string, Bucket>();

    for (const it of items) {
      const fecha = fechaPorVenta.get(it.venta_id);
      if (!fecha) continue;
      const { key, label, start, end } = isoWeekKey(fecha);
      let b = buckets.get(key);
      if (!b) {
        b = { key, label, start, end, ventas: new Set(), facturado: 0, costo: 0 };
        buckets.set(key, b);
      }
      const qty = Number(it.cantidad) || 0;
      const precio = Number(it.precio_venta) || 0;
      const costoUnit = costoPorProducto.get(it.producto_id) ?? 0;
      b.ventas.add(it.venta_id);
      b.facturado += qty * precio;
      b.costo += qty * costoUnit;
    }

    const semanas = [...buckets.values()]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((b) => {
        const ganancia = b.facturado - b.costo;
        const margen = b.facturado > 0 ? (ganancia / b.facturado) * 100 : 0;
        return {
          key: b.key,
          label: b.label,
          start: b.start,
          end: b.end,
          cantidad_ventas: b.ventas.size,
          facturado: Math.round(b.facturado),
          costo: Math.round(b.costo),
          ganancia: Math.round(ganancia),
          margen_pct: Math.round(margen * 10) / 10,
        };
      });

    return NextResponse.json(successResponse({ desde, hasta, semanas }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar el reporte.";
    console.error("[/api/reportes/ganancias-semanales]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
