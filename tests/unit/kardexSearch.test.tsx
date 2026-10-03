// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterProductsByName, noProductsMessage } from "@/lib/productSearch";
import type { KardexRecordRow } from "@/lib/kardexDataSource";

// Buscador por nombre del kardex: la regla (sin tildes ni mayúsculas) y cómo se combina con la categoría en la pantalla.
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
import { kardexService } from "@/lib/kardexService";

const service = vi.mocked(kardexService, true);
const excel = vi.mocked(exportKardexToExcel);

const PRODUCTS = [
  { id: "p1", category: "ABARROTES", name: "Arroz", unit: "KG", minStock: 5 },
  { id: "p2", category: "ABARROTES", name: "Arveja verde", unit: "KG", minStock: 5 },
  { id: "p3", category: "LACTEOS", name: "Leche entera", unit: "LT", minStock: 5 },
  { id: "p4", category: "FRUTAS Y VERDURAS", name: "Cebolla larga", unit: "KG", minStock: 5 },
  { id: "p5", category: "PANADERIA", name: "Pan tajado", unit: "UND", minStock: 5 },
];
const ok = <T,>(data: T) => ({ data, error: null });
const NO_DATA: KardexRecordRow[] = [];

async function renderDashboard() {
  render(
    <ToastProvider>
      <KardexDashboard community="Maná" onLogout={vi.fn()} initialYear={2026} initialMonth={2} initialWeek={1} />
    </ToastProvider>
  );
  await waitFor(() => expect(screen.queryByText(/Cargando datos desde la nube/)).toBeNull());
}

const search = (value: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Buscar producto" }), { target: { value } });
// Los nombres de producto de la tabla (la primera celda de cada fila de producto).
const names = () => [...document.querySelectorAll("td.kardex-sticky-td")].map((td) => td.textContent);

beforeEach(() => {
  service.loadProducts.mockResolvedValue(ok(PRODUCTS) as never);
  service.loadKardexMonth.mockResolvedValue(ok(NO_DATA));
  service.loadAjustes.mockResolvedValue(ok([]));
  service.loadAjustesHistory.mockResolvedValue(ok([]));
  service.loadMonthsWithData.mockResolvedValue(ok([]));
  service.loadWeekSubmissions.mockResolvedValue(ok([]));
  excel.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("filterProductsByName", () => {
  const items = [{ name: "LÁCTEOS en polvo" }, { name: "Arroz" }, { name: "Piña" }];

  it("ignora mayúsculas, tildes y espacios de los lados", () => {
    expect(filterProductsByName(items, "lacteos").map((i) => i.name)).toEqual(["LÁCTEOS en polvo"]);
    expect(filterProductsByName(items, "  ARROZ ").map((i) => i.name)).toEqual(["Arroz"]);
    expect(filterProductsByName(items, "pina").map((i) => i.name)).toEqual(["Piña"]);
  });

  it("encuentra el texto en cualquier parte del nombre", () => {
    expect(filterProductsByName(items, "polvo")).toHaveLength(1);
    expect(filterProductsByName(items, "rro")).toHaveLength(1);
  });

  it("vacío o solo espacios no filtra, y lo que no existe da lista vacía", () => {
    expect(filterProductsByName(items, "")).toHaveLength(3);
    expect(filterProductsByName(items, "   ")).toHaveLength(3);
    expect(filterProductsByName(items, "zzz")).toEqual([]);
  });

  it("el mensaje sin resultados sugiere quitar la categoría solo si hay una elegida", () => {
    expect(noProductsMessage(" abc ", "TODAS")).toBe("Ningún producto coincide con «abc».");
    expect(noProductsMessage("abc", "LACTEOS")).toContain("categoría LACTEOS");
    expect(noProductsMessage("abc", "LACTEOS")).toContain("Todas las categorías");
  });
});

describe("kardex: buscador de productos", () => {
  it("sin escribir nada se ven todos los productos y no hay contador", async () => {
    await renderDashboard();
    expect(names()).toEqual(["Arroz", "Arveja verde", "Leche entera", "Cebolla larga", "Pan tajado"]);
    expect(document.querySelector(".kardex-search-count")?.textContent).toBe("");
  });

  it("al escribir deja solo los productos que coinciden y cuenta los resultados", async () => {
    await renderDashboard();
    search("ar");
    // «ar» está en Arroz y en Arveja; también en «Cebolla larga» (l-ar-ga).
    expect(names()).toEqual(["Arroz", "Arveja verde", "Cebolla larga"]);
    expect(screen.getByText("3 productos")).toBeTruthy();
    search("arr");
    expect(names()).toEqual(["Arroz"]);
    expect(screen.getByText("1 producto")).toBeTruthy();
  });

  it("encuentra sin importar tildes ni mayúsculas, y al borrar vuelven todos", async () => {
    await renderDashboard();
    search("LECHE");
    expect(names()).toEqual(["Leche entera"]);
    search("");
    expect(names()).toHaveLength(5);
  });

  it("se combina con la categoría: busca solo dentro de la elegida", async () => {
    await renderDashboard();
    // Elegir la categoría ABARROTES en el selector propio de la app.
    fireEvent.click(screen.getByRole("button", { name: /Todas las categorías/ }));
    fireEvent.click(await screen.findByRole("option", { name: "ABARROTES" }));
    expect(names()).toEqual(["Arroz", "Arveja verde"]);
    search("leche");
    expect(names()).toEqual([]);
    // Explica por qué no hay nada y qué probar.
    expect(screen.getByText(/Ningún producto de la categoría ABARROTES coincide con «leche»/)).toBeTruthy();
  });

  it("sin coincidencias avisa en la tarjeta del buscador (siempre visible); con la categoría en TODAS no habla de categorías", async () => {
    await renderDashboard();
    search("zzz");
    expect(names()).toEqual([]);
    const aviso = screen.getByText("Ningún producto coincide con «zzz».");
    expect(aviso.className).toBe("kardex-search-empty");
    expect(screen.queryByText("0 productos")).toBeNull();
  });

  it("la búsqueda solo cambia lo que se ve: el Excel sigue llevando todos los productos", async () => {
    await renderDashboard();
    search("arroz");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descargar Excel/ })); });
    expect(excel).toHaveBeenCalledTimes(1);
    expect(excel.mock.calls[0][0].products).toHaveLength(5);
  });

  it("la búsqueda se conserva al cambiar de semana", async () => {
    await renderDashboard();
    search("pan");
    fireEvent.click(screen.getByRole("button", { name: /Sem 2/ }));
    expect(names()).toEqual(["Pan tajado"]);
    expect((screen.getByRole("searchbox", { name: "Buscar producto" }) as HTMLInputElement).value).toBe("pan");
  });
});
