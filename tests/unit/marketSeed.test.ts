import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARKET_KINDS } from "@/lib/marketCalendar";
import { SEED_PATH, readCatalog, renderItemsSql, renderMarketSeed } from "../../scripts/generate-market-seed.ts";

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
    const sql = renderItemsSql({
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

describe("supabase/market_seed.sql", () => {
  it("coincide con lo que genera scripts/generate-market-seed.ts (si falla: npm run seed:market)", () => {
    expect(readFileSync(SEED_PATH, "utf8")).toBe(renderMarketSeed(readCatalog()));
  });

  it("no lleva comentarios: si se pierden los saltos de línea al pegarlo, no queda todo comentado", () => {
    const sql = readFileSync(SEED_PATH, "utf8");
    expect(sql).not.toMatch(/--|\/\*/);
    expect(sql.trimStart()).toMatch(/^insert into market_items/);
    expect(sql.trimEnd()).toMatch(/;$/);
  });

  it("siembra 285 ítems y 52 viernes", () => {
    const sql = readFileSync(SEED_PATH, "utf8");
    expect(sql.match(/^  \('m[cfas]\d+',/gm)).toHaveLength(285);
    expect(sql.match(/^  \('2026-\d\d-\d\d', array/gm)).toHaveLength(52);
  });
});
