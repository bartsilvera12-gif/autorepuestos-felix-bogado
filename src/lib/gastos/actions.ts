import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getEmpresaId } from "@/lib/db/empresa";
import { ymdInicioFinMesLocal } from "@/lib/fechas/calendario";
import { getBrowserSupabaseForEmpresaData } from "@/lib/supabase/browser-data-client";

export type Gasto = {
  id: string;
  empresa_id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "fijo" | "variable";
  recurrente: boolean;
  frecuencia?: string;
  fecha: string;
  created_at: string;
};

export type GastoInput = {
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "fijo" | "variable";
  recurrente: boolean;
  frecuencia?: string;
  fecha: string;
};

function mapRow(r: Record<string, unknown>): Gasto {
  return {
    id: r.id as string,
    empresa_id: r.empresa_id as string,
    categoria: (r.categoria as string) ?? "",
    descripcion: (r.descripcion as string) ?? "",
    monto: Number(r.monto) ?? 0,
    tipo: (r.tipo as "fijo" | "variable") ?? "variable",
    recurrente: Boolean(r.recurrente),
    frecuencia: r.frecuencia as string | undefined,
    fecha: (r.fecha as string) ?? "",
    created_at: (r.created_at as string) ?? "",
  };
}

/** Obtiene todos los gastos de la empresa, ordenados por fecha desc. */
export async function getGastos(): Promise<Gasto[]> {
  if (typeof window !== "undefined") {
    const res = await fetchWithSupabaseSession("/api/gastos", { cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `Error ${res.status}`);
    }
    const json = (await res.json()) as { success?: boolean; data?: Record<string, unknown>[] };
    if (!json.success || !Array.isArray(json.data)) return [];
    return json.data.map(mapRow);
  }

  const supabase = await getBrowserSupabaseForEmpresaData();
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** Obtiene los gastos del mes actual (para Dashboard). RLS filtra por empresa. */
export async function getGastosMesActual(): Promise<Gasto[]> {
  const supabase = await getBrowserSupabaseForEmpresaData();
  const hoy = new Date();
  const { inicioYmd: inicioMes, finYmd: finMes } = ymdInicioFinMesLocal(hoy);

  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .gte("fecha", inicioMes)
    .lte("fecha", finMes)
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function createGasto(input: GastoInput): Promise<Gasto> {
  if (input.monto <= 0) throw new Error("El monto debe ser mayor a 0");
  const res = await fetchWithSupabaseSession("/api/gastos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      categoria: input.categoria.trim(),
      descripcion: input.descripcion.trim(),
      monto: input.monto,
      tipo: input.tipo,
      recurrente: input.recurrente,
      frecuencia: input.frecuencia?.trim() ?? "",
      fecha: input.fecha,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !(j as { success?: boolean }).success) {
    throw new Error((j as { error?: string }).error ?? `Error ${res.status}`);
  }
  return mapRow((j as { data: Record<string, unknown> }).data);
}

export async function updateGasto(id: string, input: Partial<GastoInput>): Promise<Gasto> {
  if (input.monto !== undefined && input.monto <= 0) throw new Error("El monto debe ser mayor a 0");
  const res = await fetchWithSupabaseSession(`/api/gastos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !(j as { success?: boolean }).success) {
    throw new Error((j as { error?: string }).error ?? `Error ${res.status}`);
  }
  return mapRow((j as { data: Record<string, unknown> }).data);
}

export async function deleteGasto(id: string): Promise<void> {
  const res = await fetchWithSupabaseSession(`/api/gastos/${id}`, { method: "DELETE" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !(j as { success?: boolean }).success) {
    throw new Error((j as { error?: string }).error ?? `Error ${res.status}`);
  }
}
