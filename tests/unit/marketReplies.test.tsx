// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketChange, MarketItem, MarketReply, MarketWeek } from "@/types/market";

// Respuestas de la nutricionista en la lista de mercado de la comunidad (plan 008, Fase D): se ven junto a la nota, las
// «nuevas» se marcan como leídas cuando la persona las tiene a la vista, y la campanita pide abrir una semana y un tipo.
vi.mock("@/lib/marketService", () => ({
  marketService: {
    loadCatalog: vi.fn(), loadWeek: vi.fn(), saveList: vi.fn(), saveChanges: vi.fn(), setParticipants: vi.fn(), submitWeek: vi.fn(),
    markRepliesSeen: vi.fn(), loadUnseenReplies: vi.fn(),
  },
}));

import MarketListDashboard, { type ReplyFocus } from "@/components/market/MarketListDashboard";
import { REPLIES_CHANGED_EVENT } from "@/hooks/useMarketReplies";
import { marketService } from "@/lib/marketService";

const service = vi.mocked(marketService, true);
const ok = <T,>(data: T) => ({ data, error: null });

const item = (id: string, kind: MarketItem["kind"], name: string): MarketItem => ({ id, kind, name, unit: "KG", is_event: false, sort_order: 1 });
const CATALOG: MarketItem[] = [item("mf1", "fruver", "ACELGA"), item("mc1", "carnes", "CARNE ASAR PORCION"), item("mc2", "carnes", "PESCADO FILETE")];

const NOW = new Date("2026-09-30T15:00:00Z"); // miércoles: el próximo pedido es el del viernes 2 oct (semana del 5 oct)
const WEEK = "2026-10-05";
const OTHER_WEEK = "2026-10-12";

const note = (id: string, text: string, item_id: string | null = null): MarketChange => ({ id, item_id, text, at: "2026-09-30T15:00:00Z" });
const reply = (change_id: string, text: string, extra: Partial<MarketReply> = {}): MarketReply => ({
  change_id, text, change_text: "", at: "2026-10-01T15:00:00Z", seen: false, ...extra,
});

const row = (kind: MarketItem["kind"], extra: Record<string, unknown> = {}) => ({
  kind, quantities: {}, changes: [], replies: [], sent: true, modified: false, submitted_at: "2026-10-01T12:00:00Z", first_submitted_at: "2026-10-01T12:00:00Z",
  submit_count: 1, late: false, changed_after_deadline: false, ...extra,
});

const week = (lists: unknown[], weekStart = WEEK): { data: MarketWeek; error: null } => ({
  data: { week_start: weekStart, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes"], participants: 11, lists: lists as MarketWeek["lists"] },
  error: null,
});

async function renderLoaded(focus?: ReplyFocus) {
  const view = render(<MarketListDashboard community="Maná" onLogout={vi.fn()} focus={focus} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const tab = (name: RegExp) => fireEvent.click(within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  service.loadCatalog.mockResolvedValue(ok(CATALOG));
  service.loadWeek.mockResolvedValue(week([]));
  service.saveList.mockResolvedValue(ok(null));
  service.saveChanges.mockResolvedValue(ok(null));
  service.markRepliesSeen.mockResolvedValue(ok(null));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("respuestas de la nutricionista: se ven junto a la nota", () => {
  const withReply = (extra: Partial<MarketReply> = {}) =>
    week([row("fruver", { changes: [note("a", "Solo papa criolla"), note("b", "Entregar temprano")], replies: [reply("a", "Se envía criolla", { change_text: "Solo papa criolla", ...extra })] })]);

  it("la respuesta aparece bajo SU nota y la otra nota no la lleva", async () => {
    service.loadWeek.mockResolvedValue(withReply());
    await renderLoaded();
    const items = screen.getAllByRole("listitem").filter((li) => li.classList.contains("market-change"));
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Se envía criolla")).toBeTruthy();
    expect(within(items[0]).getByText(/Respuesta de la nutricionista/)).toBeTruthy();
    expect(within(items[1]).queryByText(/Respuesta de la nutricionista/)).toBeNull();
  });

  it("una respuesta sin leer se marca como «nueva»; una ya leída no", async () => {
    service.loadWeek.mockResolvedValue(withReply({ seen: false }));
    await renderLoaded();
    expect(screen.getByText(/· nueva/)).toBeTruthy();
    cleanup();
    service.loadWeek.mockResolvedValue(withReply({ seen: true }));
    await renderLoaded();
    expect(screen.queryByText(/· nueva/)).toBeNull();
  });

  it("si la comunidad cambió la nota después de la respuesta, lo avisa con el texto anterior", async () => {
    service.loadWeek.mockResolvedValue(withReply({ change_text: "Papa criolla amarilla" }));
    await renderLoaded();
    expect(screen.getByText(/Respondió a una versión anterior de esta nota: «Papa criolla amarilla»/)).toBeTruthy();
  });

  it("si el texto no cambió, no sale ese aviso", async () => {
    service.loadWeek.mockResolvedValue(withReply());
    await renderLoaded();
    expect(screen.queryByText(/versión anterior/)).toBeNull();
  });

  it("el texto de la respuesta se muestra como texto, nunca como HTML", async () => {
    service.loadWeek.mockResolvedValue(withReply({ text: "<img src=x onerror=alert(1)> <b>negrita</b>" }));
    await renderLoaded();
    const box = document.querySelector(".market-reply")!;
    expect(box.querySelector("img")).toBeNull();
    expect(box.querySelector("b")).toBeNull();
    expect(box.textContent).toContain("<b>negrita</b>");
  });

  it("un servidor anterior que no manda `replies` no rompe la pantalla", async () => {
    service.loadWeek.mockResolvedValue(week([{ ...row("fruver", { changes: [note("a", "Solo papa criolla")] }), replies: undefined }]));
    await renderLoaded();
    expect(screen.getByText("Solo papa criolla")).toBeTruthy();
    expect(screen.queryByText(/Respuesta de la nutricionista/)).toBeNull();
  });

  it("la pestaña muestra cuántas respuestas nuevas tiene", async () => {
    service.loadWeek.mockResolvedValue(withReply({ seen: false }));
    await renderLoaded();
    const fruver = within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Fruver y lácteos/ });
    expect(fruver.textContent).toContain("💬1");
    const carnes = within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Carnes/ });
    expect(carnes.textContent).not.toContain("💬");
  });
});

describe("respuestas de la nutricionista: se marcan como leídas al verlas", () => {
  const unseen = () => week([row("fruver", { changes: [note("a", "Solo papa criolla")], replies: [reply("a", "Se envía criolla", { change_text: "Solo papa criolla" })] })]);

  it("tras 1,5 segundos con la zona abierta se marcan leídas, SOLO de ese tipo y de esa semana", async () => {
    service.loadWeek.mockResolvedValue(unseen());
    await renderLoaded();
    await advance(1400);
    expect(service.markRepliesSeen).not.toHaveBeenCalled();
    await advance(200);
    expect(service.markRepliesSeen).toHaveBeenCalledTimes(1);
    expect(service.markRepliesSeen).toHaveBeenCalledWith(WEEK, "fruver");
  });

  it("después refresca la semana y avisa a la campanita (evento) para que se actualice al instante", async () => {
    service.loadWeek.mockResolvedValue(unseen());
    const heard = vi.fn();
    window.addEventListener(REPLIES_CHANGED_EVENT, heard);
    await renderLoaded();
    const before = service.loadWeek.mock.calls.length;
    await advance(1600);
    expect(service.loadWeek.mock.calls.length).toBeGreaterThan(before);
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(REPLIES_CHANGED_EVENT, heard);
  });

  it("si la zona está cerrada (hay que abrirla a mano) no se marca nada todavía", async () => {
    service.loadWeek.mockResolvedValue(unseen());
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Cambios del pedido de fruver/ })); // la cierra (estaba abierta sola)
    await advance(5000);
    expect(service.markRepliesSeen).not.toHaveBeenCalled();
  });

  it("las respuestas de OTRO tipo no se marcan mientras no se vean", async () => {
    service.loadWeek.mockResolvedValue(unseen());
    await renderLoaded();
    tab(/Carnes/);
    await advance(2000);
    expect(service.markRepliesSeen).not.toHaveBeenCalledWith(WEEK, "carnes");
  });

  it("marca el tipo que se está viendo (carnes), no siempre el mismo", async () => {
    service.loadWeek.mockResolvedValue(week([row("carnes", { changes: [note("c", "Pescado por pechuga")], replies: [reply("c", "Se envía pechuga", { change_text: "Pescado por pechuga" })] })]));
    await renderLoaded();
    tab(/Carnes/);
    await advance(1600);
    expect(service.markRepliesSeen).toHaveBeenCalledWith(WEEK, "carnes");
    expect(service.markRepliesSeen).not.toHaveBeenCalledWith(WEEK, "fruver");
  });

  it("una respuesta ya leída no vuelve a marcarse", async () => {
    service.loadWeek.mockResolvedValue(week([row("fruver", { changes: [note("a", "x")], replies: [reply("a", "ok", { seen: true, change_text: "x" })] })]));
    await renderLoaded();
    await advance(5000);
    expect(service.markRepliesSeen).not.toHaveBeenCalled();
  });

  it("si marcarla falla, no se rompe nada (solo queda registrado)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.markRepliesSeen.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } as never });
    service.loadWeek.mockResolvedValue(unseen());
    await renderLoaded();
    await advance(1600);
    expect(screen.getByText("Se envía criolla")).toBeTruthy();
  });
});

describe("la campanita pide abrir una semana y un tipo", () => {
  it("con `focus` abre esa semana y selecciona ese tipo con su zona de cambios abierta", async () => {
    service.loadWeek.mockImplementation(async (w: string) =>
      w === OTHER_WEEK
        ? week([row("carnes", { changes: [note("c", "Pescado por pechuga", "mc2")], replies: [reply("c", "Se envía pechuga", { change_text: "Pescado por pechuga" })] })], OTHER_WEEK)
        : week([]));
    await renderLoaded({ weekStart: OTHER_WEEK, kind: "carnes", nonce: 1 });
    await advance(0);

    expect(service.loadWeek).toHaveBeenLastCalledWith(OTHER_WEEK);
    expect(within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Carnes/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Se envía pechuga")).toBeTruthy();
  });

  it("si la lista YA estaba abierta y la campanita pide otra respuesta, cambia de semana y de tipo al instante", async () => {
    service.loadWeek.mockImplementation(async (w: string) =>
      w === OTHER_WEEK
        ? week([row("carnes", { changes: [note("c", "Pescado por pechuga")], replies: [reply("c", "Se envía pechuga", { change_text: "Pescado por pechuga" })] })], OTHER_WEEK)
        : week([]));
    const { rerender } = await renderLoaded();
    expect(within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Fruver y lácteos/ }).getAttribute("aria-selected")).toBe("true");

    rerender(<MarketListDashboard community="Maná" onLogout={vi.fn()} focus={{ weekStart: OTHER_WEEK, kind: "carnes", nonce: 1 }} />);
    await advance(0);

    expect(service.loadWeek).toHaveBeenLastCalledWith(OTHER_WEEK);
    expect(within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Carnes/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Se envía pechuga")).toBeTruthy();
  });

  it("sin `focus` no cambia de semana ni de tipo", async () => {
    await renderLoaded();
    expect(service.loadWeek).toHaveBeenCalledWith(WEEK);
    expect(within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Fruver y lácteos/ }).getAttribute("aria-selected")).toBe("true");
  });
});
