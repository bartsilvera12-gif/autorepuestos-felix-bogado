import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * Reporte "Rotación de inventario".
 *
 * GET /api/reportes/rotacion?dias=90
 *
 * Para cada producto activo con stock real:
 *   rotacion = unidades_vendidas_periodo / max(stock_actual, 1)
 *
 * Es una aproximación práctica al ratio clásico (COGS / inventario
 * promedio). Para autopartes en una casa chica con inventarios estables,
 * usar el stock_actual como denominador da una vista accionable: cuántas
 * veces el stock se vendió completo en el período.
 *
 * Categorías sugeridas (por defecto):
 *   - "alta": rotación >= 2 en el período
 *   - "media": entre 0.5 y 2
 *   - "baja": > 0 y < 0.5
 *   - "nula": sin ventas
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const url = new URL(request.url);
    const diasRaw = parseInt(url.searchParams.get("dias") ?? "90", 10);
    const dias = Number.isFinite(diasRaw) && diasRaw > 0 && diasRaw <= 365 ? diasRaw : 90;

    const corte = new Date(Date.now() - dias * 86400000).toISOString();

    // 1) Productos activos con control de stock.
    const prodQ = await supabase
      .from("productos")
      .select(
        "id, nombre, sku, marca_repuesto, codigo_oem, stock_actual, costo_promedio, precio_venta"
      )
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .eq("controla_stock", true);
    if (prodQ.error) throw new Error(prodQ.error.message);
    const productos = ((prodQ.data ?? []) as unknown) as Array<{
      id: string; nombre: string; sku: string;
      marca_repuesto: string | null; codigo_oem: string | null;
      stock_actual: number; costo_promedio: number; precio_venta: number;
    }>;
    if (productos.length === 0) {
      return NextResponse.json(successResponse({ items: [], dias, count: 0 }));
    }
    const ids = productos.map((p) => p.id);

    // 2) Salidas por venta agregadas en JS (PostgREST no agrupa fácil aquí).
    //    NO usamos .in("producto_id", ids) porque con miles de productos la URL
    //    supera el límite de Cloudflare/Traefik y da 520. Traemos todas las
    //    SALIDAs de la empresa en el rango y filtramos por producto acá.
    //    Excluye anuladas (fallback si PostgREST aún no ve la columna).
    const idSet = new Set(ids);
    const CHUNK = 1000;
    const fetchPage = async (withEstado: boolean, offset: number) => {
      let q = supabase
        .from("movimientos_inventario")
        .select("producto_id, cantidad")
        .eq("empresa_id", empresaId)
        .eq("tipo", "SALIDA")
        .eq("origen", "venta")
        .gte("fecha", corte)
        .range(offset, offset + CHUNK - 1);
      if (withEstado) q = q.eq("estado", "activa");
      return q;
    };
    let usarEst = true;
    let pg = await fetchPage(true, 0);
    if (pg.error) {
      console.warn("[/api/reportes/rotacion] fallback sin filtro estado:", pg.error.message);
      usarEst = false;
      pg = await fetchPage(false, 0);
      if (pg.error) throw new Error(pg.error.message);
    }
    const vendidoPorProducto = new Map<string, number>();
    const acumular = (rows: Array<{ producto_id: string; cantidad: number }>) => {
      for (const r of rows) {
        const k = String(r.producto_id);
        if (!idSet.has(k)) continue;
        vendidoPorProducto.set(k, (vendidoPorProducto.get(k) ?? 0) + (Number(r.cantidad) || 0));
      }
    };
    acumular((pg.data ?? []) as Array<{ producto_id: string; cantidad: number }>);
    let off = CHUNK;
    while ((pg.data ?? []).length === CHUNK && off < 200_000) {
      pg = await fetchPage(usarEst, off);
      if (pg.error) throw new Error(pg.error.message);
      acumular((pg.data ?? []) as Array<{ producto_id: string; cantidad: number }>);
      off += CHUNK;
    }

    type Banda = "alta" | "media" | "baja" | "nula";
    function bandaDe(rot: number, vendido: number): Banda {
      if (vendido <= 0) return "nula";
      if (rot >= 2) return "alta";
      if (rot >= 0.5) return "media";
      return "baja";
    }

    const items = productos
      .map((p) => {
        const stock = Number(p.stock_actual) || 0;
        const costo = Number(p.costo_promedio) || 0;
        const precio = Number(p.precio_venta) || 0;
        const vendido = vendidoPorProducto.get(p.id) ?? 0;
        const denom = Math.max(stock, 1); // evita div/0
        const rot = vendido / denom;
        return {
          id: p.id,
          nombre: p.nombre,
          sku: p.sku,
          marca_repuesto: p.marca_repuesto,
          codigo_oem: p.codigo_oem,
          stock_actual: stock,
          costo_promedio: costo,
          precio_venta: precio,
          unidades_vendidas: vendido,
          rotacion: Math.round(rot * 100) / 100,
          banda: bandaDe(rot, vendido) as Banda,
          ingreso_estimado: vendido * precio,
        };
      })
      // Más vendidos primero.
      .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas);

    // Resumen
    const resumen = {
      total_productos: items.length,
      con_movimiento: items.filter((i) => i.unidades_vendidas > 0).length,
      sin_movimiento: items.filter((i) => i.unidades_vendidas === 0).length,
      unidades_vendidas_total: items.reduce((s, i) => s + i.unidades_vendidas, 0),
      ingreso_total: items.reduce((s, i) => s + i.ingreso_estimado, 0),
    };

    return NextResponse.json(successResponse({ items, dias, count: items.length, resumen }));
  } catch (err) {
    console.error("[/api/reportes/rotacion]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el reporte."), { status: 500 });
  }
}
