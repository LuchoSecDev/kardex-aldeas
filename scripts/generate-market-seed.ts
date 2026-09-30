// Genera supabase/market_seed_1.sql … market_seed_N.sql (catálogo de la lista de
// mercado + calendario de pedidos 2026) a partir de planes/anexos/lista-mercado-catalogo.json
// y de las reglas de src/lib/marketCalendar.ts.
//
// Son VARIOS archivos chicos a propósito: el SQL Editor de Supabase no deja pegar
// scripts largos (corta hacia las 100 líneas). Cada archivo es una sola instrucción
// independiente: se corren en cualquier orden, después de market_lists.sql.
//
//   npm run seed:market
//
// El archivo generado se commitea; tests/unit/marketSeed.test.ts falla si deja de
// coincidir con lo que produciría este script (así el SQL y las reglas no se separan).

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
export const SEED_DIR = path.join(ROOT, "supabase");
export const SEED_FILE = /^market_seed_\d+\.sql$/;
// Máximo de filas por archivo (≈ 60 líneas, bien por debajo del corte del editor).
export const ROWS_PER_FILE = 60;
export const SEED_YEAR = 2026;

const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;

const chunk = <T,>(rows: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

// Una instrucción `insert` por trozo de ítems.
export function renderItemsSql(catalog: Catalog, rowsPerFile: number = ROWS_PER_FILE): string[] {
  const rows: string[] = [];
  for (const kind of MARKET_KINDS) {
    catalog.kinds[kind].items.forEach((item, index) => {
      rows.push(
        `  (${quote(item.id)}, ${quote(kind)}, ${quote(item.name)}, ${quote(item.unit)}, ${item.isEvent}, ${index + 1})`
      );
    });
  }
  return chunk(rows, rowsPerFile).map(
    (part) =>
      `insert into market_items (id, kind, name, unit, is_event, sort_order) values\n${part.join(",\n")}\n` +
      // No toca is_active: si alguien desactiva un ítem a mano, volver a correr esto no lo reactiva.
      `on conflict (id) do update\n  set kind = excluded.kind, name = excluded.name, unit = excluded.unit,\n` +
      `      is_event = excluded.is_event, sort_order = excluded.sort_order;\n`
  );
}

// Los archivos NO llevan comentarios a propósito: si al pegarlos en el SQL Editor se
// pierden los saltos de línea, un comentario (`--`) dejaría TODO comentado y Supabase
// respondería "syntax error at end of input". Sin comentarios, aunque quedara en una
// sola línea seguiría siendo SQL válido.
export function renderMarketSeedFiles(catalog: Catalog): string[] {
  const calendar = buildCalendarSeed(SEED_YEAR);
  const calendarFiles = chunk(calendar, ROWS_PER_FILE / 2).map((part) => `${renderCalendarSeedSql(part)}\n`);
  return [...renderItemsSql(catalog), ...calendarFiles];
}

export const seedFileName = (index: number) => `market_seed_${index + 1}.sql`;

// Escribe los archivos y borra los sobrantes de una generación anterior.
export function writeMarketSeedFiles(catalog: Catalog): string[] {
  const files = renderMarketSeedFiles(catalog);
  for (const old of readdirSync(SEED_DIR).filter((f) => SEED_FILE.test(f))) rmSync(path.join(SEED_DIR, old));
  files.forEach((sql, i) => writeFileSync(path.join(SEED_DIR, seedFileName(i)), sql));
  return files.map((_, i) => seedFileName(i));
}

export const readCatalog = (): Catalog => JSON.parse(readFileSync(CATALOG_PATH, "utf8"));

if (existsSync(process.argv[1] ?? "") && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const written = writeMarketSeedFiles(readCatalog());
  console.log(`Escritos ${written.length} archivos: supabase/${written[0]} … supabase/${written[written.length - 1]}`);
}
