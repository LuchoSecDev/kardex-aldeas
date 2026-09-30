import { authedRpc } from "./authedRpc";
import type { MarketItem, MarketQuantities, MarketSubmitResult, MarketWeek } from "@/types/market";
import type { MarketKind } from "./marketCalendar";

// Acceso a la lista de mercado (ver supabase/market_lists.sql). Como en el
// kardex, la comunidad nunca se envía: el servidor la deduce del token.
export const marketService = {
  loadCatalog() {
    return authedRpc<MarketItem[]>("market_catalog");
  },

  // Todo lo de una semana (`weekStart` = lunes de la semana de entrega).
  loadWeek(weekStart: string) {
    return authedRpc<MarketWeek>("market_list_load", { p_week_start: weekStart });
  },

  // Guardado automático de un tipo de lista.
  saveList(weekStart: string, kind: MarketKind, quantities: MarketQuantities) {
    return authedRpc<null>("market_list_save", { p_week_start: weekStart, p_kind: kind, p_quantities: quantities });
  },

  setParticipants(participants: number) {
    return authedRpc<null>("market_set_participants", { p_participants: participants });
  },

  // Envía las 4 listas de la semana. Responde PARTICIPANTES_REQUERIDOS o LISTA_VACIA.
  submitWeek(weekStart: string) {
    return authedRpc<MarketSubmitResult>("market_list_submit", { p_week_start: weekStart });
  },
};
