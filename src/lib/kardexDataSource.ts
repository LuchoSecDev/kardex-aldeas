import type { PostgrestError } from "@supabase/supabase-js";
import { Database } from "@/types/database";

export type RpcResult<T> = { data: T | null; error: PostgrestError | null };

export type KardexRecordRow = Database["public"]["Tables"]["kardex_records"]["Row"];
export type AjusteRowData = Database["public"]["Tables"]["ajustes"]["Row"];

// De dónde lee sus datos la pantalla del kardex. La comunidad lee lo suyo con
// su token (kardexService); la nutricionista lee el de cualquier comunidad con
// el suyo (adminService.dataSourceFor). Así se reutiliza la misma pantalla y el
// mismo cálculo de saldos en los dos casos.
export interface KardexDataSource {
  loadKardexMonth(year: number, month: number): Promise<RpcResult<KardexRecordRow[]>>;
  loadAjustes(year: number, month: number): Promise<RpcResult<AjusteRowData[]>>;
  loadAjustesHistory(limit?: number): Promise<RpcResult<AjusteRowData[]>>;
  loadMonthsWithData(): Promise<RpcResult<{ year: number; month: number }[]>>;
}
