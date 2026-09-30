// Genera supabase/market_seed.sql (catálogo de la lista de mercado + calendario
// de pedidos 2026) a partir de planes/anexos/lista-mercado-catalogo.json y de
// las reglas de src/lib/marketCalendar.ts.
//
//   npm run seed:market
//
// El archivo generado se commitea; tests/unit/marketSeed.test.ts falla si deja de
// coincidir con lo que produciría este script (así el SQL y las reglas no se separan).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MARKET_KINDS, buildCalendarSeed, renderCalendarSeedSql } from "../src/lib/marketCalendar.ts";
import type { MarketKind } from "../src/lib/marketCalendar.ts";

export interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  isEvent: boolean;
}
export type Catalog = { kinds: Record<MarketKind, { items: CatalogItem[] }> };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CATALOG_PATH = path.join(ROOT, "planes/anexos/lista-mercado-catalogo.json");
export const SEED_PATH = path.join(ROOT, "supabase/market_seed.sql");
export const SEED_YEAR = 2026;

const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;

export function renderItemsSql(catalog: Catalog): string {
  const rows: string[] = [];
  for (const kind of MARKET_KINDS) {
    catalog.kinds[kind].items.forEach((item, index) => {
      rows.push(
        `  (${quote(item.id)}, ${quote(kind)}, ${quote(item.name)}, ${quote(item.unit)}, ${item.isEvent}, ${index + 1})`
      );
    });
  }
  return (
    `insert into market_items (id, kind, name, unit, is_event, sort_order) values\n${rows.join(",\n")}\n` +
    // No toca is_active: si alguien desactiva un ítem a mano, volver a correr esto no lo reactiva.
    `on conflict (id) do update\n  set kind = excluded.kind, name = excluded.name, unit = excluded.unit,\n` +
    `      is_event = excluded.is_event, sort_order = excluded.sort_order;`
  );
}

export function renderMarketSeed(catalog: Catalog): string {
  return (
    `-- GENERADO por scripts/generate-market-seed.ts (npm run seed:market). No editar a mano.\n` +
    `-- Catálogo de la lista de mercado y calendario de pedidos ${SEED_YEAR} (plan 003).\n` +
    `-- Correr en el SQL Editor de Supabase DESPUÉS de market_lists.sql. Se puede repetir sin problema.\n\n` +
    `${renderItemsSql(catalog)}\n\n` +
    `${renderCalendarSeedSql(buildCalendarSeed(SEED_YEAR))}\n`
  );
}

export const readCatalog = (): Catalog => JSON.parse(readFileSync(CATALOG_PATH, "utf8"));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(SEED_PATH, renderMarketSeed(readCatalog()));
  console.log(`Escrito ${path.relative(ROOT, SEED_PATH)}`);
}
