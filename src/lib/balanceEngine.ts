import { StockStatus, StockStatusMeta } from "@/types/kardex";

// Suma un rango de un arreglo de números (usado para sumar las salidas de una semana).
export const sumRange = (arr: number[], start: number, len: number) =>
  arr.slice(start, start + len).reduce((a, b) => a + b, 0);

// Calcula el saldo anterior de cada una de las 5 semanas, encadenando hacia
// adelante. `overrides` son ajustes auditados: si la semana w tiene un
// ajuste, ese valor manda para esa semana (y las siguientes se calculan a
// partir de él); si no, se calcula desde el saldo final de la semana previa.
// La semana 0 sin ajuste hereda el saldo final del mes anterior.
export const computeCascade = (
  inheritedBase: number,
  overrides: Record<number, number>,
  entriesArr: number[],
  exitsArr: number[]
): number[] => {
  const result = Array(5).fill(0);
  for (let w = 0; w < 5; w++) {
    if (overrides[w] !== undefined) {
      result[w] = overrides[w];
    } else if (w === 0) {
      result[w] = inheritedBase;
    } else {
      const prevWeekExits = sumRange(exitsArr, (w - 1) * 7, 7);
      result[w] = result[w - 1] + (entriesArr[w - 1] || 0) - prevWeekExits;
    }
  }
  return result;
};

// Saldo con el que un mes termina (semana 5), para heredarlo como saldo
// anterior de la semana 1 del mes siguiente.
export const finalBalanceOfMonth = (row: { prev_balances: number[]; entries: number[]; exits: number[] }) => {
  const w = 4;
  const weekExits = sumRange(row.exits, w * 7, 7);
  return (row.prev_balances[w] || 0) + (row.entries[w] || 0) - weekExits;
};

// Semáforo de stock
export const getStockStatus = (balance: number, minStock: number): StockStatus => {
  if (balance < 0) return "rojo";
  if (balance <= minStock) return "amarillo";
  return "verde";
};

export const STOCK_STATUS_META: Record<StockStatus, StockStatusMeta> = {
  rojo: { color: "var(--color-accent-red)", emoji: "🔴", label: "Sin stock" },
  amarillo: { color: "var(--color-warning)", emoji: "🟡", label: "Stock bajo" },
  verde: { color: "var(--color-success)", emoji: "🟢", label: "Stock suficiente" },
};
