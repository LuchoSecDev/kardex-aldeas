import { MARKET_KINDS, MARKET_KIND_LABEL, kindsDueOnFriday } from "@/lib/marketCalendar";
import type { MarketKind } from "@/lib/marketCalendar";
import type { KindChanges, MarketChange, MarketItem, MarketListRow, MarketListState, MarketQuantities } from "@/types/market";

// Estado de una lista a partir de su fila (undefined = nunca se guardó nada).
export function getListState(row: Pick<MarketListRow, "sent" | "modified"> | undefined): MarketListState {
  if (!row || !row.sent) return "borrador";
  return row.modified ? "modificada" : "enviada";
}

export const LIST_STATE_LABEL: Record<MarketListState, string> = {
  borrador: "Sin enviar",
  enviada: "Enviada",
  modificada: "Con cambios sin enviar",
};

// Cantidad de ítems pedidos (con cantidad mayor que cero).
export const countOrdered = (quantities: MarketQuantities) =>
  Object.values(quantities).filter((q) => q > 0).length;

// Limpia lo que escribe la persona: descarta vacíos, negativos y no numéricos
// (el servidor hace la misma limpieza; esto evita mandarle basura).
export function cleanQuantities(raw: Record<string, number | string | null | undefined>): MarketQuantities {
  const clean: MarketQuantities = {};
  for (const [id, value] of Object.entries(raw)) {
    const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) clean[id] = n;
  }
  return clean;
}

// ¿Hay algo para enviar entre las 4 listas?
export const hasAnyOrder = (lists: Pick<MarketListRow, "quantities">[]) =>
  lists.some((l) => countOrdered(l.quantities) > 0);

// ---------------------------------------------------------------------------
// Utilidades de la pantalla de la lista de mercado
// ---------------------------------------------------------------------------

// Sin tildes ni mayúsculas, para que "lacteos" encuentre "LÁCTEOS" y "papa" a "PAPÁ".
export const normalizeText = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterItems(items: MarketItem[], query: string): MarketItem[] {
  const q = normalizeText(query);
  if (!q) return items;
  return items.filter((item) => normalizeText(item.name).includes(q));
}

// Lo que se escribe en los campos: texto por ítem ("2,5"), no números, para que
// se pueda teclear "0," sin que el campo se rompa.
export type QuantityDrafts = Record<string, string>;

export const draftsFromQuantities = (quantities: MarketQuantities): QuantityDrafts =>
  Object.fromEntries(Object.entries(quantities).map(([id, q]) => [id, String(q).replace(".", ",")]));

// Deja pasar solo dígitos y un separador decimal (punto o coma): lo que cabe en una cantidad.
export function sanitizeQuantityInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  const firstSeparator = cleaned.search(/[.,]/);
  if (firstSeparator === -1) return cleaned;
  return cleaned.slice(0, firstSeparator + 1) + cleaned.slice(firstSeparator + 1).replace(/[.,]/g, "");
}

export type KindDrafts = Record<MarketKind, QuantityDrafts>;

export const emptyKindDrafts = (): KindDrafts => ({ fruver: {}, carnes: {}, abarrotes: {}, aseo: {} });

// Cuántos ítems se pidieron de cada tipo (para las pestañas y la confirmación de envío).
export const summarizeByKind = (drafts: KindDrafts) =>
  MARKET_KINDS.map((kind) => ({
    kind,
    label: MARKET_KIND_LABEL[kind],
    count: countOrdered(cleanQuantities(drafts[kind])),
  }));

// ---------------------------------------------------------------------------
// Zona de cambios (plan 008): notas del pedido, p. ej. «pescado por pechuga»
// ---------------------------------------------------------------------------

// Mismos límites que valida el servidor (supabase/market_changes_1.sql).
export const MAX_CHANGES = 20;
export const MAX_CHANGE_TEXT = 200;

export const emptyKindChanges = (): KindChanges => ({ fruver: [], carnes: [], abarrotes: [], aseo: [] });

// Espacios y saltos de línea repetidos se juntan en uno (igual que el servidor).
export const normalizeChangeText = (raw: string) => raw.replace(/\s+/g, " ").trim();

// Id de una nota nueva: solo letras y números, de 19 caracteres (el servidor acepta hasta 40).
export function newChangeId(): string {
  const bytes = new Uint8Array(9);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return "c" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

// Lo que se guarda: texto normalizado y cortado a 200, sin notas vacías y a lo más 20. Si ya se cargó el catálogo,
// una nota ligada a un producto que ya no está activo pierde ese vínculo (si no, el servidor rechazaría el guardado).
export function cleanChanges(changes: MarketChange[], knownItemIds?: ReadonlySet<string>): MarketChange[] {
  const clean: MarketChange[] = [];
  for (const change of changes) {
    const text = normalizeChangeText(change.text).slice(0, MAX_CHANGE_TEXT).trim();
    if (!text) continue;
    const linked = change.item_id && (!knownItemIds || knownItemIds.size === 0 || knownItemIds.has(change.item_id));
    clean.push({ id: change.id, item_id: linked ? change.item_id : null, text, ...(change.at ? { at: change.at } : {}) });
    if (clean.length === MAX_CHANGES) break;
  }
  return clean;
}

export const countChanges = (changes: KindChanges) => MARKET_KINDS.reduce((sum, kind) => sum + changes[kind].length, 0);

export const changesForItem = (changes: MarketChange[], itemId: string) => changes.filter((c) => c.item_id === itemId);

// Cuántas notas lleva cada tipo (para la confirmación de envío).
export const summarizeChangesByKind = (changes: KindChanges) =>
  MARKET_KINDS.map((kind) => ({ kind, label: MARKET_KIND_LABEL[kind], count: changes[kind].length }));

// Tipos que se piden el viernes de la semana: el calendario sembrado o, si ese
// viernes no está sembrado, la regla del cronograma.
export const resolveKindsDue = (kindsDue: MarketKind[] | null, friday: string): MarketKind[] =>
  kindsDue ?? kindsDueOnFriday(friday);

// "viernes, 2 de octubre, 5:00 p. m." (hora de Bogotá)
export function formatDeadline(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Mensaje para la persona cuando el servidor rechaza el envío.
export function submitErrorMessage(message: string | undefined): string {
  if (message?.includes("PARTICIPANTES_REQUERIDOS"))
    return "Antes de enviar, escribe cuántos participantes tiene tu comunidad.";
  if (message?.includes("LISTA_VACIA")) return "La lista está vacía: escribe la cantidad de al menos un producto.";
  if (message?.includes("Semana inválida")) return "La semana elegida no es válida.";
  return "No se pudo enviar la lista. Revisa tu conexión e inténtalo de nuevo.";
}

// Participantes: entero entre 1 y 500 (mismo rango que valida el servidor).
export function parseParticipants(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 1 && n <= 500 ? n : null;
}
