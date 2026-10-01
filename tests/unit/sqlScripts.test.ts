import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guardas baratas para que los scripts de supabase/ no se desordenen: todo script nuevo debe quedar en la lista
// de tests/db/run.sh (así sus pruebas lo cargan) y en supabase/README.md, y los recientes caben en una pegada del
// SQL Editor (< 100 líneas).
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const runSh = read("tests/db/run.sh");
const enLista = new Set((runSh.match(/for f in([\s\S]*?); do/)?.[1] ?? "").split(/[\s\\]+/).filter(Boolean));
const scripts = readdirSync(path.join(ROOT, "supabase")).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, ""));

// Scripts que a propósito no carga run.sh: semillas (las carga aparte), operaciones manuales y catálogo completo.
const FUERA_DE_LA_LISTA = new Set([
  "admin_reset_password", "cleanup_test_data", "products_fruver", "products_panaderia_abarrotes",
]);

describe("scripts SQL", () => {
  it("la lista de run.sh se leyó bien y todo lo que nombra existe", () => {
    expect(enLista.size).toBeGreaterThan(30);
    for (const f of enLista) expect(existsSync(path.join(ROOT, "supabase", `${f}.sql`)), f).toBe(true);
  });

  it("todo script de supabase/ está en la lista de run.sh (o es una excepción conocida)", () => {
    const sueltos = scripts.filter((f) => !enLista.has(f) && !f.startsWith("market_seed_") && !FUERA_DE_LA_LISTA.has(f));
    expect(sueltos, "agrégalos a la lista de tests/db/run.sh (y a supabase/README.md)").toEqual([]);
  });

  it("todo script de la lista está nombrado en supabase/README.md", () => {
    const readme = read("supabase/README.md");
    // Los archivos numerados (six_weeks_1..5, market_lists_1..5) se nombran con «..»: basta el prefijo.
    const falta = [...enLista].filter((f) => !readme.includes(f) && !readme.includes(f.replace(/_\d+$/, "_1..")) && !readme.includes(f.replace(/_\d+$/, "")));
    expect(falta).toEqual([]);
  });

  it("los scripts de la zona de cambios caben en una pegada del SQL Editor (< 100 líneas)", () => {
    for (const f of scripts.filter((s) => s.startsWith("market_changes_"))) {
      expect(read(`supabase/${f}.sql`).split(/\r?\n/).length, f).toBeLessThan(100);
    }
  });
});
