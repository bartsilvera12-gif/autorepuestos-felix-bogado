import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Registra el cobro también como un ingreso en la caja abierta actual (si la
 * hay), para que el arqueo cuadre. Best-effort: si falla, el cobro NO se
 * revierte porque el registro contable del cobro sí quedó — solo se pierde
 * la sincronización con caja y queda como warning en logs.
 */
async function registrarIngresoEnCaja(
  sb: AppSupabaseClient,
  empresaId: string,
  args: {
    monto: number;
    metodo: string;
    concepto: string;
    referencia: string | null;
    observacion: string | null;
    usuarioId: string | null;
    fechaPago: string;
  }
): Promise<void> {
  try {
    // Buscar caja abierta actual (una sola por empresa por índice único parcial).
    const cq = await sb
      .from("cajas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("estado", "abierta")
      .limit(1)
      .maybeSingle();
    if (cq.error || !cq.data) return; // no hay caja abierta → no se registra
    const cajaId = String((cq.data as { id: string }).id);

    const ins = await sb.from("caja_movimientos").insert({
      empresa_id: empresaId,
      caja_id: cajaId,
      tipo: "ingreso",
      concepto: args.concepto,
      monto: Math.round(args.monto),
      medio_pago: args.metodo,
      usuario_id: args.usuarioId,
      observacion: [args.observacion, args.referencia ? `Ref: ${args.referencia}` : ""]
        .filter(Boolean).join(" · ") || null,
      created_at: args.fechaPago,
    });
    if (ins.error) {
      console.error("[cobros] no se pudo registrar en caja_movimientos:", ins.error.message);
    }
  } catch (e) {
    console.error("[cobros] error registrando en caja (best-effort):", e instanceof Error ? e.message : e);
  }
}

export type MetodoPagoCobro = "efectivo" | "transferencia" | "tarjeta" | "otro";

export interface RegistrarCobroInput {
  cuenta_por_cobrar_id: string;
  monto: number;
  metodo_pago: MetodoPagoCobro;
  entidad_bancaria_id?: string | null;
  referencia?: string | null;
  titular?: string | null;
  observaciones?: string | null;
  fecha_pago?: string | null;
  usuario_id?: string | null;
  usuario_nombre?: string | null;
  entidad_nombre_snapshot?: string | null;
}

export class CobroError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CobroError";
    this.status = status;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function metodoValido(m: unknown): MetodoPagoCobro {
  return m === "transferencia" || m === "tarjeta" || m === "otro" ? m : "efectivo";
}

/**
 * Registra un cobro contra una cuenta por cobrar: inserta en `cobros_clientes`,
 * descuenta el saldo y recalcula el estado (pendiente|parcial|pagado).
 * No permite cobrar más que el saldo. NO toca stock ni ventas.
 */
export async function registrarCobro(
  sb: AppSupabaseClient,
  empresaId: string,
  input: RegistrarCobroInput
): Promise<{ cobro_id: string; saldo_nuevo: number; estado: string }> {
  const monto = round2(Number(input.monto) || 0);
  if (!(monto > 0)) throw new CobroError("El monto del cobro debe ser mayor a cero.");
  if (!input.cuenta_por_cobrar_id) throw new CobroError("Falta la cuenta por cobrar.");

  const cq = await sb
    .from("cuentas_por_cobrar")
    .select("id, cliente_id, venta_id, total, saldo, estado")
    .eq("empresa_id", empresaId)
    .eq("id", input.cuenta_por_cobrar_id)
    .maybeSingle();
  if (cq.error) throw new CobroError(cq.error.message, 500);
  if (!cq.data) throw new CobroError("Cuenta por cobrar no encontrada.", 404);
  const cxc = cq.data as {
    id: string;
    cliente_id: string;
    venta_id: string;
    total: number | string;
    saldo: number | string;
    estado: string;
  };

  if (cxc.estado === "anulado") throw new CobroError("La cuenta está anulada; no admite cobros.", 409);
  if (cxc.estado === "pagado") throw new CobroError("La cuenta ya está pagada.", 409);

  const saldoActual = round2(Number(cxc.saldo) || 0);
  const total = round2(Number(cxc.total) || 0);
  if (monto > saldoActual + 0.001) {
    throw new CobroError(`El monto (${monto}) supera el saldo pendiente (${saldoActual}).`);
  }

  const fechaPago =
    typeof input.fecha_pago === "string" && input.fecha_pago.trim() ? input.fecha_pago : new Date().toISOString();

  // 1) Insertar el cobro.
  const ins = await sb
    .from("cobros_clientes")
    .insert({
      empresa_id: empresaId,
      cliente_id: cxc.cliente_id,
      cuenta_por_cobrar_id: cxc.id,
      venta_id: cxc.venta_id,
      fecha_pago: fechaPago,
      monto,
      metodo_pago: metodoValido(input.metodo_pago),
      entidad_bancaria_id: input.entidad_bancaria_id || null,
      entidad_nombre_snapshot: input.entidad_nombre_snapshot?.trim() || null,
      referencia: input.referencia?.trim() || null,
      titular: input.titular?.trim() || null,
      observaciones: input.observaciones?.trim() || null,
      usuario_id: input.usuario_id || null,
      usuario_nombre: input.usuario_nombre?.trim() || null,
    })
    .select("id")
    .single();
  if (ins.error) throw new CobroError(ins.error.message, 500);
  const cobroId = String((ins.data as { id: string }).id);

  // 2) Recalcular saldo + estado.
  const saldoNuevo = round2(saldoActual - monto);
  const estadoNuevo = saldoNuevo <= 0.001 ? "pagado" : saldoNuevo < total ? "parcial" : "pendiente";
  const upd = await sb
    .from("cuentas_por_cobrar")
    .update({ saldo: saldoNuevo < 0 ? 0 : saldoNuevo, estado: estadoNuevo, updated_at: new Date().toISOString() })
    .eq("empresa_id", empresaId)
    .eq("id", cxc.id);
  if (upd.error) {
    // Rollback best-effort del cobro para no descuadrar el saldo.
    try {
      await sb.from("cobros_clientes").delete().eq("id", cobroId).eq("empresa_id", empresaId);
    } catch {}
    throw new CobroError(upd.error.message, 500);
  }

  // 3) Registrar el cobro como INGRESO en la caja abierta (si hay).
  //    Sin esto el cobro no aparecía en el arqueo → la caja "faltaba" plata
  //    respecto al efectivo real cuando el cajero cobraba una CxC vieja.
  //    Best-effort: no revierte el cobro si falla el registro en caja.
  // Buscar N° de venta para armar concepto claro.
  let numeroVenta: string | null = null;
  try {
    const vq = await sb
      .from("ventas")
      .select("numero_control")
      .eq("empresa_id", empresaId)
      .eq("id", cxc.venta_id)
      .maybeSingle();
    if (!vq.error && vq.data) {
      numeroVenta = String((vq.data as { numero_control: string }).numero_control);
    }
  } catch { /* opcional */ }

  await registrarIngresoEnCaja(sb, empresaId, {
    monto,
    metodo: metodoValido(input.metodo_pago),
    concepto: numeroVenta
      ? `Cobro cuenta por cobrar · Venta ${numeroVenta}`
      : "Cobro cuenta por cobrar",
    referencia: input.referencia?.trim() || null,
    observacion: input.observaciones?.trim() || null,
    usuarioId: input.usuario_id || null,
    fechaPago,
  });

  return { cobro_id: cobroId, saldo_nuevo: saldoNuevo < 0 ? 0 : saldoNuevo, estado: estadoNuevo };
}
