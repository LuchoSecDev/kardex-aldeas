import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeCascade, finalBalanceOfMonth } from "@/lib/balanceEngine";

// Paridad del encadenado de saldos (plan 013): estos vectores los comparte la prueba SQL de la función que GUARDA los saldos en el
// servidor (tests/db/kardex_chain.test.sql, `_kardex_cascade`) con computeCascade, que solo se usa para la vista previa. Los
// resultados esperados salen de un tercer cálculo independiente; si una implementación cambia y la otra no, una de las dos falla.
type Vector = {
  name: string;
  base: number;
  overrides: Record<string, number>;
  entries: number[];
  exits: number[];
  expected: number[];
  closing: number;
};

const FILE = path.resolve(import.meta.dirname, "../db/cascade_vectors.sql");
const line = readFileSync(FILE, "utf8").split("\n").find((l) => l.includes("set vectors '"))!;
const vectors: Vector[] = JSON.parse(line.slice(line.indexOf("'") + 1, line.lastIndexOf("'")));

const TOLERANCE = 1e-9;

describe("vectores compartidos de paridad con el servidor", () => {
  it("el archivo trae casos suficientes y de los dos tamaños (5 y 6 semanas)", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(50);
    expect(new Set(vectors.map((v) => v.entries.length))).toEqual(new Set([5, 6]));
    expect(vectors.some((v) => Object.keys(v.overrides).length > 0)).toBe(true);
    expect(vectors.some((v) => v.expected.some((x) => x < 0))).toBe(true);
  });

  it.each(vectors.map((v) => [v.name, v] as const))("computeCascade da lo mismo que el cálculo del servidor: %s", (_name, v) => {
    const overrides = Object.fromEntries(Object.entries(v.overrides).map(([week, value]) => [Number(week), value]));
    const got = computeCascade(v.base, overrides, v.entries, v.exits).slice(0, v.entries.length);
    expect(got).toHaveLength(v.expected.length);
    got.forEach((value, week) => expect(Math.abs(value - v.expected[week]), `semana ${week + 1}`).toBeLessThan(TOLERANCE));
  });

  it.each(vectors.map((v) => [v.name, v] as const))("finalBalanceOfMonth da el cierre esperado: %s", (_name, v) => {
    const closing = finalBalanceOfMonth({ prev_balances: v.expected, entries: v.entries, exits: v.exits });
    expect(Math.abs(closing - v.closing)).toBeLessThan(TOLERANCE);
  });
});
