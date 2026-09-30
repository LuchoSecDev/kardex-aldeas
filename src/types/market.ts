// Lista de mercado (ver supabase/market_lists.sql y planes/003).
import type { MarketKind } from "@/lib/marketCalendar";

export type { MarketKind };

// Un ítem del catálogo de la lista (sin precios).
export type MarketItem = {
  id: string;
  kind: MarketKind;
  name: string;
  unit: string;
  is_event: boolean;
  sort_order: number;
};

// Cantidades por ítem: {item_id: cantidad}; solo las distintas de cero.
export type MarketQuantities = Record<string, number>;

// Lo que la comunidad ve de UNA de las 4 listas de una semana.
export type MarketListRow = {
  kind: MarketKind;
  quantities: MarketQuantities;
  // Alguna vez se envió.
  sent: boolean;
  // Se editó después de enviarla (hay cambios sin enviar).
  modified: boolean;
  submitted_at: string | null;
  first_submitted_at: string | null;
  submit_count: number;
  late: boolean;
  changed_after_deadline: boolean;
};

// Respuesta de market_list_load: todo lo de una semana.
export type MarketWeek = {
  week_start: string; // lunes
  friday: string; // viernes de pedido
  deadline_at: string;
  // Tipos que se piden ese viernes según el calendario sembrado; null si ese viernes no está sembrado.
  kinds_due: MarketKind[] | null;
  // Participantes fijos de la comunidad; null si aún no los ha registrado.
  participants: number | null;
  lists: MarketListRow[];
};

export type MarketSubmitResult = {
  submitted_at: string;
  late: boolean;
  changed_after_deadline: boolean;
};

// borrador: nunca enviada · enviada: sin cambios desde el envío · modificada: hay cambios sin enviar
export type MarketListState = "borrador" | "enviada" | "modificada";
