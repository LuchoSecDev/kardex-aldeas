// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KardexRecordRow } from "@/lib/kardexDataSource";

// Semana 6 de cierre (planes/004): la pantalla del kardex completa, con el servicio simulado.
vi.mock("@/lib/kardexService", () => ({
  kardexService: {
    loadProducts: vi.fn(),
    loadKardexMonth: vi.fn(),
    loadAjustes: vi.fn(),
    loadAjustesHistory: vi.fn(),
    loadMonthsWithData: vi.fn(),
    loadWeekSubmissions: vi.fn(),
    saveProductData: vi.fn(),
    submitWeek: vi.fn(),
    insertAjuste: vi.fn(),
  },
}));

import KardexDashboard from "@/components/KardexDashboard";
import { kardexService } from "@/lib/kardexService";

const service = vi.mocked(kardexService, true);

const PRODUCTS = [{ id: "p1", category: "ABARROTES", name: "Arroz", unit: "KG", minStock: 5 }];
const zeros = (n: number) => Array(n).fill(0);
const ok = <T,>(data: T) => ({ data, error: null });

const record = (month: number, over: Partial<KardexRecordRow> = {}): KardexRecordRow => ({
  id: "r1", community: "Maná", year: 2026, month, product_id: "p1",
  prev_balances: zeros(6), entries: zeros(6), exits: zeros(42), updated_at: "2026-03-01T00:00:00Z", ...over,
});

// Marzo 2026 (mes 2): se entran 10 en la semana 1 y no hay más movimientos.
const MARZO = record(2, { entries: [10, 0, 0, 0, 0, 0], prev_balances: [0, 10, 10, 10, 10, 10] });

const MARCH = { year: 2026, month: 2 };
const APRIL = { year: 2026, month: 3 };
const SEPTEMBER = { year: 2026, month: 8 };

function mockMonths(rows: Record<number, KardexRecordRow[]>) {
  service.loadKardexMonth.mockImplementation(async (_year: number, month: number) => ok(rows[month] ?? []));
}

async function renderDashboard(props: { year: number; month: number; week?: number }) {
  render(
    <KardexDashboard community="Maná" onLogout={vi.fn()} initialYear={props.year} initialMonth={props.month} initialWeek={props.week} />
  );
  await waitFor(() => expect(screen.queryByText(/Cargando datos desde la nube/)).toBeNull());
}

const arrozRow = () => screen.getAllByRole("row").find((r) => within(r).queryByText("Arroz"))!;
const numberInputs = () => within(arrozRow()).getAllByRole("spinbutton") as HTMLInputElement[]; // [entrada, L, M, MC, J, V, S, D]
const saldoAnterior = () => within(arrozRow()).getAllByRole("cell")[2].textContent?.replace(/\D*$/, "");

beforeEach(() => {
  service.loadProducts.mockResolvedValue(ok(PRODUCTS) as never);
  service.loadAjustes.mockResolvedValue(ok([]));
  service.loadAjustesHistory.mockResolvedValue(ok([]));
  service.loadMonthsWithData.mockResolvedValue(ok([]));
  service.loadWeekSubmissions.mockResolvedValue(ok([]));
  service.saveProductData.mockResolvedValue(ok(null));
  mockMonths({ 2: [MARZO] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("kardex: semana 6 de cierre", () => {
  it("marzo 2026 muestra 'Sem 6 (cierre)'; septiembre 2026 (que cabe en 5 semanas) no", async () => {
    await renderDashboard(MARCH);
    expect(screen.getByRole("button", { name: /Sem 6/ }).textContent).toContain("cierre");
    cleanup();
    await renderDashboard(SEPTEMBER);
    expect(screen.queryByRole("button", { name: /Sem 6/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Sem \d/ })).toHaveLength(5);
  });

  it("en la semana 6 solo están habilitados el 30 y el 31; los demás días y 'las demás semanas' quedan deshabilitados", async () => {
    await renderDashboard({ ...MARCH, week: 6 });
    expect(screen.getByText(/SEMANA 6 - Cierre del mes/)).toBeTruthy();
    expect(screen.getByText(/30 y 31/)).toBeTruthy();
    const [entrada, ...days] = numberInputs();
    expect(entrada.disabled).toBe(false); // su propia entrada
    expect(days.map((d) => d.disabled)).toEqual([false, false, true, true, true, true, true]);
    expect(days[2].title).toBe("Este día es del mes siguiente");
  });

  it("el saldo anterior de la semana 6 sale solo del cierre de la semana 5 (no se escribe a mano)", async () => {
    await renderDashboard({ ...MARCH, week: 6 });
    expect(saldoAnterior()).toBe("10");
  });

  it("registrar el 30 guarda arreglos completos de 42 salidas, 6 entradas y 6 saldos, con el valor en la posición 35", async () => {
    await renderDashboard({ ...MARCH, week: 6 });
    const [entrada, lunes] = numberInputs();
    await act(async () => { fireEvent.change(lunes, { target: { value: "1" } }); });
    await act(async () => { fireEvent.change(entrada, { target: { value: "3" } }); });
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalled());

    const [year, month, productId, exits, entries, prev] = service.saveProductData.mock.calls.at(-1)!;
    expect([year, month, productId]).toEqual([2026, 2, "p1"]);
    expect(exits).toHaveLength(42);
    expect(exits[35]).toBe(1); // lunes 30 de marzo
    expect(entries).toHaveLength(6);
    expect(entries[5]).toBe(3);
    expect(prev).toHaveLength(6);
    expect(prev[5]).toBe(10);
    // Saldo final de la semana 6: 10 + 3 - 1
    expect(within(arrozRow()).getAllByRole("cell").at(-1)!.textContent).toBe("12");
  });

  it("al volver a un mes de 5 semanas estando en la semana 6, muestra la última semana que tiene ese mes", async () => {
    await renderDashboard({ ...APRIL, week: 6 }); // abril 2026 cabe en 5 semanas
    expect(screen.getByText(/SEMANA 5 - Registro Diario/)).toBeTruthy();
    expect(screen.queryByText(/Cierre del mes/)).toBeNull();
  });

  it("abril hereda el cierre de marzo DESPUÉS de la semana 6 (10 + 3 - 2 = 11)", async () => {
    const marzoConCierre = record(2, {
      entries: [10, 0, 0, 0, 0, 3],
      prev_balances: [0, 10, 10, 10, 10, 10],
      exits: Object.assign(zeros(42), { 35: 1, 36: 1 }), // 30 y 31 de marzo
    });
    mockMonths({ 2: [marzoConCierre] });
    await renderDashboard({ ...APRIL, week: 1 });
    expect(saldoAnterior()).toBe("11");
  });

  it("una fila de marzo guardada antes de la semana 6 (35 días) se lee completa y se puede seguir guardando", async () => {
    const vieja = record(2, { entries: [10, 0, 0, 0, 0] as never, prev_balances: [0, 10, 10, 10, 10] as never, exits: zeros(35) });
    mockMonths({ 2: [vieja] });
    await renderDashboard({ ...MARCH, week: 6 });
    expect(saldoAnterior()).toBe("10");
    const [, lunes] = numberInputs();
    await act(async () => { fireEvent.change(lunes, { target: { value: "2" } }); });
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalled());
    const [, , , exits, entries, prev] = service.saveProductData.mock.calls.at(-1)!;
    expect([exits.length, entries.length, prev.length]).toEqual([42, 6, 6]);
  });

  it("registrar en una semana normal también guarda los 42/6/6 (siempre completos)", async () => {
    await renderDashboard({ ...SEPTEMBER, week: 1 });
    const [, , martes] = numberInputs(); // septiembre empieza en martes: L deshabilitado, M habilitado
    await act(async () => { fireEvent.change(martes, { target: { value: "1" } }); });
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalled());
    const [, , , exits, entries, prev] = service.saveProductData.mock.calls.at(-1)!;
    expect([exits.length, entries.length, prev.length]).toEqual([42, 6, 6]);
  });

  it("cambiar de semana con los botones lleva a la semana 6 y de vuelta", async () => {
    await renderDashboard(MARCH);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sem 6/ })); });
    expect(screen.getByText(/SEMANA 6 - Cierre del mes/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Sem 1/ })); });
    expect(screen.getByText(/SEMANA 1 - Registro Diario/)).toBeTruthy();
  });
});
