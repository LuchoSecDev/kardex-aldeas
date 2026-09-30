import { TOTAL_DAYS, computeCascade, finalBalanceOfMonth, padTo } from "@/lib/balanceEngine";
import { WEEKS_MAX } from "@/lib/calendar";
import type { AjusteRowData, KardexDataSource, KardexRecordRow } from "@/lib/kardexDataSource";
import { Product } from "@/types/kardex";

export interface MonthState {
  exits: Record<string, number[]>;
  entries: Record<string, number[]>;
  prevBalances: Record<string, number[]>;
  // Ajustes auditados vigentes de este mes: productId -> { weekIndex: saldo_nuevo }
  ajustesByProduct: Record<string, Record<number, number>>;
  // Saldo con el que cerró el mes anterior, por producto
  inheritedBase: Record<string, number>;
}

// Arma lo que la pantalla (y los exportadores) necesitan de un mes: las
// entradas/salidas guardadas, el saldo heredado del mes anterior, los ajustes y
// el saldo anterior de cada semana ya encadenado. Es pura: no toca la red.
export function buildMonthState(
  products: Product[],
  monthRows: KardexRecordRow[],
  prevMonthRows: KardexRecordRow[],
  ajustes: AjusteRowData[]
): MonthState {
  const inheritedBase: Record<string, number> = {};
  prevMonthRows.forEach((row) => {
    inheritedBase[row.product_id] = finalBalanceOfMonth(row);
  });

  const ajustesByProduct: Record<string, Record<number, number>> = {};
  ajustes.forEach((row) => {
    if (!ajustesByProduct[row.product_id]) ajustesByProduct[row.product_id] = {};
    ajustesByProduct[row.product_id][row.week_index] = row.saldo_nuevo;
  });

  const exits: Record<string, number[]> = {};
  const entries: Record<string, number[]> = {};
  const prevBalances: Record<string, number[]> = {};

  products.forEach((p) => {
    const row = monthRows.find((r) => r.product_id === p.id);
    // Siempre 42 salidas y 6 entradas: las filas guardadas con 5 semanas se rellenan con ceros.
    const productExits = padTo(row?.exits, TOTAL_DAYS);
    const productEntries = padTo(row?.entries, WEEKS_MAX);
    const base = inheritedBase[p.id] ?? 0;
    const overrides = ajustesByProduct[p.id] || {};

    exits[p.id] = productExits;
    entries[p.id] = productEntries;
    prevBalances[p.id] = computeCascade(base, overrides, productEntries, productExits);
  });

  return { exits, entries, prevBalances, ajustesByProduct, inheritedBase };
}

export interface MonthLoadResult {
  state: MonthState;
  // true si alguna de las lecturas falló: `state` puede estar incompleto (en
  // ceros) y NO debe usarse para editar ni exportar sin avisar.
  hasError: boolean;
}

// Lee un mes (y el anterior, y sus ajustes) de una fuente de datos y arma su
// estado. Si alguna lectura falla se registra y se marca `hasError`.
export async function loadMonthState(
  dataSource: KardexDataSource,
  products: Product[],
  year: number,
  month: number
): Promise<MonthLoadResult> {
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear -= 1;
  }

  const [monthRes, prevMonthRes, ajustesRes] = await Promise.all([
    dataSource.loadKardexMonth(year, month),
    dataSource.loadKardexMonth(prevYear, prevMonth),
    dataSource.loadAjustes(year, month),
  ]);

  if (monthRes.error) console.error("Error cargando datos:", monthRes.error);
  if (prevMonthRes.error) console.error("Error cargando el mes anterior:", prevMonthRes.error);
  if (ajustesRes.error) console.error("Error cargando ajustes:", ajustesRes.error);

  return {
    state: buildMonthState(products, monthRes.data || [], prevMonthRes.data || [], ajustesRes.data || []),
    hasError: Boolean(monthRes.error || prevMonthRes.error || ajustesRes.error),
  };
}
