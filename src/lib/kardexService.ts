import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { session } from "./session";
import { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type KardexRecordRow = Tables["kardex_records"]["Row"];
type AjusteRow = Tables["ajustes"]["Row"];
type AjusteInsert = Omit<Tables["ajustes"]["Insert"], "community">;

type RpcResult<T> = { data: T | null; error: PostgrestError | null };

// Llama a una función de datos de Supabase adjuntando el token de sesión. La
// comunidad NO se envía: el servidor la deduce del token, así una sesión
// nunca puede tocar datos de otra comunidad.
async function authedRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(fn, { p_token: session.get(), ...args });
  if (error?.message?.includes("SESION_INVALIDA")) session.notifyExpired();
  return { data: data as T | null, error };
}

export const kardexService = {
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

  async createCommunityWithPin(name: string, pin: string) {
    return supabase.rpc("create_community_with_pin", { p_name: name, p_pin: pin });
  },

  async claimPinForExistingCommunity(name: string, pin: string) {
    return supabase.rpc("claim_pin_for_existing_community", { p_name: name, p_pin: pin });
  },

  // Devuelve el token de sesión, o null si el PIN es incorrecto. Con una
  // comunidad sin PIN se puede llamar sin PIN.
  async loginCommunity(name: string, pin?: string): Promise<RpcResult<string>> {
    const { data, error } = await supabase.rpc("login_community", { p_name: name, p_pin: pin ?? null });
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
