import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * Reporte "Productos sin movimiento" (stock muerto).
 *
 * GET /api/reportes/sin-movimiento?dias=90
 *
 * Devuelve la lista de productos activos con stock > 0 que NO tuvieron
 * salidas (movimientos_inventario.tipo='SALIDA') en los últimos N días.
 * Crítico en autopartes: identifica capital inmovilizado en estantería.
 *
 * Para cada producto se incluye:
 *  - stock_actual, costo_promedio, valor_inmovilizado (stock × costo)
 *  - dias_sin_movimiento (días desde la última salida, o null si nunca)
 *  - ultima_salida_fecha (ISO o null)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const url = new URL(request.url);
    const diasRaw = parseInt(url.searchParams.get("dias") ?? "90", 10);
    const dias = Number.isFinite(diasRaw) && diasRaw > 0 && diasRaw <= 3650 ? diasRaw : 90;

    const corte = new Date(Date.now() - dias * 86400000).toISOString();

    // 1) Productos candidatos: activos, con stock real y que se valoricen.
    const prodQ = await supabase
      .from("productos")
      .select(
        "id, nombre, sku, marca_repuesto, codigo_oem, stock_actual, costo_promedio, " +
        "categoria_principal_id, proveedor_principal_id"
      )
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .eq("controla_stock", true)
      .gt("stock_actual", 0);
    if (prodQ.error) throw new Error(prodQ.error.message);
    const productos = ((prodQ.data ?? []) as unknown) as Array<{
      id: string; nombre: string; sku: string;
      marca_repuesto: string | null; codigo_oem: string | null;
      stock_actual: number; costo_promedio: number;
      categoria_principal_id: string | null; proveedor_principal_id: string | null;
    }>;
    if (productos.length === 0) {
      return NextResponse.json(successResponse({ items: [], dias, corte, count: 0 }));
    }
    const ids = productos.map((p) => p.id);

    // 2) Productos con salida en los últimos N días → exclusión.
    //    NOTA: no se puede pasar todos los `ids` como .in() porque con miles de
    //    productos la URL supera el límite de Cloudflare/Traefik y da 520.
    //    Traemos TODAS las SALIDAs en el rango (empresa) y filtramos en JS.
    //    Se excluyen SALIDAs anuladas (columna nueva `estado`, con fallback
    //    por si PostgREST aún no la ve).
    const idSet = new Set(ids);
    const CHUNK = 1000;
    const fetchMovsPage = async (withEstado: boolean, offset: number) => {
      let q = supabase
        .from("movimientos_inventario")
        .select("producto_id")
        .eq("empresa_id", empresaId)
        .eq("tipo", "SALIDA")
        .gte("fecha", corte)
        .range(offset, offset + CHUNK - 1);
      if (withEstado) q = q.eq("estado", "activa");
      return q;
    };
    let useEstado = true;
    let firstPage = await fetchMovsPage(true, 0);
    if (firstPage.error) {
      console.warn("[/api/reportes/sin-movimiento] fallback sin filtro estado:", firstPage.error.message);
      useEstado = false;
      firstPage = await fetchMovsPage(false, 0);
      if (firstPage.error) throw new Error(firstPage.error.message);
    }
    const conMov = new Set<string>();
    const pushRows = (rows: Array<{ producto_id: string }>) => {
      for (const r of rows) {
        const pid = String(r.producto_id);
        if (idSet.has(pid)) conMov.add(pid);
      }
    };
    pushRows((firstPage.data ?? []) as Array<{ producto_id: string }>);
    let off = CHUNK;
    while ((firstPage.data ?? []).length === CHUNK && off < 200_000) {
      firstPage = await fetchMovsPage(useEstado, off);
      if (firstPage.error) throw new Error(firstPage.error.message);
      pushRows((firstPage.data ?? []) as Array<{ producto_id: string }>);
      off += CHUNK;
    }
    const sinMovIds = ids.filter((id) => !conMov.has(id));

    // 3) Última salida (cualquier fecha) para cada producto sin movimiento reciente.
    //    Mismo criterio: traigo todas las SALIDAs de la empresa ordenadas DESC y
    //    tomo la primera de cada producto en `sinMovIds`.
    const ultimaSalida = new Map<string, string>();
    if (sinMovIds.length > 0) {
      const sinMovSet = new Set(sinMovIds);
      const fetchUltPage = async (withEstado: boolean, offset: number) => {
        let q = supabase
          .from("movimientos_inventario")
          .select("producto_id, fecha")
          .eq("empresa_id", empresaId)
          .eq("tipo", "SALIDA")
          .order("fecha", { ascending: false })
          .range(offset, offset + CHUNK - 1);
        if (withEstado) q = q.eq("estado", "activa");
        return q;
      };
      let usarEst = true;
      let pg = await fetchUltPage(true, 0);
      if (pg.error) {
        usarEst = false;
        pg = await fetchUltPage(false, 0);
        if (pg.error) throw new Error(pg.error.message);
      }
      const pushUlt = (rows: Array<{ producto_id: string; fecha: string }>) => {
        for (const r of rows) {
          const pid = String(r.producto_id);
          if (sinMovSet.has(pid) && !ultimaSalida.has(pid)) ultimaSalida.set(pid, r.fecha);
        }
      };
      pushUlt((pg.data ?? []) as Array<{ producto_id: string; fecha: string }>);
      let uoff = CHUNK;
      // corta cuando todos los sinMovIds ya tienen última salida o se acaban páginas
      while ((pg.data ?? []).length === CHUNK && ultimaSalida.size < sinMovIds.length && uoff < 200_000) {
        pg = await fetchUltPage(usarEst, uoff);
        if (pg.error) throw new Error(pg.error.message);
        pushUlt((pg.data ?? []) as Array<{ producto_id: string; fecha: string }>);
        uoff += CHUNK;
      }
    }

    const ahora = Date.now();
    const items = productos
      .filter((p) => !conMov.has(p.id))
      .map((p) => {
        const stock = Number(p.stock_actual) || 0;
        const costo = Number(p.costo_promedio) || 0;
        const valor = stock * costo;
        const ult = ultimaSalida.get(p.id) ?? null;
        const diasSin = ult ? Math.floor((ahora - new Date(ult).getTime()) / 86400000) : null;
        return {
          id: p.id,
          nombre: p.nombre,
          sku: p.sku,
          marca_repuesto: p.marca_repuesto,
          codigo_oem: p.codigo_oem,
          stock_actual: stock,
          costo_promedio: costo,
          valor_inmovilizado: valor,
          ultima_salida_fecha: ult,
          dias_sin_movimiento: diasSin, // null si nunca tuvo salida
        };
      })
      // Más capital inmovilizado primero.
      .sort((a, b) => b.valor_inmovilizado - a.valor_inmovilizado);

    const valorTotal = items.reduce((s, x) => s + x.valor_inmovilizado, 0);
    return NextResponse.json(
      successResponse({ items, count: items.length, dias, corte, valor_total_inmovilizado: valorTotal })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/reportes/sin-movimiento]", msg);
    return NextResponse.json(errorResponse(`No se pudo cargar el reporte: ${msg}`), { status: 500 });
  }
}
