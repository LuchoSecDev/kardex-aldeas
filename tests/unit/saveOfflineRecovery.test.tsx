// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KardexRecordRow } from "@/lib/kardexDataSource";

// Se cae el internet mientras se trabaja: los cambios se quedan en la página y, al volver la conexión (o a los pocos segundos si
// el navegador cree que sí hay internet), se guardan SOLOS, sin que nadie pulse nada. Pantallas completas con servicios falsos.
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
vi.mock("@/lib/marketService", () => ({
  marketService: {
    loadCatalog: vi.fn(),
    loadWeek: vi.fn(),
    saveList: vi.fn(),
    saveChanges: vi.fn(),
    setParticipants: vi.fn(),
    submitWeek: vi.fn(),
  },
}));

import KardexDashboard from "@/components/KardexDashboard";
import MarketListDashboard from "@/components/market/MarketListDashboard";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { SAVE_DEBOUNCE_MS } from "@/hooks/useMarketList";
import { kardexService } from "@/lib/kardexService";
import { marketService } from "@/lib/marketService";

const kardex = vi.mocked(kardexService, true);
const market = vi.mocked(marketService, true);

const NETWORK_ERROR = { data: null, error: { message: "Failed to fetch" } as never };
const ok = <T,>(data: T) => ({ data, error: null });
const zeros = (n: number) => Array(n).fill(0);

let online = true;
const goOffline = () => { online = false; act(() => { window.dispatchEvent(new Event("offline")); }); };
const goOnline = () => { online = true; act(() => { window.dispatchEvent(new Event("online")); }); };
// El aviso rojo fijo del guardado (no los avisos emergentes, que también son role="alert").
const banner = () => document.querySelector(".kardex-save-banner");
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
// Lo que tardan los 2 reintentos inmediatos de la cola (1 s + 3 s) hasta declarar el error.
const RETRIES_MS = 4000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
  online = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("lista de mercado: sin internet", () => {
  const CATALOG = [{ id: "mf1", kind: "fruver", name: "ACELGA", unit: "KG", is_event: false }];
  const week = {
    data: {
      week_start: "2026-10-05", friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z",
      kinds_due: ["fruver", "carnes", "abarrotes"], participants: 11, lists: [],
    },
    error: null,
  };

  async function renderMarket() {
    market.loadCatalog.mockResolvedValue({ data: CATALOG, error: null } as never);
    market.loadWeek.mockResolvedValue(week as never);
    market.saveChanges.mockResolvedValue(ok(null) as never);
    market.setParticipants.mockResolvedValue(ok(null) as never);
    render(<ToastProvider><MarketListDashboard community="Maná" onLogout={vi.fn()} /></ToastProvider>);
    await advance(0);
  }

  const write = (value: string) => fireEvent.change(screen.getByLabelText(/ACELGA/), { target: { value } });

  it("sin conexión: avisa que los cambios siguen en la página, y al volver el internet se guardan solos", async () => {
    await renderMarket();
    goOffline();
    market.saveList.mockResolvedValue(NETWORK_ERROR as never);
    write("3");
    await advance(SAVE_DEBOUNCE_MS + RETRIES_MS);

    expect(screen.getByText("No se pudo guardar")).toBeTruthy();
    expect(banner()?.textContent).toContain("Sin conexión a internet");
    expect(banner()?.textContent).toContain("se guardarán solos");
    // Lo escrito sigue en pantalla.
    expect((screen.getByLabelText(/ACELGA/) as HTMLInputElement).value).toBe("3");
    // Con el navegador sin conexión no se insiste por reloj.
    const callsOffline = market.saveList.mock.calls.length;
    await advance(5 * 60_000);
    expect(market.saveList).toHaveBeenCalledTimes(callsOffline);

    // Vuelve el internet: se reenvía lo que quedó pendiente, sin pulsar nada.
    market.saveList.mockResolvedValue(ok(null) as never);
    goOnline();
    await advance(0);
    expect(screen.getByText("✓ Todos los cambios guardados")).toBeTruthy();
    expect(banner()).toBeNull();
    const [, , quantities] = market.saveList.mock.calls.at(-1)!;
    expect(JSON.stringify(quantities)).toContain("3");
  });

  it("con el navegador «en línea» pero el servidor sin responder, reintenta solo a los 15 s", async () => {
    await renderMarket();
    market.saveList.mockResolvedValue(NETWORK_ERROR as never);
    write("2");
    await advance(SAVE_DEBOUNCE_MS + RETRIES_MS);
    expect(screen.getByText("No se pudo guardar")).toBeTruthy();
    expect(banner()?.textContent).toContain("se volverá a intentar solo");

    market.saveList.mockResolvedValue(ok(null) as never);
    await advance(15_000);
    expect(screen.getByText("✓ Todos los cambios guardados")).toBeTruthy();
  });

  it("el aviso rojo no parpadea mientras se reintenta", async () => {
    await renderMarket();
    market.saveList.mockResolvedValue(NETWORK_ERROR as never);
    write("2");
    await advance(SAVE_DEBOUNCE_MS + RETRIES_MS);
    // El reintento por reloj tarda en fallar (1 s + 3 s de espera de la cola): durante ese lapso sigue el aviso.
    await advance(15_000);
    expect(screen.getByText("Guardando…")).toBeTruthy();
    expect(banner()).not.toBeNull();
  });

  it("si falla algo que repetir no arregla (validación), igual no queda reintentando para siempre", async () => {
    await renderMarket();
    market.saveList.mockResolvedValue({ data: null, error: { code: "P0001", message: "Cantidades inválidas" } as never });
    write("2");
    await advance(SAVE_DEBOUNCE_MS);
    await advance(30 * 60_000);
    // 1 envío inicial + un máximo de reintentos automáticos (12), no uno por minuto durante media hora sin fin.
    expect(market.saveList.mock.calls.length).toBeLessThanOrEqual(1 + 12);
    expect(screen.getByText("No se pudo guardar")).toBeTruthy();
  });
});

describe("kardex: sin internet", () => {
  const PRODUCTS = [{ id: "p1", category: "ABARROTES", name: "Arroz", unit: "KG", minStock: 5 }];
  const MARZO: KardexRecordRow = {
    id: "r1", community: "Maná", year: 2026, month: 2, product_id: "p1",
    prev_balances: [0, 10, 10, 10, 10, 10], entries: [10, 0, 0, 0, 0, 0], exits: zeros(42), updated_at: "2026-03-01T00:00:00Z",
  };

  async function renderKardex() {
    kardex.loadProducts.mockResolvedValue(ok(PRODUCTS) as never);
    kardex.loadKardexMonth.mockImplementation(async (_y: number, month: number) => ok(month === 2 ? [MARZO] : []));
    kardex.loadAjustes.mockResolvedValue(ok([]));
    kardex.loadAjustesHistory.mockResolvedValue(ok([]));
    kardex.loadMonthsWithData.mockResolvedValue(ok([]));
    kardex.loadWeekSubmissions.mockResolvedValue(ok([]));
    render(
      <ToastProvider>
        <KardexDashboard community="Maná" onLogout={vi.fn()} initialYear={2026} initialMonth={2} initialWeek={1} />
      </ToastProvider>
    );
    await advance(0);
  }

  const arrozInputs = () => {
    const row = screen.getAllByRole("row").find((r) => within(r).queryByText("Arroz"))!;
    return within(row).getAllByRole("spinbutton") as HTMLInputElement[]; // [entrada, L, M, ...]
  };

  it("la salida escrita sin internet se conserva y se guarda sola al volver la conexión", async () => {
    await renderKardex();
    goOffline();
    kardex.saveProductData.mockResolvedValue(NETWORK_ERROR as never);
    await act(async () => { fireEvent.change(arrozInputs()[1], { target: { value: "2" } }); });
    await advance(RETRIES_MS);

    expect(screen.getByText("No se pudo guardar")).toBeTruthy();
    expect(banner()?.textContent).toContain("Sin conexión a internet");
    expect(arrozInputs()[1].value).toBe("2");
    const before = kardex.saveProductData.mock.calls.length;

    kardex.saveProductData.mockResolvedValue(ok(null) as never);
    goOnline();
    await advance(0);
    expect(kardex.saveProductData.mock.calls.length).toBe(before + 1);
    const [year, month, productId, exits] = kardex.saveProductData.mock.calls.at(-1)!;
    expect([year, month, productId]).toEqual([2026, 2, "p1"]);
    expect(exits[0]).toBe(2); // lunes de la semana 1
    expect(screen.getByText("✓ Todos los cambios guardados")).toBeTruthy();
    expect(banner()).toBeNull();
  });

  it("varias casillas cambiadas sin internet: al volver se envía el último valor de cada una", async () => {
    await renderKardex();
    goOffline();
    kardex.saveProductData.mockResolvedValue(NETWORK_ERROR as never);
    await act(async () => { fireEvent.change(arrozInputs()[1], { target: { value: "1" } }); });
    await act(async () => { fireEvent.change(arrozInputs()[1], { target: { value: "4" } }); });
    await act(async () => { fireEvent.change(arrozInputs()[2], { target: { value: "3" } }); });
    await advance(RETRIES_MS * 3);

    kardex.saveProductData.mockResolvedValue(ok(null) as never);
    goOnline();
    await advance(0);
    const [, , , exits] = kardex.saveProductData.mock.calls.at(-1)!;
    expect(exits[0]).toBe(4);
    expect(exits[1]).toBe(3);
    expect(screen.getByText("✓ Todos los cambios guardados")).toBeTruthy();
  });
});
