import { describe, expect, it } from "vitest";
import {
  calculateBalance,
  computeCascade,
  finalBalanceOfMonth,
  getStockStatus,
  sumRange,
} from "@/lib/balanceEngine";

// 35 días (5 semanas x 7) con las salidas indicadas por posición.
const exitsWith = (byDay: Record<number, number>) => {
  const arr = Array(35).fill(0);
  Object.entries(byDay).forEach(([day, value]) => (arr[Number(day)] = value));
  return arr;
};

describe("sumRange", () => {
  it("suma solo el rango pedido", () => {
    expect(sumRange([1, 2, 3, 4, 5], 1, 3)).toBe(9);
  });

  it("devuelve 0 para un rango vacío", () => {
    expect(sumRange([], 0, 7)).toBe(0);
  });
});

describe("computeCascade (saldo anterior de cada semana)", () => {
  it("la semana 1 hereda el saldo final del mes anterior", () => {
    const result = computeCascade(10, {}, [0, 0, 0, 0, 0], exitsWith({}));
    expect(result[0]).toBe(10);
  });

  it("encadena: saldo previo + entradas - salidas de la semana anterior", () => {
    // Semana 1: entra 5 y salen 1 + 2 => la semana 2 arranca en 10 + 5 - 3 = 12
    const result = computeCascade(10, {}, [5, 0, 0, 0, 0], exitsWith({ 0: 1, 1: 2 }));
    expect(result).toEqual([10, 12, 12, 12, 12]);
  });

  it("maneja decimales (medias unidades)", () => {
    const result = computeCascade(1, {}, [0, 0, 0, 0, 0], exitsWith({ 1: 0.5, 8: 0.5 }));
    expect(result).toEqual([1, 0.5, 0, 0, 0]);
  });

  it("permite saldos negativos (salidas mayores al stock)", () => {
    const result = computeCascade(0, {}, [0, 0, 0, 0, 0], exitsWith({ 0: 4 }));
    expect(result[1]).toBe(-4);
  });

  it("un ajuste manda en su semana y las siguientes parten de él", () => {
    // Sin ajuste la semana 3 sería 0; con ajuste en la semana 3 vale 100 y la 4 = 100 + entradas(3) - salidas(3)
    const result = computeCascade(0, { 2: 100 }, [0, 0, 7, 0, 0], exitsWith({ 14: 2 }));
    expect(result[2]).toBe(100);
    expect(result[3]).toBe(105);
  });

  it("un ajuste en la semana 1 reemplaza el saldo heredado", () => {
    const result = computeCascade(10, { 0: 3 }, [0, 0, 0, 0, 0], exitsWith({}));
    expect(result[0]).toBe(3);
    expect(result[1]).toBe(3);
  });

  it("siempre devuelve 5 semanas", () => {
    expect(computeCascade(0, {}, [], [])).toHaveLength(5);
  });
});

describe("finalBalanceOfMonth (lo que hereda el mes siguiente)", () => {
  it("saldo previo de la semana 5 + entradas - salidas de la semana 5", () => {
    const row = {
      prev_balances: [0, 0, 0, 0, 10],
      entries: [0, 0, 0, 0, 2],
      exits: exitsWith({ 28: 1, 34: 4 }),
    };
    expect(finalBalanceOfMonth(row)).toBe(7);
  });

  it("ignora las salidas de semanas anteriores", () => {
    const row = {
      prev_balances: [0, 0, 0, 0, 5],
      entries: [9, 9, 9, 9, 0],
      exits: exitsWith({ 0: 100 }),
    };
    expect(finalBalanceOfMonth(row)).toBe(5);
  });
});

describe("calculateBalance (saldo final de la semana visible)", () => {
  const exits = { p1: exitsWith({ 7: 2, 8: 1 }) };
  const entries = { p1: [0, 4, 0, 0, 0] };
  const prevBalances = { p1: [0, 10, 0, 0, 0] };

  it("saldo anterior + entrada - salidas de esa semana", () => {
    expect(calculateBalance("p1", 2, exits, entries, prevBalances)).toBe(11);
  });

  it("devuelve 0 si el producto no tiene datos cargados", () => {
    expect(calculateBalance("nope", 1, exits, entries, prevBalances)).toBe(0);
  });
});

describe("getStockStatus (semáforo)", () => {
  it("rojo cuando el saldo es negativo", () => {
    expect(getStockStatus(-1, 5)).toBe("rojo");
  });

  it("amarillo entre 0 y el mínimo (inclusive)", () => {
    expect(getStockStatus(0, 5)).toBe("amarillo");
    expect(getStockStatus(5, 5)).toBe("amarillo");
  });

  it("verde por encima del mínimo", () => {
    expect(getStockStatus(5.5, 5)).toBe("verde");
  });
});
