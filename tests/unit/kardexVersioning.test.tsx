// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KardexRecordRow } from "@/lib/kardexDataSource";

// Control de versión al guardar (plan 012): la pantalla manda la versión que leyó, la actualiza con cada respuesta y, si otra persona
// cambió el producto, no pisa nada: avisa, recarga lo último y no reintenta.
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
vi.mock("@/lib/exporters/excelExporter", () => ({ exportKardexToExcel: vi.fn() }));
vi.mock("@/lib/exporters/pdfExporter", () => ({ exportKardexToPDF: vi.fn() }));

import KardexDashboard from "@/components/KardexDashboard";
import { useKardexData } from "@/hooks/useKardexData";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { kardexService } from "@/lib/kardexService";

const service = vi.mocked(kardexService, true);

const PRODUCTS = [
  { id: "p1", category: "ABARROTES", name: "Arroz", unit: "KG", minStock: 5 },
  { id: "p2", category: "ABARROTES", name: "Lentejas", unit: "KG", minStock: 5 },
];
const zeros = (n: number) => Array(n).fill(0);
const ok = <T,>(data: T) => ({ data, error: null });
const CONFLICT = { data: null, error: { code: "P0001", message: "CONFLICTO_VERSION" } as never };

// Versiones con microsegundos, como las devuelve Postgres: se comparan como TEXTO.
const V0 = "2026-03-01T10:00:00.123456+00:00";
const V1 = "2026-03-01T10:05:00.654321+00:00";
const V2 = "2026-03-01T10:06:00.111111+00:00";
const V9 = "2026-03-01T11:00:00.999999+00:00";

const row = (productId: string, over: Partial<KardexRecordRow> = {}): KardexRecordRow => ({
  id: `r-${productId}`, community: "Maná", year: 2026, month: 2, product_id: productId,
  prev_balances: [0, 10, 10, 10, 10, 10], entries: [10, 0, 0, 0, 0, 0], exits: zeros(42), updated_at: V0, ...over,
});

async function renderDashboard() {
  render(
    <ToastProvider>
      <KardexDashboard community="Maná" onLogout={vi.fn()} initialYear={2026} initialMonth={2} initialWeek={1} />
    </ToastProvider>
  );
  await waitFor(() => expect(screen.queryByText(/Cargando datos desde la nube/)).toBeNull());
}

const rowOf = (name: string) => screen.getAllByRole("row").find((r) => within(r).queryByText(name))!;
const inputs = (name: string) => within(rowOf(name)).getAllByRole("spinbutton") as HTMLInputElement[]; // [entrada, L, M, …]
const type = async (name: string, index: number, value: string) => {
  await act(async () => { fireEvent.change(inputs(name)[index], { target: { value } }); });
};
const sentVersion = (callIndex: number) => service.saveProductData.mock.calls[callIndex]?.[6];

beforeEach(() => {
  service.loadProducts.mockResolvedValue(ok(PRODUCTS) as never);
  service.loadKardexMonth.mockImplementation(async (_y: number, month: number) => ok(month === 2 ? [row("p1")] : []));
  service.loadAjustes.mockResolvedValue(ok([]));
  service.loadAjustesHistory.mockResolvedValue(ok([]));
  service.loadMonthsWithData.mockResolvedValue(ok([]));
  service.loadWeekSubmissions.mockResolvedValue(ok([]));
  service.saveProductData.mockResolvedValue(ok(V1) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("versión que se envía", () => {
  it("el primer guardado de un producto con fila manda la versión que leyó (texto, con microsegundos)", async () => {
    await renderDashboard();
    await type("Arroz", 1, "2");
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalledTimes(1));
    expect(sentVersion(0)).toBe(V0);
  });

  it("un producto sin fila manda null («no había fila»)", async () => {
    await renderDashboard();
    await type("Lentejas", 1, "1");
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalledTimes(1));
    expect(sentVersion(0)).toBeNull();
  });

  it("después de guardar, el siguiente guardado del mismo producto usa la versión que devolvió el servidor", async () => {
    service.saveProductData.mockResolvedValueOnce(ok(V1) as never).mockResolvedValueOnce(ok(V2) as never).mockResolvedValue(ok("2026-03-01T10:07:00.000001+00:00") as never);
    await renderDashboard();
    await type("Arroz", 1, "2");
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalledTimes(1));
    await type("Arroz", 2, "3");
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalledTimes(2));
    await type("Arroz", 3, "4");
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalledTimes(3));
    expect([sentVersion(0), sentVersion(1), sentVersion(2)]).toEqual([V0, V1, V2]);
  });

  it("cada producto lleva su propia versión", async () => {
    service.loadKardexMonth.mockImplementation(async (_y: number, month: number) =>
      ok(month === 2 ? [row("p1", { updated_at: V0 }), row("p2", { updated_at: V9 })] : []));
    await renderDashboard();
    await type("Arroz", 1, "1");
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalledTimes(1));
    await type("Lentejas", 1, "1");
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalledTimes(2));
    expect(sentVersion(0)).toBe(V0);
    expect(sentVersion(1)).toBe(V9);
  });
});

describe("conflicto: otra persona cambió el producto", () => {
  it("avisa con nombres de producto, no reintenta y carga lo último del servidor", async () => {
    await provokeConflictAfterFirstLoad();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Otra persona cambió estos datos");
    expect(dialog.textContent).toContain("Arroz");
    expect(dialog.textContent).toContain("no se guardó");
    // Un solo envío: el conflicto no se reintenta.
    expect(service.saveProductData).toHaveBeenCalledTimes(1);
    // La pantalla muestra lo que guardó la otra persona (7), no lo que esta escribió (2).
    await waitFor(() => expect(inputs("Arroz")[1].value).toBe("7"));
  });

  async function provokeConflictAfterFirstLoad() {
    service.saveProductData.mockResolvedValueOnce(CONFLICT);
    await renderDashboard();
    // A partir de aquí la lectura trae lo que guardó la otra persona.
    service.loadKardexMonth.mockImplementation(async (_y: number, month: number) =>
      ok(month === 2 ? [row("p1", { updated_at: V9, exits: [7, ...zeros(41)] })] : []));
    await type("Arroz", 1, "2");
  }

  it("después de «Entendido», el siguiente guardado usa la versión recién cargada (no choca otra vez)", async () => {
    await provokeConflictAfterFirstLoad();
    fireEvent.click(await screen.findByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(inputs("Arroz")[1].value).toBe("7"));
    service.saveProductData.mockResolvedValue(ok(V2) as never);
    await type("Arroz", 2, "3");
    await waitFor(() => expect(service.saveProductData).toHaveBeenCalledTimes(2));
    expect(sentVersion(1)).toBe(V9);
  });

  it("no queda el aviso rojo de «No se pudo guardar»: el conflicto no es una falla de red", async () => {
    await provokeConflictAfterFirstLoad();
    await screen.findByRole("alertdialog");
    expect(screen.queryByText("No se pudo guardar")).toBeNull();
    expect(document.querySelector(".kardex-save-banner")).toBeNull();
  });

  it("con varios productos rechazados los nombra a todos", async () => {
    service.loadKardexMonth.mockImplementation(async (_y: number, month: number) =>
      ok(month === 2 ? [row("p1"), row("p2")] : []));
    service.saveProductData.mockResolvedValue(CONFLICT);
    await renderDashboard();
    await type("Arroz", 1, "1");
    await type("Lentejas", 1, "1");
    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => expect(dialog.textContent).toContain("Arroz y Lentejas"));
  });

  it("Esc también cierra el aviso", async () => {
    await provokeConflictAfterFirstLoad();
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("conflicto combinado con otros casos", () => {
  it("lo que se escribió encima de la vista vieja mientras el guardado estaba en vuelo tampoco se envía", async () => {
    let answer!: (r: typeof CONFLICT) => void;
    service.saveProductData.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve as never; }));
    await renderDashboard();
    await type("Arroz", 1, "2"); // sale el primer guardado (queda en vuelo)
    await type("Arroz", 2, "3"); // este queda pendiente detrás del primero
    expect(service.saveProductData).toHaveBeenCalledTimes(1);
    await act(async () => { answer(CONFLICT); });
    await screen.findByRole("alertdialog");
    // El pendiente se descartó: enviarlo habría pisado lo de la otra persona con datos de una vista vieja.
    expect(service.saveProductData).toHaveBeenCalledTimes(1);
  });

  it("si otro producto quedó sin poder guardarse, NO se recarga todavía (se perdería de pantalla lo que falta enviar); se recarga al lograrlo", async () => {
    service.loadKardexMonth.mockImplementation(async (_y: number, month: number) => ok(month === 2 ? [row("p1"), row("p2")] : []));
    // Arroz: el conflicto llega tarde; Lentejas: falla enseguida (error que no se arregla solo repitiéndolo).
    let answerArroz!: (r: typeof CONFLICT) => void;
    service.saveProductData.mockImplementation((_y: number, _m: number, productId: string) =>
      productId === "p1"
        ? new Promise((resolve) => { answerArroz = resolve as never; })
        : Promise.resolve({ data: null, error: { code: "P0001", message: "Cantidades inválidas" } as never }));
    await renderDashboard();
    const loadsBefore = service.loadKardexMonth.mock.calls.length;
    await type("Arroz", 1, "1");
    await type("Lentejas", 1, "1");
    await act(async () => { answerArroz(CONFLICT); });
    await waitFor(() => expect(screen.getByText("No se pudo guardar")).toBeTruthy());
    // Hay un guardado fallido pendiente: todavía no se recarga ni se muestra el aviso.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(service.loadKardexMonth.mock.calls.length).toBe(loadsBefore);
    expect(inputs("Lentejas")[1].value).toBe("1");

    // Al lograr guardarlo, la cola se asienta: ahora sí se recarga y se avisa del conflicto de Arroz.
    service.saveProductData.mockResolvedValue(ok(V2) as never);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Arroz");
    expect(service.loadKardexMonth.mock.calls.length).toBeGreaterThan(loadsBefore);
  });
});

describe("buildMonthState", () => {
  it("lleva la versión de cada producto y null si todavía no tiene fila", async () => {
    const { buildMonthState } = await import("@/lib/monthState");
    const state = buildMonthState(PRODUCTS, [row("p1", { updated_at: V0 })], [], []);
    expect(state.versions).toEqual({ p1: V0, p2: null });
  });
});

describe("una carga lenta no devuelve la versión a una más vieja", () => {
  it("si un guardado termina mientras se lee el mes, la lectura vieja no pisa su versión (daría un falso conflicto)", async () => {
    const products = PRODUCTS;
    let finishLoad!: (rows: KardexRecordRow[]) => void;
    const dataSource = {
      loadKardexMonth: vi.fn(async (_y: number, month: number) => {
        if (month !== 2) return ok([] as KardexRecordRow[]);
        if (dataSource.loadKardexMonth.mock.calls.filter((c) => c[1] === 2).length === 1) return ok([row("p1", { updated_at: V0 })]);
        return new Promise<{ data: KardexRecordRow[]; error: null }>((resolve) => { finishLoad = (rows) => resolve(ok(rows)); });
      }),
      loadAjustes: vi.fn(async () => ok([])),
      loadAjustesHistory: vi.fn(async () => ok([])),
      loadMonthsWithData: vi.fn(async () => ok([])),
    };
    const { result } = renderHook(() => useKardexData("Maná", 2026, 2, products, dataSource as never));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Se pide recargar el mes: la lectura queda pendiente (empezó con Arroz en V0)…
    act(() => { result.current.reload(); });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    // …y mientras tanto el guardado de Arroz termina y devuelve V1.
    service.saveProductData.mockResolvedValue(ok(V1) as never);
    await act(async () => { await result.current.saveProductData("p1", zeros(42), zeros(6), zeros(6)); });
    expect(sentVersion(0)).toBe(V0);
    // La lectura llega tarde, con la versión de ANTES del guardado.
    await act(async () => { finishLoad([row("p1", { updated_at: V0 })]); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // El siguiente guardado debe usar V1 (la del guardado), no V0.
    service.saveProductData.mockResolvedValue(ok(V2) as never);
    await act(async () => { await result.current.saveProductData("p1", zeros(42), zeros(6), zeros(6)); });
    expect(sentVersion(1)).toBe(V1);
  });
});
