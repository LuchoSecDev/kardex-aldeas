// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMarketList, AdminMarketOverview, AdminMarketRow } from "@/types/market";

vi.mock("@/lib/adminService", () => ({
  adminService: {
    marketOverview: vi.fn(),
    marketList: vi.fn(),
    markMarketReviewed: vi.fn(),
  },
}));

import AdminMarketLists from "@/components/admin/AdminMarketLists";
import { adminService } from "@/lib/adminService";

const service = vi.mocked(adminService, true);

// Sábado 3 oct 2026, 10 a. m. en Bogotá: pasó el plazo del viernes 2 y se abre esa semana (lunes 5 oct).
const NOW = new Date("2026-10-03T15:00:00Z");
const WEEK = "2026-10-05";

const row = (community: string, extra: Partial<AdminMarketRow> = {}): AdminMarketRow => ({
  community, participants: 10, sent: false, submitted_at: null, first_submitted_at: null, submit_count: 0,
  late: false, changed_after_deadline: false, reviewed: false, has_unsent_changes: false, has_draft: false,
  counts: { fruver: 0, carnes: 0, abarrotes: 0, aseo: 0 }, ...extra,
});

const sentRow = (community: string, extra: Partial<AdminMarketRow> = {}) =>
  row(community, {
    sent: true, submitted_at: "2026-10-02T20:00:00Z", first_submitted_at: "2026-10-02T20:00:00Z", submit_count: 1,
    counts: { fruver: 12, carnes: 3, abarrotes: 0, aseo: 0 }, ...extra,
  });

const overview = (communities: AdminMarketRow[], extra: Partial<AdminMarketOverview> = {}): AdminMarketOverview => ({
  week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z",
  kinds_due: ["fruver", "carnes", "abarrotes"], communities, ...extra,
});

const detail = (extra: Partial<AdminMarketList> = {}): AdminMarketList => ({
  community: "Maná", week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z",
  kinds_due: ["fruver", "carnes", "abarrotes"], sent: true, submitted_at: "2026-10-02T20:00:00Z",
  first_submitted_at: "2026-10-02T20:00:00Z", submit_count: 1, late: false, changed_after_deadline: false,
  reviewed: false, has_unsent_changes: false, participants: 11,
  lists: [
    { kind: "fruver", items: [
      { id: "mf1", name: "ACELGA", unit: "KG", is_event: false, quantity: 2.5 },
      { id: "mf4", name: "ARANDANOS (evento)", unit: "KG", is_event: true, quantity: 1 },
    ] },
    { kind: "carnes", items: [{ id: "mc1", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, quantity: 12 }] },
    { kind: "abarrotes", items: [] },
    { kind: "aseo", items: [] },
  ],
  ...extra,
});

const ok = <T,>(data: T) => ({ data, error: null });

async function renderLoaded(props: Partial<React.ComponentProps<typeof AdminMarketLists>> = {}) {
  render(<AdminMarketLists focus={null} {...props} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  service.marketOverview.mockResolvedValue(ok(overview([
    sentRow("Maná"),
    sentRow("Fortaleza", { reviewed: true }),
    sentRow("Shalom", { late: true }),
    row("Renacer", { has_draft: true }),
    row("Leones"),
  ])));
  service.marketList.mockResolvedValue(ok(detail()));
  service.markMarketReviewed.mockResolvedValue(ok(null));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("listas de mercado (nutricionista): resumen de la semana", () => {
  it("abre la semana de las listas más recientes y pide ESA semana al servidor", async () => {
    await renderLoaded();
    expect(service.marketOverview).toHaveBeenCalledWith(WEEK);
    expect(screen.getByRole("heading", { name: /Semana 2 de octubre · 5 oct – 11 oct/ })).toBeTruthy();
    expect(screen.getByText(/Plazo de envío: viernes/)).toBeTruthy();
  });

  it("resume cuántas enviaron, cuántas por revisar, tarde y las que faltan (plazo vencido)", async () => {
    await renderLoaded();
    const summary = screen.getByRole("status").textContent ?? "";
    expect(summary).toContain("Enviaron 3 de 5");
    expect(summary).toContain("2 por revisar");
    expect(summary).toContain("1 revisadas");
    expect(summary).toContain("1 tarde");
    expect(summary).toContain("faltan 2 (plazo vencido)");
  });

  it("muestra el estado de cada comunidad", async () => {
    await renderLoaded();
    const rows = screen.getAllByRole("row").slice(1);
    const byName = (name: string) => rows.find((r) => within(r).queryByRole("rowheader", { name }))!;
    expect(byName("Maná").textContent).toContain("Por revisar");
    expect(byName("Fortaleza").textContent).toContain("Revisada");
    expect(byName("Shalom").textContent).toContain("Tarde");
    expect(byName("Renacer").textContent).toContain("Falta por enviar");
    expect(byName("Renacer").textContent).toContain("Llenando");
    expect(byName("Leones").textContent).toContain("Falta por enviar");
  });

  it("antes del plazo dice 'Aún sin enviar' y no 'Falta por enviar'", async () => {
    vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
    await renderLoaded();
    expect(screen.queryByText("Falta por enviar", { selector: "td span" })).toBeNull();
    expect(screen.getAllByText("Aún sin enviar").length).toBeGreaterThan(0);
  });

  it("cuenta por tipo lo ENVIADO y usa guion si ese viernes no tocaba el tipo", async () => {
    await renderLoaded();
    const mana = screen.getAllByRole("row").find((r) => within(r).queryByRole("rowheader", { name: "Maná" }))!;
    const cells = within(mana).getAllByRole("cell").map((c) => c.textContent);
    // Enviada, participantes, fruver, carnes, abarrotes (tocaba: 0), aseo (no tocaba: —)
    expect(cells.slice(2, 7)).toEqual(["10", "12", "3", "0", "—"]);
  });

  it("'Ver lista' solo está activo para las que ya enviaron", async () => {
    await renderLoaded();
    const button = (name: string) => {
      const r = screen.getAllByRole("row").find((x) => within(x).queryByRole("rowheader", { name }))!;
      return within(r).getByRole("button", { name: "Ver lista" }) as HTMLButtonElement;
    };
    expect(button("Maná").disabled).toBe(false);
    expect(button("Leones").disabled).toBe(true);
  });

  it("avisa de los cambios que la comunidad hizo después de enviar", async () => {
    service.marketOverview.mockResolvedValue(ok(overview([
      sentRow("Maná", { has_unsent_changes: true, changed_after_deadline: true }),
    ])));
    await renderLoaded();
    expect(screen.getByText(/cambios sin enviar/)).toBeTruthy();
    expect(screen.getByText(/cambió tras el plazo/)).toBeTruthy();
  });

  it("los botones ← → cambian de semana y piden esa semana", async () => {
    await renderLoaded();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Semana anterior" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(service.marketOverview).toHaveBeenLastCalledWith("2026-09-28");
    expect(screen.getByRole("button", { name: "Ir a la semana más reciente" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ir a la semana más reciente" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(service.marketOverview).toHaveBeenLastCalledWith(WEEK);
  });

  it("si no se pueden cargar, avisa y deja reintentar", async () => {
    service.marketOverview.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } as never });
    await renderLoaded();
    expect(screen.getByRole("alert").textContent).toContain("No se pudieron cargar las listas");
    service.marketOverview.mockResolvedValue(ok(overview([sentRow("Maná")])));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Actualizar" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("rowheader", { name: "Maná" })).toBeTruthy();
  });
});

describe("listas de mercado (nutricionista): detalle de una comunidad", () => {
  async function openMana() {
    await renderLoaded();
    const r = screen.getAllByRole("row").find((x) => within(x).queryByRole("rowheader", { name: "Maná" }))!;
    await act(async () => { fireEvent.click(within(r).getByRole("button", { name: "Ver lista" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  }

  it("muestra solo lo pedido, por tipo, con unidad y cantidad (sin precios)", async () => {
    await openMana();
    expect(service.marketList).toHaveBeenCalledWith("Maná", WEEK);
    expect(screen.getByRole("heading", { name: "Lista de Maná" })).toBeTruthy();
    const fruver = screen.getByRole("region", { name: "Fruver y lácteos" });
    expect(within(fruver).getByText("ACELGA")).toBeTruthy();
    expect(within(fruver).getByText("2,5")).toBeTruthy();
    expect(within(fruver).getByText("evento")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Abarrotes" }).textContent).toContain("No pidió");
    expect(screen.queryByText(/\$|precio|valor/i)).toBeNull();
  });

  it("los tipos vacíos que ese viernes no tocaban lo dicen", async () => {
    await openMana();
    expect(screen.getByRole("region", { name: "Aseo" }).textContent).toContain("ese viernes no tocaba");
    expect(screen.getByRole("region", { name: "Abarrotes" }).textContent).not.toContain("ese viernes no tocaba");
  });

  it("muestra el estado, la puntualidad y los participantes", async () => {
    await openMana();
    expect(screen.getByText("Por revisar")).toBeTruthy();
    expect(screen.getByText("A tiempo")).toBeTruthy();
    expect(screen.getByText("11 participantes")).toBeTruthy();
  });

  it("una lista tardía o reenviada lo dice", async () => {
    service.marketList.mockResolvedValue(ok(detail({ late: true, submit_count: 3 })));
    await openMana();
    expect(screen.getByText("Tarde")).toBeTruthy();
    expect(screen.getByText("Enviada 3 veces")).toBeTruthy();
  });

  it("avisa cuando la comunidad tiene cambios sin enviar (lo que se ve es lo último enviado)", async () => {
    service.marketList.mockResolvedValue(ok(detail({ has_unsent_changes: true })));
    await openMana();
    expect(screen.getByRole("status").textContent).toContain("Aquí ves lo último que envió");
  });

  it("'Marcar revisada' llama al servidor con la comunidad y la semana, recarga y avisa a la campanita", async () => {
    const onChanged = vi.fn();
    await renderLoaded({ onChanged });
    const r = screen.getAllByRole("row").find((x) => within(x).queryByRole("rowheader", { name: "Maná" }))!;
    await act(async () => { fireEvent.click(within(r).getByRole("button", { name: "Ver lista" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    service.marketList.mockResolvedValue(ok(detail({ reviewed: true })));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Marcar revisada" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(service.markMarketReviewed).toHaveBeenCalledWith("Maná", WEEK);
    expect(onChanged).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "✓ Ya está revisada" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("si marcar revisada falla, lo dice y el botón sigue disponible", async () => {
    service.markMarketReviewed.mockResolvedValue({ data: null, error: { message: "boom" } as never });
    await openMana();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Marcar revisada" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("alert").textContent).toContain("No se pudo marcar como revisada");
    expect((screen.getByRole("button", { name: "Marcar revisada" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("'Volver' regresa al resumen", async () => {
    await openMana();
    fireEvent.click(screen.getByRole("button", { name: "← Volver a las comunidades" }));
    expect(screen.getByRole("rowheader", { name: "Fortaleza" })).toBeTruthy();
  });

  it("si la lista no se puede cargar, avisa", async () => {
    service.marketList.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } as never });
    await openMana();
    expect(screen.getByRole("alert").textContent).toContain("No se pudo cargar la lista de esta comunidad");
  });

  it("una comunidad que no ha enviado dice que todavía no envió", async () => {
    service.marketList.mockResolvedValue(ok(detail({ sent: false, lists: [] })));
    await openMana();
    expect(screen.getByText(/todavía no ha enviado la lista de esta semana/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar revisada" })).toBeNull();
  });
});

describe("listas de mercado (nutricionista): abrir desde la campanita", () => {
  it("con 'focus' abre esa semana y esa comunidad directamente", async () => {
    await renderLoaded({ focus: { community: "Maná", weekStart: "2026-09-28" } });
    expect(service.marketOverview).toHaveBeenCalledWith("2026-09-28");
    expect(service.marketList).toHaveBeenCalledWith("Maná", "2026-09-28");
    expect(screen.getByRole("heading", { name: "Lista de Maná" })).toBeTruthy();
  });

  it("si algo fuera de la pantalla cambia los datos (externalReloadKey), se recarga", async () => {
    const { rerender } = render(<AdminMarketLists focus={null} externalReloadKey={0} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(service.marketOverview).toHaveBeenCalledTimes(1);
    rerender(<AdminMarketLists focus={null} externalReloadKey={1} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(service.marketOverview).toHaveBeenCalledTimes(2);
  });
});
