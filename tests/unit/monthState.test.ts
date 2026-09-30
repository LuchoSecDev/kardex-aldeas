import { describe, expect, it, vi } from "vitest";
import type { AjusteRowData, KardexDataSource, KardexRecordRow } from "@/lib/kardexDataSource";
import { buildMonthState, loadMonthState } from "@/lib/monthState";
import type { Product } from "@/types/kardex";

const products: Product[] = [
  { id: "p1", category: "A", name: "Uno", unit: "KG", minStock: 5 },
  { id: "p2", category: "A", name: "Dos", unit: "KG", minStock: 5 },
];

const zeros = (n: number) => Array(n).fill(0);

const record = (productId: string, over: Partial<KardexRecordRow> = {}): KardexRecordRow => ({
  id: `r-${productId}`,
  community: "C",
  year: 2026,
  month: 8,
  product_id: productId,
  prev_balances: zeros(5),
  entries: zeros(5),
  exits: zeros(35),
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const ajuste = (productId: string, weekIndex: number, saldoNuevo: number): AjusteRowData => ({
  id: `a-${productId}-${weekIndex}`,
  community: "C",
  product_id: productId,
  year: 2026,
  month: 8,
  week_index: weekIndex,
  saldo_anterior: 0,
  saldo_nuevo: saldoNuevo,
  motivo: "prueba",
  created_at: "2026-09-01T00:00:00Z",
});

describe("buildMonthState", () => {
  it("un producto sin registros queda en ceros", () => {
    const state = buildMonthState(products, [], [], []);
    expect(state.exits.p1).toEqual(zeros(35));
    expect(state.entries.p1).toEqual(zeros(5));
    expect(state.prevBalances.p1).toEqual(zeros(5));
  });

  it("hereda el saldo final del mes anterior en la semana 1", () => {
    const prev = record("p1", { month: 7, prev_balances: [0, 0, 0, 0, 10], entries: [0, 0, 0, 0, 2], exits: zeros(35) });
    const state = buildMonthState(products, [], [prev], []);
    expect(state.inheritedBase.p1).toBe(12);
    expect(state.prevBalances.p1[0]).toBe(12);
    expect(state.inheritedBase.p2).toBeUndefined();
  });

  it("encadena entradas y salidas guardadas", () => {
    const exits = zeros(35);
    exits[0] = 1.5;
    const row = record("p1", { entries: [5, 0, 0, 0, 0], exits });
    const state = buildMonthState(products, [row], [], []);
    expect(state.prevBalances.p1).toEqual([0, 3.5, 3.5, 3.5, 3.5]);
  });

  it("un ajuste manda en su semana y se refleja en las siguientes", () => {
    const state = buildMonthState(products, [], [], [ajuste("p1", 0, 10)]);
    expect(state.ajustesByProduct.p1).toEqual({ 0: 10 });
    expect(state.prevBalances.p1).toEqual([10, 10, 10, 10, 10]);
  });

  it("no mezcla productos", () => {
    const row = record("p1", { entries: [9, 0, 0, 0, 0] });
    const state = buildMonthState(products, [row], [], []);
    expect(state.entries.p2).toEqual(zeros(5));
  });
});

const okSource = (): KardexDataSource => ({
  loadKardexMonth: vi.fn(async () => ({ data: [], error: null })),
  loadAjustes: vi.fn(async () => ({ data: [], error: null })),
  loadAjustesHistory: vi.fn(async () => ({ data: [], error: null })),
  loadMonthsWithData: vi.fn(async () => ({ data: [], error: null })),
});

describe("loadMonthState", () => {
  it("lee el mes y el mes anterior y no marca error si todo sale bien", async () => {
    const source = okSource();
    const { hasError } = await loadMonthState(source, products, 2026, 8);
    expect(hasError).toBe(false);
    expect(source.loadKardexMonth).toHaveBeenCalledWith(2026, 8);
    expect(source.loadKardexMonth).toHaveBeenCalledWith(2026, 7);
    expect(source.loadAjustes).toHaveBeenCalledWith(2026, 8);
  });

  it("en enero el mes anterior es diciembre del año anterior", async () => {
    const source = okSource();
    await loadMonthState(source, products, 2026, 0);
    expect(source.loadKardexMonth).toHaveBeenCalledWith(2025, 11);
  });

  it.each(["loadKardexMonth", "loadAjustes"] as const)("marca error si falla %s (para no editar ni exportar en ceros)", async (method) => {
    const source = okSource();
    const failure = { message: "Failed to fetch", details: "", hint: "", code: "", name: "PostgrestError" };
    source[method] = vi.fn(async () => ({ data: null, error: failure })) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { hasError, state } = await loadMonthState(source, products, 2026, 8);
    expect(hasError).toBe(true);
    // El estado sigue armado (en ceros) para que la pantalla no falle; lo que
    // importa es que quien lo use vea hasError y no lo trate como datos reales.
    expect(state.entries.p1).toEqual(zeros(5));
  });
});
