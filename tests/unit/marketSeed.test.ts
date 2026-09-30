import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MARKET_KINDS } from "@/lib/marketCalendar";
import {
  SEED_DIR,
  SEED_FILE,
  readCatalog,
  renderItemsSql,
  renderMarketSeedFiles,
  seedFileName,
} from "../../scripts/generate-market-seed.ts";

describe("catálogo de la lista de mercado", () => {
  const catalog = readCatalog();

  it("trae los 285 ítems del Excel: 35 carnes, 117 fruver y lácteos, 80 abarrotes, 53 aseo", () => {
    const counts = Object.fromEntries(MARKET_KINDS.map((k) => [k, catalog.kinds[k].items.length]));
    expect(counts).toEqual({ fruver: 117, carnes: 35, abarrotes: 80, aseo: 53 });
  });

  it("los ids son únicos y no hay nombres vacíos ni unidades vacías", () => {
    const all = MARKET_KINDS.flatMap((k) => catalog.kinds[k].items);
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    for (const item of all) {
      expect(item.name.trim(), item.id).not.toBe("");
      expect(item.unit.trim(), item.id).not.toBe("");
    }
  });

  it("cada ítem solo trae id, nombre, unidad y si es de evento: sin precios (plan 003)", () => {
    for (const kind of MARKET_KINDS) {
      for (const item of catalog.kinds[kind].items) {
        expect(Object.keys(item).sort(), item.id).toEqual(["id", "isEvent", "name", "unit"]);
      }
    }
  });

  it("el SQL escapa las comillas simples", () => {
    const [sql] = renderItemsSql({
      kinds: {
        fruver: { items: [{ id: "x1", name: "Dulce d'leche", unit: "KG", isEvent: false }] },
        carnes: { items: [] },
        abarrotes: { items: [] },
        aseo: { items: [] },
      },
    });
    expect(sql).toContain("'Dulce d''leche'");
  });
});

describe("supabase/market_seed_N.sql", () => {
  const files = readdirSync(SEED_DIR)
    .filter((f) => SEED_FILE.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const read = (name: string) => readFileSync(path.join(SEED_DIR, name), "utf8");

  it("coinciden con lo que genera scripts/generate-market-seed.ts (si falla: npm run seed:market)", () => {
    const expected = renderMarketSeedFiles(readCatalog());
    expect(files).toEqual(expected.map((_, i) => seedFileName(i)));
    files.forEach((name, i) => expect(read(name), name).toBe(expected[i]));
  });

  it("cada archivo es corto (el SQL Editor de Supabase no deja pegar más de ~100 líneas)", () => {
    for (const name of files) {
      expect(read(name).split("\n").length, name).toBeLessThanOrEqual(70);
      expect(read(name).length, name).toBeLessThan(6000);
    }
  });

  it("no llevan comentarios: si se pierden los saltos de línea al pegarlos, no queda todo comentado", () => {
    for (const name of files) {
      const sql = read(name);
      expect(sql, name).not.toMatch(/--|\/\*/);
      expect(sql.trimStart(), name).toMatch(/^insert into market_(items|calendar)/);
      expect(sql.trimEnd(), name).toMatch(/;$/);
    }
  });

  it("cada archivo es UNA sola instrucción (se pueden correr en cualquier orden)", () => {
    for (const name of files) expect(read(name).match(/;/g), name).toHaveLength(1);
  });

  it("entre todos siembran 285 ítems y 52 viernes", () => {
    const all = files.map(read).join("\n");
    expect(all.match(/^  \('m[cfas]\d+',/gm)).toHaveLength(285);
    expect(all.match(/^  \('2026-\d\d-\d\d', array/gm)).toHaveLength(52);
  });
});

describe("scripts SQL de la lista de mercado: cabe en el SQL Editor de Supabase", () => {
  // El editor corta lo que se pega hacia las 100 líneas (se comprobó con
  // market_lists.sql y market_seed.sql: solo entraron las primeras 100), y lo
  // cortado puede ejecutarse a medias sin avisar. Por eso van en archivos chicos.
  const files = readdirSync(SEED_DIR).filter((f) => /^market_(lists|seed)_\d+\.sql$/.test(f));

  it("hay 5 archivos de estructura y 7 de siembra", () => {
    expect(files.filter((f) => f.startsWith("market_lists_"))).toHaveLength(5);
    expect(files.filter((f) => f.startsWith("market_seed_"))).toHaveLength(7);
  });

  it("ninguno pasa de 95 líneas", () => {
    for (const name of files) {
      const lines = readFileSync(path.join(SEED_DIR, name), "utf8").trimEnd().split("\n").length;
      expect(lines, name).toBeLessThanOrEqual(95);
    }
  });

  it("todos los archivos están en la lista de tests/db/run.sh (así se prueban juntos)", () => {
    const runner = readFileSync("tests/db/run.sh", "utf8");
    for (const name of files.filter((f) => f.startsWith("market_lists_"))) {
      expect(runner, name).toContain(name.replace(".sql", ""));
    }
  });
});
