import { supabase } from "./supabase";
import { Database } from "@/types/database";

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

  async verifyCommunityPin(name: string, pin: string) {
    return supabase.rpc("verify_community_pin", { p_name: name, p_pin: pin });
  },

  async claimPinForExistingCommunity(name: string, pin: string) {
    return supabase.rpc("claim_pin_for_existing_community", { p_name: name, p_pin: pin });
  },

  async loadKardexMonth(community: string, year: number, month: number) {
    return supabase
      .from("kardex_records")
      .select("*")
      .eq("community", community)
      .eq("year", year)
      .eq("month", month);
  },

  async loadAjustes(community: string, year: number, month: number) {
    return supabase
      .from("ajustes")
      .select("*")
      .eq("community", community)
      .eq("year", year)
      .eq("month", month)
      .order("created_at", { ascending: true });
  },
  
  async loadAjustesHistory(community: string, limit: number = 200) {
    return supabase
      .from("ajustes")
      .select("*")
      .eq("community", community)
      .order("created_at", { ascending: false })
      .limit(limit);
  },
  
  async loadMonthsWithData(community: string) {
    return supabase
      .from("kardex_records")
      .select("year, month")
      .eq("community", community);
  },

  async saveProductData(
    community: string,
    year: number,
    month: number,
    productId: string,
    exits: number[],
    entries: number[],
    prevBalances: number[]
  ) {
    return supabase
      .from("kardex_records")
      .upsert({
        community,
        year,
        month,
        product_id: productId,
        exits,
        entries,
        prev_balances: prevBalances,
        updated_at: new Date().toISOString()
      }, { onConflict: 'community, year, month, product_id' });
  },

  async insertAjuste(ajuste: Database['public']['Tables']['ajustes']['Insert']) {
    return supabase.from("ajustes").insert(ajuste);
  }
};
