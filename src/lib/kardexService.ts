import { supabase } from "./supabase";
import { session } from "./session";
import { authedRpc } from "./authedRpc";
import { Database } from "@/types/database";
import type { AjusteRowData as AjusteRow, KardexRecordRow, RpcResult } from "./kardexDataSource";
import type { WeekSubmission } from "@/types/submissions";

type AjusteInsert = Omit<Database["public"]["Tables"]["ajustes"]["Insert"], "community">;

export const kardexService = {
  // (Las lecturas de datos de abajo cumplen KardexDataSource: la pantalla del
  // kardex las recibe como fuente de datos.)
  async loadProducts() {
    return supabase
      .from("products")
      .select("id,category,name,unit,minStock:min_stock")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
  },

  async loadCommunities() {
    return supabase.from("communities").select("name,has_pin").order("name");
  },

  // Devuelve el token de sesión, o null si el PIN es incorrecto (o la comunidad no
  // tiene PIN: ya no se puede entrar sin él).
  async loginCommunity(name: string, pin: string): Promise<RpcResult<string>> {
    const { data, error } = await supabase.rpc("login_community", { p_name: name, p_pin: pin });
    return { data: (data as string | null) ?? null, error };
  },

  async logoutCommunity() {
    const token = session.get();
    session.set(null);
    if (token) await supabase.rpc("logout_community", { p_token: token });
  },

  async loadKardexMonth(year: number, month: number) {
    return authedRpc<KardexRecordRow[]>("kardex_load_month", { p_year: year, p_month: month });
  },

  async loadAjustes(year: number, month: number) {
    return authedRpc<AjusteRow[]>("kardex_load_ajustes", { p_year: year, p_month: month });
  },

  async loadAjustesHistory(limit: number = 200) {
    return authedRpc<AjusteRow[]>("kardex_load_ajustes_history", { p_limit: limit });
  },

  async loadMonthsWithData() {
    return authedRpc<{ year: number; month: number }[]>("kardex_months_with_data");
  },

  async saveProductData(
    year: number,
    month: number,
    productId: string,
    exits: number[],
    entries: number[],
    prevBalances: number[]
  ) {
    return authedRpc<null>("kardex_save_product", {
      p_year: year,
      p_month: month,
      p_product_id: productId,
      p_exits: exits,
      p_entries: entries,
      p_prev_balances: prevBalances,
    });
  },

  // Semanas de un mes que la comunidad ya envió a la nutricionista.
  async loadWeekSubmissions(year: number, month: number) {
    return authedRpc<WeekSubmission[]>("kardex_week_submissions", { p_year: year, p_month: month });
  },

  // Envía (o reenvía) una semana. Responde SEMANA_VACIA si no tiene movimientos.
  async submitWeek(year: number, month: number, weekIndex: number) {
    return authedRpc<{ submitted_at: string; submit_count: number }>("kardex_submit_week", {
      p_year: year,
      p_month: month,
      p_week_index: weekIndex,
    });
  },

  async insertAjuste(ajuste: AjusteInsert) {
    return authedRpc<null>("kardex_insert_ajuste", {
      p_product_id: ajuste.product_id,
      p_year: ajuste.year,
      p_month: ajuste.month,
      p_week_index: ajuste.week_index,
      p_saldo_anterior: ajuste.saldo_anterior,
      p_saldo_nuevo: ajuste.saldo_nuevo,
      p_motivo: ajuste.motivo,
    });
  },
};
