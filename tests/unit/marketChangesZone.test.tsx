// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketChange, MarketItem, MarketWeek } from "@/types/market";

// Zona de cambios de la lista de mercado (plan 008, Fase B): notas como «pescado por pechuga» que la comunidad deja
// en cada tipo de lista. El servicio se reemplaza por uno falso: se prueba la pantalla completa (hook + componentes).
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

import MarketListDashboard from "@/components/market/MarketListDashboard";
import { SAVE_DEBOUNCE_MS } from "@/hooks/useMarketList";
import { marketService } from "@/lib/marketService";

const service = vi.mocked(marketService, true);

const item = (id: string, kind: MarketItem["kind"], name: string, unit = "KG"): MarketItem => ({
  id, kind, name, unit, is_event: false, sort_order: 1,
});

const CATALOG: MarketItem[] = [
  item("mf1", "fruver", "ACELGA"),
  item("mf3", "fruver", "PAPA PASTUSA"),
  item("mc1", "carnes", "CARNE ASAR PORCION", "Porcion"),
  item("mc2", "carnes", "PESCADO FILETE", "KG"),
];

const NOW = new Date("2026-09-30T15:00:00Z");
const WEEK = "2026-10-05";

const week = (lists: Record<string, unknown>[] = []): { data: MarketWeek; error: null } => ({
  data: {
    week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z",
    kinds_due: ["fruver", "carnes", "abarrotes"], participants: 11,
    lists: lists as unknown as MarketWeek["lists"],
  },
  error: null,
});

const row = (kind: MarketItem["kind"], extra: Record<string, unknown> = {}) => ({
  kind, quantities: {}, changes: [], sent: false, modified: false, submitted_at: null, first_submitted_at: null,
  submit_count: 0, late: false, changed_after_deadline: false, ...extra,
});

const note = (id: string, text: string, item_id: string | null = null): MarketChange => ({ id, item_id, text, at: "2026-09-30T15:00:00Z" });

// El producto se elige en el desplegable de la app (no en un <select> del navegador): se abre y se toca la opción.
const pickProduct = (name: string) => {
  fireEvent.click(screen.getByLabelText("Producto (opcional)"));
  fireEvent.click(screen.getByRole("option", { name }));
};

async function renderLoaded() {
  const view = render(<MarketListDashboard community="Maná" onLogout={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const openZone = (kind = /fruver y lácteos/) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`Cambios del pedido de ${kind.source}`) }));
const writeNote = (text: string) => fireEvent.change(screen.getByLabelText("Cambio"), { target: { value: text } });
const addNote = () => fireEvent.click(screen.getByRole("button", { name: "Agregar cambio" }));
const tab = (name: RegExp) => fireEvent.click(within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  service.loadCatalog.mockResolvedValue({ data: CATALOG, error: null });
  service.loadWeek.mockResolvedValue(week());
  service.saveList.mockResolvedValue({ data: null, error: null });
  service.saveChanges.mockResolvedValue({ data: null, error: null });
  service.setParticipants.mockResolvedValue({ data: null, error: null });
  service.submitWeek.mockResolvedValue({ data: { submitted_at: NOW.toISOString(), late: false, changed_after_deadline: false }, error: null });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("zona de cambios: agregar", () => {
  it("empieza cerrada si no hay notas, y se abre con el botón", async () => {
    await renderLoaded();
    expect(screen.queryByLabelText("Cambio")).toBeNull();
    openZone();
    expect(screen.getByLabelText("Cambio")).toBeTruthy();
    expect(screen.getByText("Aún no hay cambios en esta lista.")).toBeTruthy();
  });

  it("una nota general se guarda sola tras la pausa, solo en su tipo y sin tocar las cantidades", async () => {
    await renderLoaded();
    openZone();
    writeNote("Entregar temprano");
    addNote();

    expect(screen.getByText("Entregar temprano")).toBeTruthy();
    expect(screen.getByText("General")).toBeTruthy();
    expect(service.saveChanges).not.toHaveBeenCalled();
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveChanges).toHaveBeenCalledTimes(1);
    expect(service.saveChanges).toHaveBeenCalledWith(WEEK, "fruver", [
      { id: expect.stringMatching(/^c[a-z0-9]{18}$/), item_id: null, text: "Entregar temprano" },
    ]);
    expect(service.saveList).not.toHaveBeenCalled();
  });

  it("una nota con producto lo guarda y lo muestra", async () => {
    await renderLoaded();
    openZone();
    pickProduct("PAPA PASTUSA");
    writeNote("Solo papa criolla");
    addNote();
    await advance(SAVE_DEBOUNCE_MS);

    expect(service.saveChanges).toHaveBeenCalledWith(WEEK, "fruver", [expect.objectContaining({ item_id: "mf3", text: "Solo papa criolla" })]);
    const list = screen.getByRole("list", { name: /Cambios del pedido de fruver/ });
    expect(within(list).getByText("PAPA PASTUSA")).toBeTruthy();
  });

  it("limpia el texto: los espacios repetidos quedan en uno (los saltos de línea ya los quita el campo)", async () => {
    await renderLoaded();
    openZone();
    writeNote("  cambiar   pescado   por   pechuga ");
    addNote();
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveChanges).toHaveBeenCalledWith(WEEK, "fruver", [expect.objectContaining({ text: "cambiar pescado por pechuga" })]);
  });

  it("una nota vacía avisa y no se guarda", async () => {
    await renderLoaded();
    openZone();
    writeNote("   ");
    addNote();
    expect(screen.getByRole("alert").textContent).toContain("Escribe el cambio");
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveChanges).not.toHaveBeenCalled();
  });

  it("el campo no deja pasar de 200 caracteres y muestra el contador", async () => {
    await renderLoaded();
    openZone();
    expect((screen.getByLabelText("Cambio") as HTMLInputElement).maxLength).toBe(200);
    writeNote("hola");
    expect(screen.getByText(/4\/200 caracteres · 0 de 20 cambios/)).toBeTruthy();
  });

  it("las notas de cada tipo van a su propio guardado", async () => {
    await renderLoaded();
    tab(/Carnes/);
    openZone(/carnes/);
    pickProduct("PESCADO FILETE");
    writeNote("Pescado por pechuga");
    addNote();
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveChanges).toHaveBeenCalledWith(WEEK, "carnes", [expect.objectContaining({ item_id: "mc2", text: "Pescado por pechuga" })]);
  });
});

describe("zona de cambios: el 📝 de cada producto", () => {
  it("abre la zona con ese producto elegido y el cursor en el campo de texto", async () => {
    await renderLoaded();
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar un cambio" })[1]); // PAPA PASTUSA
    expect(screen.getByLabelText("Producto (opcional)").textContent).toContain("PAPA PASTUSA");
    expect(document.activeElement).toBe(screen.getByLabelText("Cambio"));
  });

  it("al cambiar de pestaña no roba el foco (aunque ya se haya usado un 📝)", async () => {
    await renderLoaded();
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar un cambio" })[0]);
    (document.activeElement as HTMLElement).blur();
    tab(/Carnes/);
    openZone(/carnes/);
    expect(document.activeElement).not.toBe(screen.getByLabelText("Cambio"));
  });

  it("el producto con notas muestra cuántas tiene, y la pestaña también", async () => {
    service.loadWeek.mockResolvedValue(week([row("fruver", { changes: [note("a", "Solo criolla", "mf3"), note("b", "Otra", "mf3"), note("c", "General")] })]));
    await renderLoaded();
    const withNotes = screen.getAllByRole("button", { name: "Cambios: 2. Agregar otro" });
    expect(withNotes).toHaveLength(1);
    expect(within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Fruver y lácteos/ }).textContent).toContain("📝3");
  });
});

describe("zona de cambios: lo ya guardado", () => {
  it("carga las notas del servidor y abre la zona sola", async () => {
    service.loadWeek.mockResolvedValue(week([row("fruver", { changes: [note("a", "Solo papa criolla", "mf3"), note("b", "Entregar temprano")] })]));
    await renderLoaded();
    expect(screen.getByText("Solo papa criolla")).toBeTruthy();
    expect(screen.getByText("Entregar temprano")).toBeTruthy();
    expect(screen.getByText(/2 de 20 cambios/)).toBeTruthy();
  });

  it("un servidor anterior que no manda `changes` no rompe la pantalla", async () => {
    service.loadWeek.mockResolvedValue(week([{ ...row("fruver"), changes: undefined }]));
    await renderLoaded();
    openZone();
    expect(screen.getByText("Aún no hay cambios en esta lista.")).toBeTruthy();
  });
});

describe("zona de cambios: editar y quitar", () => {
  beforeEach(() => {
    service.loadWeek.mockResolvedValue(week([row("fruver", { changes: [note("a", "Pescado por pavo", "mf1"), note("b", "Entregar temprano")] })]));
  });

  it("editar guarda el texto nuevo y conserva el producto y el id", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Editar el cambio: Pescado por pavo" }));
    fireEvent.change(screen.getByLabelText("Editar el cambio"), { target: { value: "  Pescado   por pechuga " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await advance(SAVE_DEBOUNCE_MS);

    expect(service.saveChanges).toHaveBeenCalledWith(WEEK, "fruver", [
      { id: "a", item_id: "mf1", text: "Pescado por pechuga", at: "2026-09-30T15:00:00Z" },
      { id: "b", item_id: null, text: "Entregar temprano", at: "2026-09-30T15:00:00Z" },
    ]);
  });

  it("no deja guardar una edición vacía; Cancelar la descarta", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Editar el cambio: Pescado por pavo" }));
    fireEvent.change(screen.getByLabelText("Editar el cambio"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert").textContent).toContain("no puede quedar vacío");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Pescado por pavo")).toBeTruthy();
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveChanges).not.toHaveBeenCalled();
  });

  it("quitar una nota guarda la lista sin ella; quitar todas guarda un arreglo vacío", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Quitar el cambio: Pescado por pavo" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar el cambio: Entregar temprano" }));
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveChanges).toHaveBeenCalledTimes(1);
    expect(service.saveChanges).toHaveBeenCalledWith(WEEK, "fruver", []);
  });

  it("una nota ligada a un producto que ya no está en el catálogo se guarda sin el vínculo (si no, el servidor la rechazaría)", async () => {
    service.loadWeek.mockResolvedValue(week([row("fruver", { changes: [note("z", "Producto viejo", "mf-desactivado")] })]));
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Editar el cambio: Producto viejo" }));
    fireEvent.change(screen.getByLabelText("Editar el cambio"), { target: { value: "Producto viejo y algo más" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveChanges).toHaveBeenCalledWith(WEEK, "fruver", [expect.objectContaining({ id: "z", item_id: null })]);
  });
});

describe("zona de cambios: no se pierde lo que esperaba la pausa", () => {
  it("al cambiar de semana se guarda ya la nota pendiente, en la semana en que se escribió", async () => {
    await renderLoaded();
    openZone();
    writeNote("Entregar temprano");
    addNote();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" })); });
    await advance(0);

    expect(service.saveChanges).toHaveBeenCalledTimes(1);
    expect(service.saveChanges).toHaveBeenCalledWith(WEEK, "fruver", [expect.objectContaining({ text: "Entregar temprano" })]);
    expect(service.loadWeek).toHaveBeenLastCalledWith("2026-10-12");
  });
});

describe("zona de cambios: límite de 20", () => {
  it("con 20 notas no deja agregar más y lo avisa", async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => note(`n${i}`, `nota ${i}`));
    service.loadWeek.mockResolvedValue(week([row("fruver", { changes: twenty })]));
    await renderLoaded();

    expect((screen.getByLabelText("Cambio") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Producto (opcional)") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Agregar cambio" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("máximo de 20");
  });

  it("el límite es por tipo de lista: carnes tiene sus propias 20", async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => note(`n${i}`, `nota ${i}`));
    service.loadWeek.mockResolvedValue(week([row("fruver", { changes: twenty })]));
    await renderLoaded();
    tab(/Carnes/);
    openZone(/carnes/);
    expect((screen.getByLabelText("Cambio") as HTMLInputElement).disabled).toBe(false);
  });
});

describe("zona de cambios: guardado y envío", () => {
  it("si el guardado de las notas falla, avisa con «Reintentar» y reenvía al pulsarlo", async () => {
    service.saveChanges.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Cambios inválidos" } as never });
    await renderLoaded();
    openZone();
    writeNote("algo");
    addNote();
    await advance(SAVE_DEBOUNCE_MS);
    expect(screen.getByText("No se pudo guardar")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await advance(0);
    expect(service.saveChanges).toHaveBeenCalledTimes(2);
    expect(screen.getByText("✓ Todos los cambios guardados")).toBeTruthy();
  });

  it("al enviar, la confirmación y el resumen incluyen cuántos cambios lleva cada tipo", async () => {
    service.loadWeek.mockResolvedValue(week([row("carnes", { quantities: { mc1: 2 }, changes: [note("a", "Pescado por pechuga", "mc2")] })]));
    await renderLoaded();

    expect(screen.getByText(/Con 1 cambio para la nutricionista/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enviar lista de la semana" }));
    const question = vi.mocked(window.confirm).mock.calls[0][0] as string;
    expect(question).toContain("• Carnes: 1 productos · 1 cambio");
    expect(question).toContain("• Fruver y lácteos: no pedí\n");
    await advance(0);
    expect(service.submitWeek).toHaveBeenCalledWith(WEEK);
  });

  it("el botón de enviar queda bloqueado mientras se guardan las notas y se libera al terminar", async () => {
    service.loadWeek.mockResolvedValue(week([row("carnes", { quantities: { mc1: 2 } })]));
    await renderLoaded();
    tab(/Carnes/);
    openZone(/carnes/);
    writeNote("Pescado por pechuga");
    addNote();

    const send = () => screen.getByRole("button", { name: "Enviar lista de la semana" }) as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    await advance(SAVE_DEBOUNCE_MS);
    expect(send().disabled).toBe(false);
    fireEvent.click(send());
    await advance(0);
    expect(service.saveChanges.mock.invocationCallOrder[0]).toBeLessThan(service.submitWeek.mock.invocationCallOrder[0]);
  });
});

describe("aviso de que ese tipo no se pide este viernes", () => {
  it("en la pestaña de un tipo que no toca, el mensaje lleva ⚠ y la pestaña lo marca; en uno que toca, no", async () => {
    await renderLoaded(); // la semana de prueba pide fruver, carnes y abarrotes; aseo no toca
    expect(screen.getByText(/Este viernes SÍ se pide fruver/).className).toContain("market-due--yes");

    tab(/Aseo/);
    const warning = screen.getByText(/Este viernes no toca pedir aseo/);
    expect(warning.className).toContain("market-due--no");
    expect(warning.textContent).toMatch(/^⚠ /);
    const aseoTab = within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Aseo/ });
    expect(within(aseoTab).getByRole("img", { name: "Este viernes no toca" })).toBeTruthy();
    const fruverTab = within(screen.getByRole("tablist", { name: "Tipo de lista" })).getByRole("tab", { name: /Fruver/ });
    expect(within(fruverTab).queryByRole("img", { name: "Este viernes no toca" })).toBeNull();
  });

  it("los avisos van en rojo (no en el gris tenue, que pasaba desapercibido) y con borde, no solo con color", () => {
    const market = readFileSync("src/app/market.css", "utf8");
    const rule = (css: string, selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start, `no está la regla ${selector}`).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(rule(market, ".market-due--no")).toContain("color: var(--color-accent-red)");
    expect(rule(market, ".market-due--no")).toContain("border-left");
    expect(rule(market, ".market-tab-off")).toContain("color: var(--color-accent-red)");
    expect(rule(readFileSync("src/app/admin.css", "utf8"), ".admin-market-kind-note")).toContain("color: var(--color-accent-red)");
  });
});
