import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { membreteA4 } from "@/lib/documentos/membrete";

/**
 * GET /api/recibos-dinero/[id]/pdf?auto=1
 * Recibo de dinero A4 imprimible (HTML). Documento interno NO fiscal.
 */
function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtMonto(n: unknown, moneda: string): string {
  const v = Number(n) || 0;
  return (moneda === "USD" ? "USD " : "Gs. ") + v.toLocaleString("es-PY", { maximumFractionDigits: moneda === "USD" ? 2 : 0 });
}
function fmtFecha(iso: unknown): string {
  if (!iso) return "—";
  try {
    return new Date(String(iso)).toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return String(iso);
  }
}
const METODO_LBL: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", cheque: "Cheque", otro: "Otro" };

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const auto = new URL(request.url).searchParams.get("auto") === "1";
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });

  const rq = await ctx.supabase
    .from("recibos_dinero")
    .select("*")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("id", id)
    .maybeSingle();
  if (rq.error || !rq.data) return new NextResponse("Recibo no encontrado", { status: 404 });
  const r = rq.data as Record<string, unknown>;

  const moneda = String(r.moneda ?? "PYG");
  const metodo = METODO_LBL[String(r.metodo_pago ?? "")] ?? (r.metodo_pago ?? "—");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.numero_recibo)} — Recibo de dinero</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  body{font-family:Georgia,"Times New Roman",Times,serif;color:#1f2937;background:#f3f4f6}
  .page{width:210mm;min-height:148mm;margin:0 auto;background:#fff;padding:18mm 18mm}
  .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #1f2937;padding-bottom:10px;margin-top:8px}
  .head .titulo{font-size:16px;font-weight:700;letter-spacing:.14em;color:#1f2937;text-transform:uppercase}
  .head .meta{text-align:right;font-size:12px;color:#374151;line-height:1.6}
  .head .meta .num{font-size:15px;font-weight:700;color:#1f2937;letter-spacing:.04em}
  .row{display:flex;gap:24px;margin-top:18px;font-size:13px}
  .row .l{color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:.10em;margin-bottom:2px}
  .row .v{color:#1f2937;font-weight:600;font-size:14px}
  .montobox{margin-top:18px;border-top:1px solid #d1d5db;border-bottom:1px solid #d1d5db;padding:14px 0;display:flex;justify-content:space-between;align-items:baseline}
  .montobox .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.10em;color:#6b7280}
  .montobox .val{font-size:22px;font-weight:700;color:#1f2937;letter-spacing:.02em;font-variant-numeric:tabular-nums}
  .det{margin-top:18px;font-size:12px;line-height:1.8;color:#374151}
  .det .k{display:inline-block;min-width:110px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-size:10px;vertical-align:middle}
  .firma{margin-top:60px;display:flex;justify-content:flex-end}
  .firma .linea{width:260px;border-top:1px solid #6b7280;text-align:center;padding-top:6px;font-size:11px;color:#374151}
  .legal{margin-top:32px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center;letter-spacing:.04em}
  .toolbar{position:sticky;top:0;background:#1f2937;padding:8px;text-align:center}
  .toolbar button{background:#fff;color:#1f2937;border:1px solid #fff;padding:6px 14px;border-radius:3px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
  @media print{body{background:#fff}.toolbar{display:none}.page{width:auto;min-height:auto;margin:0;padding:12mm}@page{size:A4;margin:12mm}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
<div class="page">
  ${membreteA4()}
  <div class="head">
    <div class="titulo">Recibo de dinero</div>
    <div class="meta">
      <div class="num">${esc(r.numero_recibo)}</div>
      <div>Fecha: ${fmtFecha(r.fecha)}</div>
    </div>
  </div>

  <div class="row">
    <div style="flex:1">
      <div class="l">Recibí de</div>
      <div class="v">${esc(r.cliente_nombre)}${r.cliente_documento ? ` <span style="color:#6b7280;font-weight:400">· ${esc(r.cliente_documento)}</span>` : ""}</div>
    </div>
  </div>

  <div class="montobox">
    <div class="lbl">Monto recibido</div>
    <div class="val">${fmtMonto(r.monto, moneda)}</div>
  </div>

  <div class="det">
    ${r.concepto ? `<div><span class="k">Concepto</span> ${esc(r.concepto)}</div>` : ""}
    <div><span class="k">Método de pago</span> ${esc(metodo)}</div>
    ${r.referencia ? `<div><span class="k">Referencia</span> ${esc(r.referencia)}</div>` : ""}
    ${r.observaciones ? `<div><span class="k">Observaciones</span> ${esc(r.observaciones)}</div>` : ""}
  </div>

  <div class="firma"><div class="linea">Recibido por${r.usuario_nombre ? `: ${esc(r.usuario_nombre)}` : ""}</div></div>

  <div class="legal">Documento interno · no reemplaza factura legal</div>
</div>
<script>try{ if (${auto ? "true" : "false"}) window.print(); }catch(e){}</script>
</body></html>`;

  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
