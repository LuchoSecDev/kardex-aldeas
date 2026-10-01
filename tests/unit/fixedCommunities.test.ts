import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Plan 005: guardas baratas para que las 8 comunidades fijas y el cierre de la creación libre no se
// desarmen sin que nadie se dé cuenta (el comportamiento real lo prueban db/ e integration/).
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const FIJAS = ["Casa Blanca", "Esmeralda", "Fortaleza", "Leones", "Maná", "Primavera", "Renacer", "Shalom"];
const SQL_NUEVOS = [
  "supabase/fixed_communities.sql",
  "supabase/lock_down_community_creation_1.sql",
  "supabase/lock_down_community_creation_2.sql",
];

const nombresEn = (texto: string) => [...texto.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

describe("fixed_communities.sql", () => {
  const sql = read("supabase/fixed_communities.sql");
  const sinComentarios = sql.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");

  it("el insert trae exactamente las 8 comunidades", () => {
    const insert = sinComentarios.match(/insert into communities \(name\) values([\s\S]*?)on conflict/);
    expect(insert).not.toBeNull();
    expect(nombresEn(insert![1])).toEqual(FIJAS);
  });

  it("la lista donde se asignan los PIN es la misma que la del insert (no se desfasan)", () => {
    const lista = sinComentarios.match(/name in \(([^)]*)\)/);
    expect(lista).not.toBeNull();
    expect(nombresEn(lista![1])).toEqual(FIJAS);
  });

  it("no lleva ningún PIN escrito: se generan al correrlo y solo quedan como hash", () => {
    expect(sinComentarios).not.toMatch(/crypt\(\s*'\d+'/);
    expect(sinComentarios).toMatch(/gen_random_bytes/);
    expect(sinComentarios).toMatch(/gen_salt\('bf'\)/);
  });

  it("devuelve la tabla comunidad | pin al final (es la única vez que se ven los PIN)", () => {
    expect(sinComentarios.trim()).toMatch(/select name as comunidad, pin from puestos order by name;$/);
  });
});

describe("scripts nuevos del plan 005", () => {
  it("cada uno cabe en una sola pegada del SQL Editor (< 100 líneas)", () => {
    for (const f of SQL_NUEVOS) {
      expect(read(f).split(/\r?\n/).length, f).toBeLessThan(100);
    }
  });

  it("ninguno guarda la clave de aprovisionamiento ni un PIN reales (el ejemplo es un marcador)", () => {
    const todo = SQL_NUEVOS.map(read).join("\n");
    expect(todo).toContain("TU-CLAVE");
    expect(todo).not.toMatch(/PROVISION_KEY\s*=\s*\S+/);
  });
});

describe("la app no tiene forma de crear comunidades ni de reclamar un PIN", () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });

  it("ningún archivo de src/ llama a las funciones cerradas ni a sus envoltorios", () => {
    const prohibido = /create_community_with_pin|claim_pin_for_existing_community|createCommunityWithPin|claimPinForExistingCommunity|provision_community/;
    const culpables = archivos(path.join(ROOT, "src")).filter((f) => prohibido.test(readFileSync(f, "utf8")));
    expect(culpables.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("la clave de aprovisionamiento nunca se expone al navegador (no es NEXT_PUBLIC_)", () => {
    const todo = archivos(path.join(ROOT, "src")).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(todo).not.toMatch(/PROVISION_KEY/);
    expect(read("tests/integration/helpers.ts")).toMatch(/process\.env\.PROVISION_KEY/);
    expect(read("tests/integration/helpers.ts")).not.toMatch(/NEXT_PUBLIC_PROVISION/);
  });
});
