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
  prev_balances: zeros(6),
  entries: zeros(6),
  exits: zeros(42),
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
    expect(state.exits.p1).toEqual(zeros(42));
    expect(state.entries.p1).toEqual(zeros(6));
    expect(state.prevBalances.p1).toEqual(zeros(6));
  });

  it("hereda el saldo final del mes anterior en la semana 1", () => {
    // Fila guardada con 5 semanas (anterior a la semana 6): hereda el cierre de la semana 5.
    const prev = record("p1", { month: 7, prev_balances: [0, 0, 0, 0, 10], entries: [0, 0, 0, 0, 2], exits: zeros(35) });
    const state = buildMonthState(products, [], [prev], []);
    expect(state.inheritedBase.p1).toBe(12);
    expect(state.prevBalances.p1[0]).toBe(12);
    expect(state.inheritedBase.p2).toBeUndefined();
  });

  it("encadena entradas y salidas guardadas", () => {
    const exits = zeros(42);
    exits[0] = 1.5;
    const row = record("p1", { entries: [5, 0, 0, 0, 0, 0], exits });
    const state = buildMonthState(products, [row], [], []);
    expect(state.prevBalances.p1).toEqual([0, 3.5, 3.5, 3.5, 3.5, 3.5]);
  });

  it("un ajuste manda en su semana y se refleja en las siguientes", () => {
    const state = buildMonthState(products, [], [], [ajuste("p1", 0, 10)]);
    expect(state.ajustesByProduct.p1).toEqual({ 0: 10 });
    expect(state.prevBalances.p1).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it("no mezcla productos", () => {
    const row = record("p1", { entries: [9, 0, 0, 0, 0, 0] });
    const state = buildMonthState(products, [row], [], []);
    expect(state.entries.p2).toEqual(zeros(6));
  });

  // --- Semana 6 de cierre (hallazgo H1, planes/004) ---

  it("una fila guardada con 5 semanas (35 días) se lee completa: rellena con ceros hasta 42/6", () => {
    const exits = zeros(35);
    exits[34] = 2;
    const row = record("p1", { prev_balances: zeros(5), entries: [1, 0, 0, 0, 0], exits });
    const state = buildMonthState(products, [row], [], []);
    expect(state.exits.p1).toHaveLength(42);
    expect(state.exits.p1[34]).toBe(2);
    expect(state.exits.p1.slice(35)).toEqual(zeros(7));
    expect(state.entries.p1).toEqual([1, 0, 0, 0, 0, 0]);
    expect(state.prevBalances.p1).toHaveLength(6);
  });

  it("la semana 6 hereda el cierre de la semana 5 (se calcula sola) y suma su propia entrada", () => {
    // Marzo: entra 10 en la semana 1, se consumen 4 en la semana 5 y, en la semana 6, entran 3 y salen 2 (30 y 31 de marzo).
    const exits = zeros(42);
    exits[4 * 7] = 4; // semana 5
    exits[5 * 7] = 1; // lunes 30
    exits[5 * 7 + 1] = 1; // martes 31
    const row = record("p1", { entries: [10, 0, 0, 0, 0, 3], exits });
    const state = buildMonthState(products, [row], [], []);
    expect(state.prevBalances.p1[4]).toBe(10); // saldo anterior de la semana 5
    expect(state.prevBalances.p1[5]).toBe(6); // 10 - 4 = cierre de la semana 5
  });

  it("el mes siguiente hereda el cierre DESPUÉS de la semana 6 (no el de la semana 5)", () => {
    const exits = zeros(42);
    exits[4 * 7] = 4;
    exits[5 * 7] = 1;
    exits[5 * 7 + 1] = 1;
    const marzo = record("p1", { month: 2, prev_balances: [0, 10, 10, 10, 10, 6], entries: [10, 0, 0, 0, 0, 3], exits });
    const abril = buildMonthState(products, [], [marzo], []);
    // 6 (saldo anterior de la semana 6) + 3 (entrada) - 2 (salidas del 30 y 31) = 7
    expect(abril.inheritedBase.p1).toBe(7);
    expect(abril.prevBalances.p1[0]).toBe(7);
  });

  it("en un mes sin días sobrantes la semana 6 está en ceros y el cierre es el de la semana 5", () => {
    const exits = zeros(42);
    exits[4 * 7] = 2;
    const row = record("p1", { month: 8, prev_balances: [0, 5, 5, 5, 5, 3], entries: [5, 0, 0, 0, 0, 0], exits });
    expect(buildMonthState(products, [], [row], []).inheritedBase.p1).toBe(3);
  });

  it("un ajuste de la semana 6 manda en esa semana", () => {
    const state = buildMonthState(products, [], [], [ajuste("p1", 5, 9)]);
    expect(state.prevBalances.p1).toEqual([0, 0, 0, 0, 0, 9]);
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
    expect(state.entries.p1).toEqual(zeros(6));
  });
});
