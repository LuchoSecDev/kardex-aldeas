import { StockStatus, StockStatusMeta } from "@/types/kardex";
import { DAYS_PER_WEEK, WEEKS_BASE, WEEKS_MAX } from "@/lib/calendar";

// Tamaños de los arreglos que se guardan por producto y mes: 6 semanas de 7 días.
// (Las filas anteriores a la semana de cierre traen 5 semanas / 35 días.)
export const TOTAL_DAYS = WEEKS_MAX * DAYS_PER_WEEK;

// Rellena con ceros hasta `length` (las filas guardadas con 5 semanas se leen completas).
export const padTo = (arr: number[] | null | undefined, length: number): number[] => {
  const out = Array(length).fill(0);
  (arr ?? []).slice(0, length).forEach((v, i) => { out[i] = v; });
  return out;
};

// Suma un rango de un arreglo de números (usado para sumar las salidas de una semana).
export const sumRange = (arr: number[], start: number, len: number) =>
  arr.slice(start, start + len).reduce((a, b) => a + b, 0);

// Calcula el saldo anterior de cada una de las 6 semanas, encadenando hacia
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
  const result = Array(WEEKS_MAX).fill(0);
  for (let w = 0; w < WEEKS_MAX; w++) {
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

// Saldo con el que un mes termina, para heredarlo como saldo anterior de la
// semana 1 del mes siguiente. Es el cierre de la ÚLTIMA semana guardada: la de
// cierre (6) si la fila la trae (en un mes sin días sobrantes esa semana está en
// ceros y el saldo sigue igual), o la 5 en las filas anteriores a la semana 6.
export const finalBalanceOfMonth = (row: { prev_balances: number[]; entries: number[]; exits: number[] }) => {
  const w = row.prev_balances.length >= WEEKS_MAX ? WEEKS_MAX - 1 : WEEKS_BASE - 1;
  const weekExits = sumRange(row.exits, w * 7, 7);
  return (row.prev_balances[w] || 0) + (row.entries[w] || 0) - weekExits;
};

// Saldo final de la semana actualmente vista, para un producto dado.
export const calculateBalance = (
  productId: string,
  currentWeek: number,
  exits: Record<string, number[]>,
  entries: Record<string, number[]>,
  prevBalances: Record<string, number[]>
): number => {
  if (!exits[productId] || !prevBalances[productId] || !entries[productId]) return 0;

  const weekIndex = currentWeek - 1;
  const startDay = weekIndex * 7;
  const endDay = startDay + 7;

  const weekExits = (exits[productId] || Array(TOTAL_DAYS).fill(0)).slice(startDay, endDay).reduce((a, b) => a + b, 0);
  const prevBalance = (prevBalances[productId] || [])[weekIndex] || 0;
  const entry = (entries[productId] || [])[weekIndex] || 0;

  return prevBalance + entry - weekExits;
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
