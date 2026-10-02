// Lista de mercado (ver supabase/market_lists_N.sql y planes/003).
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

// Una nota de la zona de cambios de un tipo de lista (plan 008): p. ej. «pescado por pechuga». `item_id` es el
// producto al que se refiere (o null si es una nota general); `at` la pone el servidor.
export type MarketChange = { id: string; item_id: string | null; text: string; at?: string };

// Las notas de cada uno de los 4 tipos.
export type KindChanges = Record<MarketKind, MarketChange[]>;

// Respuesta de la nutricionista a una nota de cambio (plan 008, Fase D). `change_text` es el texto de la nota al responder
// (si la comunidad la cambia después, se avisa); `seen` = la comunidad ya la vio.
export type MarketReply = { change_id: string; text: string; change_text: string; at: string; seen: boolean };

// Una respuesta sin leer en la campanita de la comunidad.
export type MarketReplyNotification = {
  week_start: string;
  kind: MarketKind;
  change_id: string;
  change_text: string;
  item_name: string | null;
  reply_text: string;
  replied_at: string;
};

// Lo que la comunidad ve de UNA de las 4 listas de una semana.
export type MarketListRow = {
  kind: MarketKind;
  quantities: MarketQuantities;
  // Notas de cambio (copia de trabajo). Opcional: una respuesta del servidor anterior no las traía.
  changes?: MarketChange[];
  // Respuestas de la nutricionista a las notas de este tipo. Opcional (servidor anterior).
  replies?: MarketReply[];
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

// ---------------------------------------------------------------------------
// Panel de la nutricionista (ver supabase/market_admin_N.sql y planes/003, Fase C)
// ---------------------------------------------------------------------------

// Una fila del resumen de la semana: una por comunidad (incluye las que aún no envían).
export type AdminMarketRow = {
  community: string;
  participants: number | null;
  sent: boolean;
  submitted_at: string | null;
  first_submitted_at: string | null;
  submit_count: number;
  late: boolean;
  changed_after_deadline: boolean;
  reviewed: boolean;
  // La comunidad editó después de enviar (lo que se ve sigue siendo lo último enviado).
  has_unsent_changes: boolean;
  // Hay un borrador con cantidades pero nunca se ha enviado.
  has_draft: boolean;
  // Productos pedidos de cada tipo, de lo ENVIADO.
  counts: Record<MarketKind, number>;
  // Notas de cambio ENVIADAS (plan 008). Opcional por la misma razón que MarketListRow.changes.
  changes_count?: number;
};

export type AdminMarketOverview = {
  week_start: string;
  friday: string;
  deadline_at: string;
  kinds_due: MarketKind[] | null;
  communities: AdminMarketRow[];
};

export type AdminMarketItem = {
  id: string;
  name: string;
  unit: string;
  is_event: boolean;
  quantity: number;
};

// Una nota de cambio ENVIADA, con el nombre del producto cuando lo tiene (null = nota general).
export type AdminMarketChange = {
  id: string;
  item_id: string | null;
  item_name: string | null;
  unit: string | null;
  text: string;
  at: string;
  // Respuesta de la nutricionista (null/ausente = todavía sin respuesta).
  reply?: { text: string; at: string } | null;
};

// Lo que envió UNA comunidad en una semana: solo los productos pedidos, sin precios.
export type AdminMarketList = Omit<AdminMarketRow, "counts" | "has_draft" | "changes_count"> & {
  week_start: string;
  friday: string;
  deadline_at: string;
  kinds_due: MarketKind[] | null;
  lists: { kind: MarketKind; items: AdminMarketItem[]; changes?: AdminMarketChange[] }[];
};

// Una entrada de la campanita: lista enviada sin revisar (o reenviada con cambios).
export type AdminMarketNotification = {
  community: string;
  week_start: string;
  submitted_at: string;
  submit_count: number;
  late: boolean;
  changed_after_deadline: boolean;
};

// falta: venció el plazo y no envió · pendiente: aún hay tiempo · enviada: por revisar · revisada
export type AdminListState = "falta" | "pendiente" | "enviada" | "revisada";

// Una fila del consolidado: lo ENVIADO de un producto por una comunidad (sin precios).
export type AdminMarketConsolidatedRow = {
  community: string;
  kind: MarketKind;
  item_id: string;
  name: string;
  unit: string;
  is_event: boolean;
  sort_order: number;
  quantity: number;
};
