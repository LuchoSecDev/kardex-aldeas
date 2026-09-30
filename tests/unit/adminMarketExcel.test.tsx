// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMarketConsolidatedRow, AdminMarketList, AdminMarketOverview, AdminMarketRow, MarketItem } from "@/types/market";

vi.mock("@/lib/adminService", () => ({
  adminService: {
    marketOverview: vi.fn(),
    marketList: vi.fn(),
    markMarketReviewed: vi.fn(),
    marketConsolidated: vi.fn(),
    marketCatalog: vi.fn(),
  },
}));

// Las descargas reales usan Blob y un enlace: aquí solo interesa con qué datos se llaman.
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

// Sábado 3 oct 2026: pasó el plazo del viernes 2; se abre la semana del lunes 5 oct.
const NOW = new Date("2026-10-03T15:00:00Z");
const WEEK = "2026-10-05";
const ok = <T,>(data: T) => ({ data, error: null });

const row = (community: string, extra: Partial<AdminMarketRow> = {}): AdminMarketRow => ({
  community, participants: 10, sent: true, submitted_at: "2026-10-02T20:00:00Z", first_submitted_at: "2026-10-02T20:00:00Z",
  submit_count: 1, late: false, changed_after_deadline: false, reviewed: false, has_unsent_changes: false, has_draft: false,
  counts: { fruver: 1, carnes: 0, abarrotes: 0, aseo: 0 }, ...extra,
});

const overview: AdminMarketOverview = {
  week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes", "abarrotes"],
  communities: [
    row("Maná", { has_unsent_changes: true }),
    row("Fortaleza"),
    row("Shalom", { sent: false, submitted_at: null, submit_count: 0 }),
  ],
};

const cons = (community: string, kind: AdminMarketConsolidatedRow["kind"], item_id: string, name: string, quantity: number, sort_order: number, unit = "KG"): AdminMarketConsolidatedRow => ({
  community, kind, item_id, name, unit, is_event: false, sort_order, quantity,
});

const CONSOLIDATED = [
  cons("Maná", "fruver", "mf1", "ACELGA", 2.5, 1),
  cons("Fortaleza", "fruver", "mf1", "ACELGA", 1.5, 1),
  cons("Maná", "fruver", "mf3", "PAPA PASTUSA", 8, 3),
  cons("Fortaleza", "carnes", "mc1", "CARNE ASAR PORCION", 12, 1, "Porcion"),
];

const CATALOG: MarketItem[] = [
  { id: "mf1", kind: "fruver", name: "ACELGA", unit: "KG", is_event: false, sort_order: 1 },
  { id: "mf2", kind: "fruver", name: "AGUACATE", unit: "KG", is_event: false, sort_order: 2 },
  { id: "mc1", kind: "carnes", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, sort_order: 1 },
];

const detail: AdminMarketList = {
  community: "Maná", week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z",
  kinds_due: ["fruver", "carnes", "abarrotes"], sent: true, submitted_at: "2026-10-02T20:00:00Z",
  first_submitted_at: "2026-10-02T20:00:00Z", submit_count: 1, late: false, changed_after_deadline: false,
  reviewed: false, has_unsent_changes: false, participants: 11,
  lists: [
    { kind: "fruver", items: [
      { id: "mf1", name: "ACELGA", unit: "KG", is_event: false, quantity: 2.5 },
      { id: "viejo", name: "PRODUCTO RETIRADO", unit: "KG", is_event: false, quantity: 3 },
    ] },
    { kind: "carnes", items: [{ id: "mc1", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, quantity: 12 }] },
    { kind: "abarrotes", items: [] },
    { kind: "aseo", items: [] },
  ],
};

const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

async function renderLoaded() {
  render(<AdminMarketLists focus={null} />);
  await tick();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  service.marketOverview.mockResolvedValue(ok(overview));
  service.marketList.mockResolvedValue(ok(detail));
  service.marketConsolidated.mockResolvedValue(ok(CONSOLIDATED));
  service.marketCatalog.mockResolvedValue(ok(CATALOG));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("listas de mercado: consolidado entre comunidades", () => {
  async function openConsolidated() {
    await renderLoaded();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Consolidado" })); });
    await tick();
  }

  it("pide lo enviado de ESA semana y suma por producto entre comunidades", async () => {
    await openConsolidated();
    expect(service.marketConsolidated).toHaveBeenCalledWith(WEEK);
    const acelga = screen.getByRole("row", { name: /ACELGA/ });
    expect(within(acelga).getByText("4")).toBeTruthy(); // 2,5 + 1,5
    expect(screen.getByRole("row", { name: /PAPA PASTUSA/ }).textContent).toContain("8");
  });

  it("dice qué comunidades entran, cuáles faltan (plazo vencido) y cuáles tienen cambios sin enviar", async () => {
    await openConsolidated();
    const info = screen.getByRole("status").textContent ?? "";
    expect(info).toContain("enviaron 2");
    expect(info).toContain("Fortaleza, Maná");
    expect(info).toContain("Faltan por enviar: Shalom");
    expect(info).toContain("Con cambios sin enviar (no incluidos): Maná");
  });

  it("antes del plazo dice 'Aún sin enviar' en vez de 'Faltan por enviar'", async () => {
    vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
    await openConsolidated();
    const info = screen.getByRole("status").textContent ?? "";
    expect(info).toContain("Aún sin enviar: Shalom");
    expect(info).not.toContain("Faltan por enviar");
  });

  it("'Ver (n)' despliega el detalle por comunidad y 'Ocultar' lo cierra", async () => {
    await openConsolidated();
    const acelga = screen.getByRole("row", { name: /ACELGA/ });
    fireEvent.click(within(acelga).getByRole("button", { name: "Ver (2)" }));
    const table = screen.getAllByRole("table")[1];
    expect(within(table).getByRole("rowheader", { name: "Fortaleza" })).toBeTruthy();
    expect(within(table).getByText("1,5")).toBeTruthy();
    fireEvent.click(within(acelga).getByRole("button", { name: "Ocultar" }));
    expect(screen.getAllByRole("table")).toHaveLength(1);
  });

  it("cada pestaña muestra sus productos; un tipo que nadie pidió lo dice", async () => {
    await openConsolidated();
    fireEvent.click(screen.getByRole("tab", { name: /Carnes/ }));
    expect(screen.getByText("CARNE ASAR PORCION")).toBeTruthy();
    expect(screen.queryByText("ACELGA")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Aseo/ }));
    expect(screen.getByText(/Ninguna comunidad pidió aseo esta semana/)).toBeTruthy();
  });

  it("el buscador ignora tildes y mayúsculas", async () => {
    await openConsolidated();
    fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "papa" } });
    expect(screen.getByText("PAPA PASTUSA")).toBeTruthy();
    expect(screen.queryByText("ACELGA")).toBeNull();
    fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "zzz" } });
    expect(screen.getByText(/Ningún producto coincide/)).toBeTruthy();
  });

  it("'Descargar Excel consolidado' entrega la semana, lo sumado, quién entra y quién falta", async () => {
    await openConsolidated();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel consolidado" })); });
    expect(exportConsolidated).toHaveBeenCalledTimes(1);
    const args = exportConsolidated.mock.calls[0][0];
    expect(args.weekStart).toBe(WEEK);
    expect(args.included).toEqual(["Fortaleza", "Maná"]);
    expect(args.missing).toEqual(["Shalom"]);
    expect(args.byKind.fruver.find((i) => i.id === "mf1")?.total).toBe(4);
  });

  it("sin ninguna lista enviada no hay nada que descargar", async () => {
    service.marketConsolidated.mockResolvedValue(ok([]));
    await openConsolidated();
    expect(screen.getByRole("status").textContent).toContain("Ninguna comunidad ha enviado");
    expect((screen.getByRole("button", { name: "Descargar Excel consolidado" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("si la descarga falla, lo dice", async () => {
    exportConsolidated.mockRejectedValueOnce(new Error("boom"));
    await openConsolidated();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel consolidado" })); });
    expect(screen.getByRole("alert").textContent).toContain("No se pudo generar el Excel");
  });

  it("si no se puede cargar el consolidado, avisa", async () => {
    service.marketConsolidated.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } as never });
    await openConsolidated();
    expect(screen.getByRole("alert").textContent).toContain("No se pudo cargar el consolidado");
  });

  it("volver a 'Por comunidad' muestra otra vez la tabla", async () => {
    await openConsolidated();
    fireEvent.click(screen.getByRole("tab", { name: "Por comunidad" }));
    expect(screen.getByRole("rowheader", { name: "Fortaleza" })).toBeTruthy();
  });
});

describe("listas de mercado: Excel de una comunidad (formato actual)", () => {
  async function openMana() {
    await renderLoaded();
    const r = screen.getAllByRole("row").find((x) => within(x).queryByRole("rowheader", { name: "Maná" }))!;
    await act(async () => { fireEvent.click(within(r).getByRole("button", { name: "Ver lista" })); });
    await tick();
  }

  it("arma el Excel con el catálogo completo, lo enviado y los participantes", async () => {
    await openMana();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel (formato actual)" })); });
    await tick();
    expect(service.marketCatalog).toHaveBeenCalledTimes(1);
    expect(exportCommunity).toHaveBeenCalledTimes(1);
    const args = exportCommunity.mock.calls[0][0];
    expect(args).toMatchObject({ community: "Maná", weekStart: WEEK, participants: 11, catalog: CATALOG });
    expect(args.quantities.fruver).toEqual({ mf1: 2.5, viejo: 3 });
    expect(args.quantities.carnes).toEqual({ mc1: 12 });
  });

  it("un producto pedido que ya no está en el catálogo activo no se pierde: va como extra", async () => {
    await openMana();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel (formato actual)" })); });
    await tick();
    const extras = exportCommunity.mock.calls[0][0].extraItems!;
    expect(extras.fruver.map((i) => i.name)).toEqual(["PRODUCTO RETIRADO"]);
    expect(extras.carnes).toEqual([]);
  });

  it("si no se puede leer el catálogo, avisa y no descarga nada", async () => {
    service.marketCatalog.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } as never });
    await openMana();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel (formato actual)" })); });
    await tick();
    expect(exportCommunity).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("No se pudo generar el Excel de Maná");
  });
});
