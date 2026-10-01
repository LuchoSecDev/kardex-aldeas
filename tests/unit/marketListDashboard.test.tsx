// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketItem, MarketWeek } from "@/types/market";

// El servicio se reemplaza por uno falso: así se prueba la pantalla completa
// (hook + componentes) sin red ni Supabase.
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

const item = (id: string, kind: MarketItem["kind"], name: string, unit = "KG", is_event = false): MarketItem => ({
  id, kind, name, unit, is_event, sort_order: 1,
});

const CATALOG: MarketItem[] = [
  item("mf1", "fruver", "ACELGA"),
  item("mf2", "fruver", "AROMÁTICAS", "ATAO"),
  item("mf3", "fruver", "PAPA PASTUSA"),
  item("mf4", "fruver", "ARANDANOS (evento)", "KG", true),
  item("mc1", "carnes", "CARNE ASAR PORCION", "Porcion"),
  item("ma1", "abarrotes", "ARROZ BLANCO LIBRA", "LIBRA"),
  item("ms1", "aseo", "JABON EN BARRA REY UND", "UND"),
];

// Miércoles 30 sep 2026, 10:00 a. m. en Bogotá → el próximo pedido es el viernes 2 oct (semana del 5 oct).
const NOW = new Date("2026-09-30T15:00:00Z");
const WEEK = "2026-10-05";

const okWeek = (overrides: Partial<MarketWeek> = {}): { data: MarketWeek; error: null } => ({
  data: {
    week_start: WEEK,
    friday: "2026-10-02",
    deadline_at: "2026-10-02T22:00:00Z",
    kinds_due: ["fruver", "carnes", "abarrotes"],
    participants: 11,
    lists: [],
    ...overrides,
  },
  error: null,
});

const listRow = (kind: MarketItem["kind"], extra: Record<string, unknown> = {}) => ({
  kind, quantities: {}, sent: false, modified: false, submitted_at: null, first_submitted_at: null,
  submit_count: 0, late: false, changed_after_deadline: false, ...extra,
});

async function renderLoaded() {
  const view = render(<MarketListDashboard community="Maná" onLogout={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  service.loadCatalog.mockResolvedValue({ data: CATALOG, error: null });
  service.loadWeek.mockResolvedValue(okWeek());
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

describe("lista de mercado: pantalla", () => {
  it("carga la semana del próximo pedido con su rótulo, plazo y qué se pide", async () => {
    await renderLoaded();
    expect(service.loadWeek).toHaveBeenCalledWith(WEEK);
    expect(screen.getByRole("heading", { name: /Semana 2 de octubre · 5 oct – 11 oct/ })).toBeTruthy();
    expect(screen.getByText(/Pedido del viernes 2 de octubre/)).toBeTruthy();
    expect(screen.getByText(/Envíala a más tardar el viernes/)).toBeTruthy();
    expect(screen.getByText(/Fruver y lácteos, Carnes, Abarrotes\./)).toBeTruthy();
    expect(screen.getByText("ACELGA")).toBeTruthy();
    expect(screen.getByText("evento")).toBeTruthy();
  });

  it("muestra los participantes fijos de la comunidad", async () => {
    await renderLoaded();
    expect(screen.getByText(/Tu comunidad tiene/).textContent).toContain("11");
  });

  it("los campos de cantidad quedan bloqueados mientras carga la semana", async () => {
    let resolveWeek!: (v: ReturnType<typeof okWeek>) => void;
    service.loadWeek.mockReturnValue(new Promise((r) => { resolveWeek = r; }));
    render(<MarketListDashboard community="Maná" onLogout={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect((screen.getByLabelText(/ACELGA/) as HTMLInputElement).disabled).toBe(true);
    await act(async () => { resolveWeek(okWeek()); });
    expect((screen.getByLabelText(/ACELGA/) as HTMLInputElement).disabled).toBe(false);
  });

  it("precarga lo ya guardado (borrador), con coma decimal", async () => {
    service.loadWeek.mockResolvedValue(okWeek({ lists: [listRow("fruver", { quantities: { mf1: 2.5, mf3: 4 } })] }));
    await renderLoaded();
    expect((screen.getByLabelText(/ACELGA/) as HTMLInputElement).value).toBe("2,5");
    expect((screen.getByLabelText(/PAPA PASTUSA/) as HTMLInputElement).value).toBe("4");
  });
});

describe("lista de mercado: escribir y guardar", () => {
  it("guarda solo después de la pausa y con las cantidades ya limpias", async () => {
    await renderLoaded();
    type(/ACELGA/, "2,5");
    expect(service.saveList).not.toHaveBeenCalled();
    await advance(SAVE_DEBOUNCE_MS - 1);
    expect(service.saveList).not.toHaveBeenCalled();
    await advance(1);
    expect(service.saveList).toHaveBeenCalledTimes(1);
    expect(service.saveList).toHaveBeenCalledWith(WEEK, "fruver", { mf1: 2.5 });
  });

  it("varias teclas seguidas producen UN solo guardado con el último valor", async () => {
    await renderLoaded();
    type(/ACELGA/, "1");
    await advance(300);
    type(/ACELGA/, "12");
    await advance(300);
    type(/PAPA PASTUSA/, "3");
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveList).toHaveBeenCalledTimes(1);
    expect(service.saveList).toHaveBeenCalledWith(WEEK, "fruver", { mf1: 12, mf3: 3 });
  });

  it("no deja escribir letras ni signos: solo dígitos y un separador decimal", async () => {
    await renderLoaded();
    type(/ACELGA/, "a1-b,2,3");
    expect((screen.getByLabelText(/ACELGA/) as HTMLInputElement).value).toBe("1,23");
  });

  it("borrar la cantidad la quita de lo guardado", async () => {
    service.loadWeek.mockResolvedValue(okWeek({ lists: [listRow("fruver", { quantities: { mf1: 2 } })] }));
    await renderLoaded();
    type(/ACELGA/, "");
    await advance(SAVE_DEBOUNCE_MS);
    expect(service.saveList).toHaveBeenCalledWith(WEEK, "fruver", {});
  });

  it("mientras espera la pausa dice 'Guardando…' y al terminar '✓ Todos los cambios guardados'", async () => {
    await renderLoaded();
    expect(screen.getByText("Los cambios se guardan automáticamente")).toBeTruthy();
    type(/ACELGA/, "1");
    expect(screen.getByText("Guardando…")).toBeTruthy();
    await advance(SAVE_DEBOUNCE_MS);
    expect(screen.getByText("✓ Todos los cambios guardados")).toBeTruthy();
  });

  it("si el guardado falla avisa con 'Reintentar' y reenvía al pulsarlo", async () => {
    service.saveList.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Cantidades inválidas" } as never });
    await renderLoaded();
    type(/ACELGA/, "1");
    await advance(SAVE_DEBOUNCE_MS);
    expect(screen.getByText("No se pudo guardar")).toBeTruthy();
    expect(screen.getByText(/No se pudieron guardar los últimos cambios/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await advance(0);
    expect(service.saveList).toHaveBeenCalledTimes(2);
    expect(screen.getByText("✓ Todos los cambios guardados")).toBeTruthy();
  });
});

describe("lista de mercado: pestañas y búsqueda", () => {
  it("cada pestaña muestra sus productos y cuántos se pidieron", async () => {
    await renderLoaded();
    expect(screen.queryByText("CARNE ASAR PORCION")).toBeNull();
    type(/ACELGA/, "2");
    const tabs = screen.getByRole("tablist", { name: "Tipo de lista" });
    expect(within(tabs).getByRole("tab", { name: /Fruver y lácteos/ }).textContent).toContain("1");

    fireEvent.click(within(tabs).getByRole("tab", { name: /Carnes/ }));
    expect(screen.getByText("CARNE ASAR PORCION")).toBeTruthy();
    expect(screen.queryByText("ACELGA")).toBeNull();
  });

  it("avisa cuándo NO toca pedir un tipo ese viernes", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("tab", { name: /Aseo/ }));
    expect(screen.getByText(/Este viernes no toca pedir aseo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Abarrotes/ }));
    expect(screen.getByText(/Este viernes SÍ se pide abarrotes/)).toBeTruthy();
  });

  it("el buscador ignora tildes y mayúsculas, y avisa si no hay coincidencias", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "aromaticas" } });
    expect(screen.getByText("AROMÁTICAS")).toBeTruthy();
    expect(screen.queryByText("ACELGA")).toBeNull();
    fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "zzz" } });
    expect(screen.getByText(/Ningún producto coincide con «zzz»/)).toBeTruthy();
  });
});

describe("lista de mercado: participantes", () => {
  beforeEach(() => {
    service.loadWeek.mockResolvedValue(okWeek({ participants: null }));
  });

  it("si la comunidad aún no los tiene, los pide y los guarda", async () => {
    await renderLoaded();
    expect(screen.getByText(/¿Cuántos participantes tiene tu comunidad\?/)).toBeTruthy();
    const save = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/¿Cuántos participantes/), { target: { value: "11" } });
    await act(async () => { fireEvent.click(save); });
    expect(service.setParticipants).toHaveBeenCalledWith(11);
    expect(screen.getByText(/Tu comunidad tiene/).textContent).toContain("11");
  });

  it("rechaza 0 y lo que no es un número de 1 a 500, sin llamar al servidor", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/¿Cuántos participantes/), { target: { value: "0" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar" })); });
    expect(service.setParticipants).not.toHaveBeenCalled();
    expect(screen.getByText(/entre 1 y 500/)).toBeTruthy();
  });

  it("se puede cambiar el número cuando llega o se va alguien", async () => {
    service.loadWeek.mockResolvedValue(okWeek({ participants: 11 }));
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Cambiar \(llegó o se fue alguien\)/ }));
    fireEvent.change(screen.getByLabelText("Nuevo número de participantes"), { target: { value: "12" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar" })); });
    expect(service.setParticipants).toHaveBeenCalledWith(12);
    expect(screen.getByText(/Tu comunidad tiene/).textContent).toContain("12");
  });
});

describe("lista de mercado: enviar", () => {
  it("espera a que termine el guardado, envía y confirma con el resumen por tipo", async () => {
    await renderLoaded();
    type(/ACELGA/, "2");
    // Mientras se guarda, el botón está bloqueado (no se puede enviar algo a medias).
    expect((screen.getByRole("button", { name: "Enviar lista de la semana" }) as HTMLButtonElement).disabled).toBe(true);
    const calls: string[] = [];
    service.saveList.mockImplementation(async () => { calls.push("save"); return { data: null, error: null }; });
    service.submitWeek.mockImplementation(async () => {
      calls.push("submit");
      return { data: { submitted_at: NOW.toISOString(), late: false, changed_after_deadline: false }, error: null };
    });

    await advance(SAVE_DEBOUNCE_MS);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar lista de la semana" })); });
    expect(calls).toEqual(["save", "submit"]);
    const question = (window.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(question).toContain("Fruver y lácteos: 1 productos");
    expect(question).toContain("Carnes: no pedí");
    expect(service.submitWeek).toHaveBeenCalledWith(WEEK);
    expect(screen.getByRole("status").textContent).toContain("Lista enviada a la nutricionista.");
  });

  it("si la persona cancela la confirmación no se envía nada", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderLoaded();
    type(/ACELGA/, "2");
    await advance(SAVE_DEBOUNCE_MS);
    fireEvent.click(screen.getByRole("button", { name: "Enviar lista de la semana" }));
    await advance(0);
    expect(service.submitWeek).not.toHaveBeenCalled();
  });

  it("avisa cuando el envío llegó tarde", async () => {
    service.submitWeek.mockResolvedValue({ data: { submitted_at: NOW.toISOString(), late: true, changed_after_deadline: false }, error: null });
    await renderLoaded();
    type(/ACELGA/, "2");
    await advance(SAVE_DEBOUNCE_MS);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar lista de la semana" })); });
    expect(screen.getByRole("status").textContent).toContain("marcada como tardía");
  });

  it.each([
    ["PARTICIPANTES_REQUERIDOS", /participantes tiene tu comunidad/],
    ["LISTA_VACIA", /está vacía/],
    ["Failed to fetch", /Revisa tu conexión/],
  ])("traduce el error del servidor %s", async (serverMessage, expected) => {
    service.submitWeek.mockResolvedValue({ data: null, error: { message: serverMessage } as never });
    await renderLoaded();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar lista de la semana" })); });
    expect(screen.getByRole("alert").textContent).toMatch(expected);
  });

  it("no envía si lo último escrito no se pudo guardar", async () => {
    service.saveList.mockResolvedValue({ data: null, error: { code: "P0001", message: "Cantidades inválidas" } as never });
    await renderLoaded();
    type(/ACELGA/, "2");
    await advance(SAVE_DEBOUNCE_MS);
    // El botón queda bloqueado mientras haya error de guardado.
    expect((screen.getByRole("button", { name: "Enviar lista de la semana" }) as HTMLButtonElement).disabled).toBe(true);
    expect(service.submitWeek).not.toHaveBeenCalled();
  });

  it("una lista enviada se muestra como enviada y permite volver a enviar", async () => {
    service.loadWeek.mockResolvedValue(okWeek({
      lists: [listRow("fruver", { sent: true, submitted_at: "2026-10-01T15:00:00Z", quantities: { mf1: 2 } })],
    }));
    await renderLoaded();
    expect(screen.getByText(/Enviada el/).textContent).toContain("a tiempo");
    expect(screen.getByRole("button", { name: "Volver a enviar la lista" })).toBeTruthy();
  });

  it("si se editó después de enviar, advierte que hay cambios sin enviar", async () => {
    service.loadWeek.mockResolvedValue(okWeek({
      lists: [listRow("carnes", { sent: true, modified: true, submitted_at: "2026-10-01T15:00:00Z" })],
    }));
    await renderLoaded();
    expect(screen.getByText(/cambiaste algo después/)).toBeTruthy();
  });

  it("una lista enviada tarde lo dice", async () => {
    service.loadWeek.mockResolvedValue(okWeek({
      lists: [listRow("fruver", { sent: true, late: true, submitted_at: "2026-10-03T15:00:00Z" })],
    }));
    await renderLoaded();
    expect(screen.getByText(/Enviada el/).textContent).toContain("después del plazo");
  });
});

describe("lista de mercado: semanas y errores de carga", () => {
  it("al pasar a la semana siguiente guarda lo pendiente de la anterior y carga la nueva", async () => {
    await renderLoaded();
    type(/ACELGA/, "3");
    service.loadWeek.mockResolvedValue(okWeek({ week_start: "2026-10-12", friday: "2026-10-09", deadline_at: "2026-10-09T22:00:00Z" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" })); });
    await advance(0);
    expect(service.saveList).toHaveBeenCalledWith(WEEK, "fruver", { mf1: 3 }); // la de la semana que se dejó
    expect(service.loadWeek).toHaveBeenLastCalledWith("2026-10-12");
    expect(screen.getByRole("heading", { name: /Semana 3 de octubre/ })).toBeTruthy();
    expect((screen.getByLabelText(/ACELGA/) as HTMLInputElement).value).toBe(""); // la nueva semana empieza limpia
  });

  it("el botón 'Ir a la semana del próximo pedido' solo aparece en otra semana", async () => {
    await renderLoaded();
    expect(screen.queryByRole("button", { name: /próximo pedido/ })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Semana anterior" })); });
    await advance(0);
    const back = screen.getByRole("button", { name: /Ir a la semana del próximo pedido/ });
    await act(async () => { fireEvent.click(back); });
    await advance(0);
    expect(service.loadWeek).toHaveBeenLastCalledWith(WEEK);
  });

  it("pasado el plazo lo avisa y deja claro que se puede enviar igual", async () => {
    vi.setSystemTime(new Date("2026-10-02T23:00:00Z")); // viernes 6 pm en Bogotá
    service.loadWeek.mockResolvedValue(okWeek({ week_start: "2026-10-05" }));
    await renderLoaded();
    // a esta hora el próximo pedido ya es el del 9 oct; se vuelve a la semana vencida
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Semana anterior" })); });
    await advance(0);
    expect(screen.getByText(/Plazo vencido/).textContent).toContain("quedará marcada como tardía");
  });

  it("si no se puede cargar la semana, bloquea los campos y ofrece reintentar", async () => {
    service.loadWeek.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } as never });
    await renderLoaded();
    expect(screen.getByText(/No se pudo cargar la lista de esta semana/)).toBeTruthy();
    expect((screen.getByLabelText(/ACELGA/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Enviar lista de la semana" }) as HTMLButtonElement).disabled).toBe(true);

    service.loadWeek.mockResolvedValue(okWeek());
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Reintentar" })[0]); });
    await advance(0);
    expect(screen.queryByText(/No se pudo cargar la lista de esta semana/)).toBeNull();
    expect((screen.getByLabelText(/ACELGA/) as HTMLInputElement).disabled).toBe(false);
  });
});
