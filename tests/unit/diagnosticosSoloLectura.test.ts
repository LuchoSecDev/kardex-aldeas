import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Los diagnósticos de supabase/diagnosticos/ (plan 013, Fase 0) se corren a mano en el SQL Editor de PRODUCCIÓN: deben ser un solo
// `select`, sin ninguna instrucción que escriba o cambie algo, y caber en una pegada (< 98 líneas).
const DIR = path.resolve(import.meta.dirname, "../../supabase/diagnosticos");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const read = (f: string) => readFileSync(path.join(DIR, f), "utf8");

// Sin comentarios ni textos entre comillas simples (ahí pueden aparecer palabras como «update» sin ser instrucciones).
const code = (sql: string) => sql.replace(/--.*$/gm, "").replace(/'[^']*'/g, "''");

const WRITE_WORDS = ["insert", "update", "delete", "drop", "create", "alter", "truncate", "grant", "revoke", "copy", "call", "vacuum", "reindex", "lock", "comment", "set", "do"];
const writeRegex = new RegExp(`(^|[^a-z0-9_])(${WRITE_WORDS.join("|")})([^a-z0-9_]|$)`, "i");

describe("diagnósticos de solo lectura (plan 013, Fase 0)", () => {
  it("existen los cinco", () => {
    expect(files).toEqual([
      "diag_1_esquema.sql",
      "diag_2_cadena_guardada.sql",
      "diag_3_huecos_y_futuros.sql",
      "diag_4_cadena_desde_origen.sql",
      "diag_5_valores_y_ajustes.sql",
    ]);
  });

  it.each(files)("%s es un solo select, sin instrucciones de escritura ni de cambio", (f) => {
    const sql = code(read(f));
    expect(sql.match(writeRegex)?.[2], `${f} contiene una palabra de escritura`).toBeUndefined();
    expect(sql.trim()).toMatch(/^(with|select)\b/i);
    // Un solo enunciado: el único punto y coma es el final.
    expect(sql.trim().endsWith(";")).toBe(true);
    expect(sql.trim().slice(0, -1)).not.toContain(";");
  });

  it.each(files)("%s cabe en una pegada del SQL Editor (< 98 líneas) y explica en su encabezado que es solo lectura", (f) => {
    const text = read(f);
    expect(text.split("\n").length).toBeLessThan(98);
    expect(text.split("\n").slice(0, 6).join(" ").toUpperCase()).toContain("SOLO LECTURA");
  });

  it("la prueba detecta una escritura escondida (comprobación de la propia guarda)", () => {
    expect(code("select 1; delete from kardex_records;").match(writeRegex)?.[2]).toBe("delete");
    expect(code("select 'update' as x -- drop table y").match(writeRegex)).toBeNull();
    expect(code("select updated_at, created_at from t").match(writeRegex)).toBeNull();
  });
});
