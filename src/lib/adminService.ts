import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { adminSession } from "./adminSession";
import type { AjusteRowData, KardexDataSource, KardexRecordRow, RpcResult } from "./kardexDataSource";
import type { AdminNotification, AdminWeekStatus } from "@/types/submissions";
import type {
  AdminMarketConsolidatedRow,
  AdminMarketList,
  AdminMarketNotification,
  AdminMarketOverview,
  MarketItem,
} from "@/types/market";
import type { WeeklyRow } from "./weeklySummary";

export type AdminLoginResult = { token: string; must_change: boolean };
export type PasswordResult = { ok: boolean; recovery_code: string | null };

// Llama a una función de administradora adjuntando su token de sesión.
async function adminRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(fn, { p_token: adminSession.get(), ...args });
  if (error?.message?.includes("SESION_ADMIN_INVALIDA")) adminSession.notifyExpired();
  return { data: data as T | null, error };
}

// Convierte el error del servidor en un mensaje para mostrar a la persona.
export function adminErrorMessage(error: PostgrestError): string {
  const message = error.message ?? "";
  if (message.includes("ADMIN_BLOQUEADO")) {
    return "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.";
  }
  // Mensajes de validación pensados para mostrarse tal cual.
  if (message.startsWith("Contraseña inválida") || message.startsWith("La nueva contraseña")) {
    return message;
  }
  return "No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.";
}

// Una fila del resumen de comunidades (ver supabase/admin_read.sql).
export type CommunityOverview = {
  name: string;
  has_pin: boolean;
  last_update: string | null;
  products_count: number;
  // weeks_active[i]: la semana i (0..5) tiene alguna entrada o salida (la 5 es la de cierre; la
  // pantalla solo la muestra en los meses que la tienen).
  weeks_active: boolean[];
};

export const adminService = {
  // Resumen semanal: una fila por (comunidad, producto) de UNA semana. Con
  // onlySent = true, solo las comunidades que ya enviaron esa semana.
  async weeklyTotals(year: number, month: number, weekIndex: number, onlySent: boolean) {
    return adminRpc<WeeklyRow[]>("admin_weekly_totals", {
      p_year: year,
      p_month: month,
      p_week_index: weekIndex,
      p_only_sent: onlySent,
    });
  },

  // Estado de las semanas enviadas de todas las comunidades en un mes.
  async listWeekStatuses(year: number, month: number) {
    return adminRpc<AdminWeekStatus[]>("admin_week_statuses", { p_year: year, p_month: month });
  },

  // La campanita: envíos sin revisar o modificados después.
  async listNotifications() {
    return adminRpc<AdminNotification[]>("admin_notifications");
  },

  async markReviewed(submissionId: string) {
    return adminRpc<null>("admin_mark_reviewed", { p_id: submissionId });
  },

  // --- Listas de mercado (plan 003, Fase C) ---

  // Resumen de la semana: una fila por comunidad (enviaron o no).
  async marketOverview(weekStart: string) {
    return adminRpc<AdminMarketOverview>("admin_market_overview", { p_week_start: weekStart });
  },

  // Lo que envió UNA comunidad esa semana (solo los productos pedidos).
  async marketList(community: string, weekStart: string) {
    return adminRpc<AdminMarketList>("admin_market_list", { p_community: community, p_week_start: weekStart });
  },

  async markMarketReviewed(community: string, weekStart: string) {
    return adminRpc<null>("admin_market_mark_reviewed", { p_community: community, p_week_start: weekStart });
  },

  // Lo enviado por todas las comunidades esa semana, una fila por (comunidad, producto).
  async marketConsolidated(weekStart: string) {
    return adminRpc<AdminMarketConsolidatedRow[]>("admin_market_consolidated", { p_week_start: weekStart });
  },

  // Catálogo completo de la lista (sin precios), para el Excel con el formato actual.
  async marketCatalog() {
    return adminRpc<MarketItem[]>("admin_market_catalog");
  },

  // La campanita: listas de mercado enviadas y sin revisar.
  async listMarketNotifications() {
    return adminRpc<AdminMarketNotification[]>("admin_market_notifications");
  },

  async listCommunities(year: number, month: number) {
    return adminRpc<CommunityOverview[]>("admin_communities_overview", { p_year: year, p_month: month });
  },

  // Fuente de datos de UNA comunidad para la pantalla del kardex en solo
  // lectura. Devuelve un objeto nuevo cada vez: quien la use en un componente
  // debe memorizarla (useMemo) para no recargar en cada render.
  dataSourceFor(community: string): KardexDataSource {
    return {
      loadKardexMonth: (year, month) =>
        adminRpc<KardexRecordRow[]>("admin_load_month", { p_community: community, p_year: year, p_month: month }),
      loadAjustes: (year, month) =>
        adminRpc<AjusteRowData[]>("admin_load_ajustes", { p_community: community, p_year: year, p_month: month }),
      loadAjustesHistory: (limit = 200) =>
        adminRpc<AjusteRowData[]>("admin_load_ajustes_history", { p_community: community, p_limit: limit }),
      loadMonthsWithData: () =>
        adminRpc<{ year: number; month: number }[]>("admin_months_with_data", { p_community: community }),
    };
  },

  async login(password: string): Promise<RpcResult<AdminLoginResult>> {
    const { data, error } = await supabase.rpc("admin_login", { p_password: password });
    return { data: (data as AdminLoginResult | null) ?? null, error };
  },

  async changePassword(current: string, next: string) {
    return adminRpc<PasswordResult>("admin_change_password", { p_current: current, p_new: next });
  },

  async recoverPassword(code: string, next: string): Promise<RpcResult<PasswordResult>> {
    const { data, error } = await supabase.rpc("admin_recover_password", { p_code: code, p_new: next });
    return { data: data as PasswordResult | null, error };
  },

  async logout() {
    const token = adminSession.get();
    adminSession.set(null);
    if (token) await supabase.rpc("admin_logout", { p_token: token });
  },
};
