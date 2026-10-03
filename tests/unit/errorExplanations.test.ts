import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPLANATIONS, GENERIC_EXPLANATION, causeOf, explain } from "@/lib/errorExplanations";
import * as fromFunction from "../../supabase/functions/dev-alert/index";

// Las explicaciones en lenguaje natural viven en DOS sitios: la función de alertas (un solo archivo que se pega en el editor de
// Supabase, así que no puede importar de src/) y la pantalla /dev. Esta prueba es la que impide que se desfasen.
const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim();

describe("las dos copias de las explicaciones son idénticas", () => {
  it("el texto del bloque (desde `export type Explanation` hasta `explain`) es literalmente el mismo en los dos archivos", () => {
    const fn = normalize(readFileSync("supabase/functions/dev-alert/index.ts", "utf8"));
    const app = normalize(readFileSync("src/lib/errorExplanations.ts", "utf8"));
    const start = "export type Explanation = {";
    const fnBlock = fn.slice(fn.indexOf(start), fn.indexOf("export function buildAlert")).trim();
    const appBlock = app.slice(app.indexOf(start)).trim();
    expect(fnBlock.length).toBeGreaterThan(2000);
    expect(appBlock).toBe(fnBlock);
  });

  it("y se comportan igual: el diccionario, la explicación genérica y la causa y el título para muchos casos", () => {
    expect(EXPLANATIONS).toEqual(fromFunction.EXPLANATIONS);
    expect(GENERIC_EXPLANATION).toEqual(fromFunction.GENERIC_EXPLANATION);
    const levels = ["warning", "error"];
    const codes = [null, undefined, "P0001", "PGRST301", "42501"];
    const fns = [...Object.keys(EXPLANATIONS), "no_existe", "constructor", "__proto__"];
    for (const fn of fns) {
      for (const level of levels) {
        for (const code of codes) {
          expect(explain({ community: "Maná", fn, level, code }), `${fn}/${level}/${code}`).toEqual(fromFunction.explain({ community: "Maná", fn, level, code }));
          expect(causeOf({ level, code })).toBe(fromFunction.causeOf({ level, code }));
        }
      }
    }
  });
});

describe("explicaciones de la pantalla /dev", () => {
  it("cada llamada a la base que hace la app tiene su explicación", () => {
    const usadas = new Set<string>();
    for (const file of readdirSync("src/lib").filter((f) => f.endsWith(".ts"))) {
      const text = readFileSync(`src/lib/${file}`, "utf8");
      for (const m of text.matchAll(/authedRpc<[^>]*>[(]"([a-z_]+)"/g)) usadas.add(m[1]);
    }
    expect(usadas.size).toBeGreaterThanOrEqual(17);
    expect([...usadas].filter((fn) => !(fn in EXPLANATIONS))).toEqual([]);
  });

  it("el título lleva la comunidad y lo que pasó; una función desconocida usa la genérica", () => {
    expect(explain({ community: "Casa Blanca", fn: "kardex_submit_week", level: "error", code: null }).title).toBe("Casa Blanca: No se pudo enviar la semana a la nutricionista.");
    expect(explain({ community: "Maná", fn: "nada_conocido", level: "error", code: null }).what).toBe(GENERIC_EXPLANATION.what);
    expect(explain({ community: "Maná", fn: "constructor", level: "error", code: null }).what).toBe(GENERIC_EXPLANATION.what);
  });

  it("la causa depende del nivel y del código", () => {
    expect(causeOf({ level: "warning" })).toContain("conexión a internet");
    expect(causeOf({ level: "error", code: "P0001" })).toContain("rechazó los datos");
    expect(causeOf({ level: "error", code: "PGRST301" })).toContain("PGRST301");
    expect(causeOf({ level: "error" })).toContain("Fallo inesperado");
  });
});
