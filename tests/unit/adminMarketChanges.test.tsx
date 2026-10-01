// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMarketChange, AdminMarketConsolidatedRow, AdminMarketList, AdminMarketOverview, AdminMarketRow, MarketItem } from "@/types/market";

// Zona de cambios, panel de la nutricionista (plan 008, Fase C): ve los cambios que pidió cada comunidad junto a
// lo pedido, y salen en los Excel.
vi.mock("@/lib/adminService", () => ({
  adminService: {
    marketOverview: vi.fn(),
    marketList: vi.fn(),
    markMarketReviewed: vi.fn(),
    marketConsolidated: vi.fn(),
    marketCatalog: vi.fn(),
  },
}));

vi.mock("@/lib/exporters/marketExporter", () => ({
  exportConsolidatedToExcel: vi.fn().mockResolvedValue(undefined),
  exportCommunityListToExcel: vi.fn().mockResolvedValue(undefined),
}));

import AdminMarketLists from "@/components/admin/AdminMarketLists";
import { adminService } from "@/lib/adminService";
import { exportCommunityListToExcel, exportConsolidatedToExcel } from "@/lib/exporters/marketExporter";

const service = vi.mocked(adminService, true);
const exportConsolidated = vi.mocked(exportConsolidatedToExcel);
const exportCommunity = vi.mocked(exportCommunityListToExcel);

const NOW = new Date("2026-10-03T15:00:00Z");
const WEEK = "2026-10-05";
const ok = <T,>(data: T) => ({ data, error: null });

const row = (community: string, extra: Partial<AdminMarketRow> = {}): AdminMarketRow => ({
  community, participants: 10, sent: true, submitted_at: "2026-10-02T20:00:00Z", first_submitted_at: "2026-10-02T20:00:00Z",
  submit_count: 1, late: false, changed_after_deadline: false, reviewed: false, has_unsent_changes: false, has_draft: false,
  counts: { fruver: 1, carnes: 1, abarrotes: 0, aseo: 0 }, ...extra,
});

const overview = (communities: AdminMarketRow[]): AdminMarketOverview => ({
  week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes", "abarrotes"], communities,
});

const note = (id: string, text: string, item_id: string | null = null, item_name: string | null = null, unit: string | null = null): AdminMarketChange => ({
  id, item_id, item_name, unit, text, at: "2026-10-02T19:00:00Z",
});

const detail = (community: string, changes: { fruver?: AdminMarketChange[]; carnes?: AdminMarketChange[] } = {}): AdminMarketList => ({
  community, week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes", "abarrotes"],
  sent: true, submitted_at: "2026-10-02T20:00:00Z", first_submitted_at: "2026-10-02T20:00:00Z", submit_count: 1, late: false,
  changed_after_deadline: false, reviewed: false, has_unsent_changes: false, participants: 11,
  lists: [
    { kind: "fruver", items: [{ id: "mf1", name: "ACELGA", unit: "KG", is_event: false, quantity: 2 }], changes: changes.fruver ?? [] },
    { kind: "carnes", items: [{ id: "mc1", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, quantity: 3 }], changes: changes.carnes ?? [] },
    { kind: "abarrotes", items: [], changes: [] },
    { kind: "aseo", items: [], changes: [] },
  ],
});

const CATALOG: MarketItem[] = [
  { id: "mf1", kind: "fruver", name: "ACELGA", unit: "KG", is_event: false, sort_order: 1 },
  { id: "mc1", kind: "carnes", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, sort_order: 1 },
];

const CONSOLIDATED: AdminMarketConsolidatedRow[] = [
  { community: "Maná", kind: "fruver", item_id: "mf1", name: "ACELGA", unit: "KG", is_event: false, sort_order: 1, quantity: 2 },
  { community: "Fortaleza", kind: "carnes", item_id: "mc1", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, sort_order: 1, quantity: 3 },
];

const PESCADO = note("a", "Cambiar pescado por pechuga", "mc2", "PESCADO FILETE", "KG");
const GENERAL = note("b", "Entregar temprano");

async function renderLoaded() {
  render(<AdminMarketLists focus={null} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  service.marketOverview.mockResolvedValue(ok(overview([
    row("Maná", { changes_count: 2 }),
    row("Fortaleza", { changes_count: 1 }),
    row("Shalom"),
  ])));
  service.marketList.mockImplementation(async (community: string) =>
    ok(community === "Maná" ? detail("Maná", { carnes: [PESCADO, GENERAL] })
      : community === "Fortaleza" ? detail("Fortaleza", { fruver: [note("c", "Acelga sin hojas dañadas", "mf1", "ACELGA", "KG")] })
      : detail(community)));
  service.marketConsolidated.mockResolvedValue(ok(CONSOLIDATED));
  service.marketCatalog.mockResolvedValue(ok(CATALOG));
  service.markMarketReviewed.mockResolvedValue(ok(null));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const openDetail = async (community: string) => {
  const tr = screen.getByRole("rowheader", { name: community }).closest("tr")!;
  await act(async () => { fireEvent.click(within(tr).getByRole("button", { name: "Ver lista" })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
};

describe("cambios solicitados: resumen de la semana", () => {
  it("marca en la tabla cuántos cambios pidió cada comunidad que envió", async () => {
    await renderLoaded();
    const mana = screen.getByRole("rowheader", { name: "Maná" }).closest("tr")!;
    expect(mana.textContent).toContain("📝 2 cambios");
    const fortaleza = screen.getByRole("rowheader", { name: "Fortaleza" }).closest("tr")!;
    expect(fortaleza.textContent).toContain("📝 1 cambio");
    expect(fortaleza.textContent).not.toContain("1 cambios");
    expect(screen.getByRole("rowheader", { name: "Shalom" }).closest("tr")!.textContent).not.toContain("📝");
  });

  it("una comunidad que aún no envía no muestra cambios, aunque el servidor mande el número", async () => {
    service.marketOverview.mockResolvedValue(ok(overview([row("Maná", { sent: false, submitted_at: null, changes_count: 3 })])));
    await renderLoaded();
    expect(screen.getByRole("rowheader", { name: "Maná" }).closest("tr")!.textContent).not.toContain("📝");
  });

  it("un servidor anterior que no manda `changes_count` no rompe nada", async () => {
    service.marketOverview.mockResolvedValue(ok(overview([row("Maná")])));
    await renderLoaded();
    expect(screen.getByRole("rowheader", { name: "Maná" })).toBeTruthy();
  });
});

describe("cambios solicitados: detalle de una comunidad", () => {
  it("muestra un bloque «Cambios solicitados» en el tipo que los trae, con el producto y el texto", async () => {
    await renderLoaded();
    await openDetail("Maná");

    const block = screen.getByRole("group", { name: "Cambios solicitados de Carnes" });
    expect(within(block).getByText("📝 Cambios solicitados")).toBeTruthy();
    expect(within(block).getByText("PESCADO FILETE")).toBeTruthy();
    expect(within(block).getByText("Cambiar pescado por pechuga")).toBeTruthy();
    expect(within(block).getByText("General")).toBeTruthy();
    expect(within(block).getByText("Entregar temprano")).toBeTruthy();
    // Los otros tipos no tienen bloque.
    expect(screen.queryByRole("group", { name: "Cambios solicitados de Fruver y lácteos" })).toBeNull();
  });

  it("avisa arriba cuántos cambios trae la lista", async () => {
    await renderLoaded();
    await openDetail("Maná");
    expect(screen.getByText("📝 2 cambios solicitados")).toBeTruthy();
  });

  it("una lista sin cambios no muestra ni el bloque ni el aviso", async () => {
    await renderLoaded();
    await openDetail("Shalom");
    expect(screen.queryByText(/cambios? solicitados?/)).toBeNull();
    expect(screen.queryByRole("group", { name: /Cambios solicitados/ })).toBeNull();
  });

  it("el texto de una nota se muestra como texto, nunca como HTML", async () => {
    service.marketList.mockResolvedValue(ok(detail("Maná", { carnes: [note("x", "<img src=x onerror=alert(1)> <b>negrita</b>")] })));
    await renderLoaded();
    await openDetail("Maná");
    const block = screen.getByRole("group", { name: "Cambios solicitados de Carnes" });
    expect(block.querySelector("img")).toBeNull();
    expect(block.querySelector("b")).toBeNull();
    expect(block.textContent).toContain("<b>negrita</b>");
  });

  it("el Excel de la comunidad lleva las notas de cada tipo", async () => {
    await renderLoaded();
    await openDetail("Maná");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel (formato actual)" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(exportCommunity).toHaveBeenCalledTimes(1);
    const args = exportCommunity.mock.calls[0][0];
    expect(args.changes?.carnes?.map((c) => c.text)).toEqual(["Cambiar pescado por pechuga", "Entregar temprano"]);
    expect(args.changes?.fruver).toEqual([]);
  });
});

describe("cambios solicitados: consolidado de la semana", () => {
  const openConsolidated = async () => {
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Consolidado" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  };

  it("junta los cambios de las comunidades que los enviaron, por comunidad, y pide solo esos detalles", async () => {
    await renderLoaded();
    await openConsolidated();

    expect(service.marketList.mock.calls.map((c) => c[0]).sort()).toEqual(["Fortaleza", "Maná"]);
    const block = screen.getByRole("region", { name: "Cambios solicitados por las comunidades" });
    expect(block.textContent).toContain("Cambios solicitados (3)");
    const text = block.textContent ?? "";
    expect(text.indexOf("Fortaleza")).toBeLessThan(text.indexOf("Maná"));
    expect(within(block).getByText("Acelga sin hojas dañadas")).toBeTruthy();
    expect(within(block).getByText("Cambiar pescado por pechuga")).toBeTruthy();
    expect(within(block).getAllByText("Carnes").length).toBeGreaterThan(0);
  });

  it("el Excel consolidado se descarga con esos cambios", async () => {
    await renderLoaded();
    await openConsolidated();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel consolidado" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(exportConsolidated).toHaveBeenCalledTimes(1);
    const args = exportConsolidated.mock.calls[0][0];
    expect(args.changes?.map((c) => `${c.community}|${c.kind}|${c.text}`)).toEqual([
      "Fortaleza|fruver|Acelga sin hojas dañadas",
      "Maná|carnes|Cambiar pescado por pechuga",
      "Maná|carnes|Entregar temprano",
    ]);
  });

  it("si no se pueden cargar los cambios, avisa y bloquea el Excel (para que no salga sin ellos)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.marketList.mockImplementation(async (community: string) =>
      community === "Maná" ? { data: null, error: { message: "Failed to fetch" } as never } : ok(detail(community)));
    await renderLoaded();
    await openConsolidated();

    expect(screen.getByRole("alert").textContent).toContain("No se pudieron cargar los cambios solicitados");
    expect((screen.getByRole("button", { name: "Descargar Excel consolidado" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("region", { name: "Cambios solicitados por las comunidades" })).toBeNull();
  });

  it("si ninguna comunidad pidió cambios no consulta detalles ni muestra el bloque, y el Excel se descarga", async () => {
    service.marketOverview.mockResolvedValue(ok(overview([row("Maná"), row("Fortaleza")])));
    await renderLoaded();
    await openConsolidated();

    expect(service.marketList).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Cambios solicitados por las comunidades" })).toBeNull();
    const button = screen.getByRole("button", { name: "Descargar Excel consolidado" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await act(async () => { fireEvent.click(button); });
    expect(exportConsolidated.mock.calls[0][0].changes).toEqual([]);
  });
});
