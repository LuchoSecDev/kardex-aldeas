import type { MarketListRow, MarketListState, MarketQuantities } from "@/types/market";

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
