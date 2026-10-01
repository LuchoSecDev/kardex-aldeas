// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KardexRecordRow } from "@/lib/kardexDataSource";

// Toasts de la pantalla del kardex de la comunidad: descargas, corrección de saldo y envío de la semana.
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
import { ToastProvider } from "@/components/toast/ToastProvider";
import { exportKardexToExcel } from "@/lib/exporters/excelExporter";
import { exportKardexToPDF } from "@/lib/exporters/pdfExporter";
import { kardexService } from "@/lib/kardexService";

const service = vi.mocked(kardexService, true);
const excel = vi.mocked(exportKardexToExcel);
const pdf = vi.mocked(exportKardexToPDF);

const PRODUCTS = [{ id: "p1", category: "ABARROTES", name: "Arroz", unit: "KG", minStock: 5 }];
const zeros = (n: number) => Array(n).fill(0);
const ok = <T,>(data: T) => ({ data, error: null });

const MARZO: KardexRecordRow = {
  id: "r1", community: "Maná", year: 2026, month: 2, product_id: "p1",
  prev_balances: [0, 10, 10, 10, 10, 10], entries: [10, 0, 0, 0, 0, 0], exits: zeros(42), updated_at: "2026-03-01T00:00:00Z",
};

async function renderDashboard() {
  render(
    <ToastProvider>
      <KardexDashboard community="Maná" onLogout={vi.fn()} initialYear={2026} initialMonth={2} initialWeek={1} />
    </ToastProvider>
  );
  await waitFor(() => expect(screen.queryByText(/Cargando datos desde la nube/)).toBeNull());
}

const toasts = () => [...document.querySelectorAll(".toast")].map((t) => t.querySelector(".toast-text")?.textContent);

beforeEach(() => {
  service.loadProducts.mockResolvedValue(ok(PRODUCTS) as never);
  // Solo marzo trae datos: si los demás meses devolvieran el mismo registro, el saldo heredado cambiaría los números.
  service.loadKardexMonth.mockImplementation(async (_year: number, month: number) => ok(month === 2 ? [MARZO] : []));
  service.loadAjustes.mockResolvedValue(ok([]));
  service.loadAjustesHistory.mockResolvedValue(ok([]));
  service.loadMonthsWithData.mockResolvedValue(ok([]));
  service.loadWeekSubmissions.mockResolvedValue(ok([]));
  service.saveProductData.mockResolvedValue(ok(null));
  service.insertAjuste.mockResolvedValue(ok(null));
  service.submitWeek.mockResolvedValue(ok({ submitted_at: "2026-03-08T00:00:00Z", submit_count: 1 }));
  excel.mockResolvedValue(undefined);
  pdf.mockResolvedValue(undefined);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("kardex: toasts de las descargas", () => {
  it("Descargar Excel avisa «Excel descargado: Marzo 2026.»", async () => {
    await renderDashboard();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descargar Excel/ })); });
    expect(excel).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual(["Excel descargado: Marzo 2026."]);
    expect(document.querySelector(".toast--success")).not.toBeNull();
  });

  it("Descargar PDF avisa «PDF descargado: Marzo 2026.»", async () => {
    await renderDashboard();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descargar PDF/ })); });
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual(["PDF descargado: Marzo 2026."]);
  });

  it("si la descarga falla, avisa con un error que se queda (no un «descargado» falso)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    excel.mockRejectedValue(new Error("boom"));
    await renderDashboard();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descargar Excel/ })); });
    expect(toasts()).toEqual(["No se pudo descargar el Excel. Inténtalo de nuevo."]);
    expect(document.querySelector(".toast--error")).not.toBeNull();
    expect(toasts().join()).not.toContain("descargado:");
  });
});

describe("kardex: toast al corregir un saldo", () => {
  const openAjuste = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Corregir saldo anterior de Arroz" }));
    const label = await screen.findByText("Saldo real (conteo físico)");
    fireEvent.change(label.parentElement!.querySelector("input")!, { target: { value: "7" } });
    fireEvent.change(screen.getByPlaceholderText(/conteo físico, producto dañado/), { target: { value: "conteo físico" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar ajuste" })); });
  };

  it("avisa «Saldo corregido: Arroz quedó en 7.» cuando se guarda", async () => {
    await renderDashboard();
    await openAjuste();
    expect(service.insertAjuste).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual(["Saldo corregido: Arroz quedó en 7."]);
  });

  it("si no se pudo guardar el ajuste, avisa con un error (antes fallaba en silencio)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.insertAjuste.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } as never });
    await renderDashboard();
    await openAjuste();
    expect(toasts()).toEqual(["No se pudo guardar la corrección del saldo. Revisa tu conexión e inténtalo de nuevo."]);
    expect(document.querySelector(".toast--error")).not.toBeNull();
  });
});

describe("kardex: toast al enviar la semana", () => {
  const clickSend = async () => {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Enviar semana 1/ })); });
    await act(async () => { await Promise.resolve(); });
  };

  it("avisa «¡Listo! La semana 1 se envió a la nutricionista.»", async () => {
    await renderDashboard();
    await clickSend();
    expect(service.submitWeek).toHaveBeenCalledWith(2026, 2, 0);
    expect(toasts()).toContain("¡Listo! La semana 1 se envió a la nutricionista.");
    // Además del toast, el mensaje fijo de la pantalla sigue ahí (lo importante no depende de un aviso que se va).
    expect(screen.getByText(/Semana 1 enviada a la nutricionista/)).toBeTruthy();
  });

  it("una semana sin movimientos avisa con un error claro", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.submitWeek.mockResolvedValue({ data: null, error: { message: "SEMANA_VACIA" } as never });
    await renderDashboard();
    await clickSend();
    expect(toasts()).toContain("Esta semana todavía no tiene entradas ni salidas registradas.");
    expect(document.querySelector(".toast--error")).not.toBeNull();
  });

  it("un error de red avisa que revise su conexión", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.submitWeek.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } as never });
    await renderDashboard();
    await clickSend();
    expect(toasts().join()).toContain("Revisa tu conexión");
  });

  it("si la sesión venció no sale un toast de error (la pantalla vuelve a la entrada con su propio aviso)", async () => {
    service.submitWeek.mockResolvedValue({ data: null, error: { message: "SESION_INVALIDA" } as never });
    await renderDashboard();
    await clickSend();
    expect(toasts()).toEqual([]);
  });
});

describe("kardex: toast de saldo negativo (error de digitación)", () => {
  it("si una salida deja el saldo en negativo avisa con un toast ámbar, con el producto y sin el emoji repetido", async () => {
    await renderDashboard();
    const row = screen.getAllByRole("row").find((r) => within(r).queryByText("Arroz"))!;
    const domingo = within(row).getAllByRole("spinbutton").at(-1)!; // marzo 2026 empieza en domingo: es el único día de la semana 1
    await act(async () => { fireEvent.change(domingo, { target: { value: "15" } }); }); // el saldo anterior es 0 + entrada 10
    await waitFor(() => expect(document.querySelector(".toast--warning")).not.toBeNull(), { timeout: 3000 });

    const text = document.querySelector(".toast--warning .toast-text")!.textContent!;
    expect(text).toContain("Arroz — el saldo de la Semana 1 quedó en -5");
    expect(text).not.toContain("⚠");
    expect(document.querySelector(".toast--warning .toast-icon")!.textContent).toBe("⚠");
  });
});

describe("kardex: sin proveedor de avisos", () => {
  it("la pantalla funciona igual (las pruebas anteriores la montan sin ToastProvider)", async () => {
    render(<KardexDashboard community="Maná" onLogout={vi.fn()} initialYear={2026} initialMonth={2} initialWeek={1} />);
    await waitFor(() => expect(screen.queryByText(/Cargando datos desde la nube/)).toBeNull());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descargar Excel/ })); });
    expect(excel).toHaveBeenCalledTimes(1);
    expect(within(document.body).queryAllByText(/descargado/)).toHaveLength(0);
  });
});
