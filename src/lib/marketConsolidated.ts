import { MARKET_KINDS, type MarketKind } from "@/lib/marketCalendar";
import { filterItems } from "@/lib/marketList";
import type { AdminMarketConsolidatedRow } from "@/types/market";

// Consolidado de la lista de mercado entre comunidades (plan 003, Fase D): por producto, el total
// de lo que enviaron todas las comunidades esa semana y el detalle por comunidad. Sin precios.
// La base de datos devuelve una fila por (comunidad, producto); aquí se suma.

export interface ConsolidatedItem {
  id: string;
  name: string;
  unit: string;
  isEvent: boolean;
  sortOrder: number;
  total: number;
  byCommunity: { community: string; quantity: number }[];
}

export type ConsolidatedByKind = Record<MarketKind, ConsolidatedItem[]>;

// Hay medias unidades (0.5): la coma flotante da restos como 0.30000000000000004.
const round2 = (n: number) => Math.round(n * 100) / 100;

const byName = (a: string, b: string) => a.localeCompare(b, "es");

export function aggregateConsolidated(rows: AdminMarketConsolidatedRow[]): ConsolidatedByKind {
  const maps: Record<MarketKind, Map<string, ConsolidatedItem>> = {
    fruver: new Map(), carnes: new Map(), abarrotes: new Map(), aseo: new Map(),
  };

  for (const row of rows) {
    if (!(row.quantity > 0)) continue;
    const map = maps[row.kind];
    let item = map.get(row.item_id);
    if (!item) {
      item = { id: row.item_id, name: row.name, unit: row.unit, isEvent: row.is_event, sortOrder: row.sort_order, total: 0, byCommunity: [] };
      map.set(row.item_id, item);
    }
    item.total += row.quantity;
    item.byCommunity.push({ community: row.community, quantity: row.quantity });
  }

  const result = { fruver: [], carnes: [], abarrotes: [], aseo: [] } as ConsolidatedByKind;
  for (const kind of MARKET_KINDS) {
    result[kind] = Array.from(maps[kind].values())
      .map((item) => ({
        ...item,
        total: round2(item.total),
        byCommunity: item.byCommunity.sort((a, b) => byName(a.community, b.community)),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return result;
}

// Comunidades que aparecen en el consolidado (las que enviaron algo), en orden alfabético.
export const communitiesIn = (rows: Pick<AdminMarketConsolidatedRow, "community">[]): string[] =>
  Array.from(new Set(rows.map((r) => r.community))).sort(byName);

// Comunidades que pidieron algo de un tipo (para las columnas del Excel de ese tipo).
export const communitiesOfKind = (items: ConsolidatedItem[]): string[] =>
  Array.from(new Set(items.flatMap((i) => i.byCommunity.map((c) => c.community)))).sort(byName);

// Cuántos productos distintos se pidieron de cada tipo.
export const countsByKind = (byKind: ConsolidatedByKind): Record<MarketKind, number> => ({
  fruver: byKind.fruver.length, carnes: byKind.carnes.length, abarrotes: byKind.abarrotes.length, aseo: byKind.aseo.length,
});

export const filterConsolidated = (items: ConsolidatedItem[], query: string): ConsolidatedItem[] => {
  const matching = new Set(filterItems(items.map((i) => ({ id: i.id, name: i.name, kind: "fruver" as const, unit: i.unit, is_event: i.isEvent, sort_order: i.sortOrder })), query).map((i) => i.id));
  return items.filter((i) => matching.has(i.id));
};
