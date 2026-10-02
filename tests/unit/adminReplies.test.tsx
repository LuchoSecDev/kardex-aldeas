// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMarketChange, AdminMarketList, AdminMarketOverview, AdminMarketRow } from "@/types/market";

// La nutricionista responde a los cambios que pidió cada comunidad (plan 008, Fase D).
vi.mock("@/lib/adminService", () => ({
  adminService: {
    marketOverview: vi.fn(), marketList: vi.fn(), markMarketReviewed: vi.fn(), marketConsolidated: vi.fn(), marketCatalog: vi.fn(), marketReply: vi.fn(),
  },
}));
vi.mock("@/lib/exporters/marketExporter", () => ({
  exportConsolidatedToExcel: vi.fn().mockResolvedValue(undefined),
  exportCommunityListToExcel: vi.fn().mockResolvedValue(undefined),
}));

import AdminChangeReply from "@/components/admin/AdminChangeReply";
import AdminMarketLists from "@/components/admin/AdminMarketLists";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { adminService } from "@/lib/adminService";

const service = vi.mocked(adminService, true);
const ok = <T,>(data: T) => ({ data, error: null });

const NOW = new Date("2026-10-03T15:00:00Z");
const WEEK = "2026-10-05";

const row = (community: string, extra: Partial<AdminMarketRow> = {}): AdminMarketRow => ({
  community, participants: 10, sent: true, submitted_at: "2026-10-02T20:00:00Z", first_submitted_at: "2026-10-02T20:00:00Z",
  submit_count: 1, late: false, changed_after_deadline: false, reviewed: false, has_unsent_changes: false, has_draft: false,
  counts: { fruver: 1, carnes: 1, abarrotes: 0, aseo: 0 }, changes_count: 2, ...extra,
});
const overview: AdminMarketOverview = {
  week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes"], communities: [row("Maná")],
};

const note = (id: string, text: string, reply: AdminMarketChange["reply"] = null, item_name: string | null = null): AdminMarketChange => ({
  id, item_id: item_name ? "mc2" : null, item_name, unit: item_name ? "KG" : null, text, at: "2026-10-02T19:00:00Z", reply,
});

const detail = (changes: AdminMarketChange[]): AdminMarketList => ({
  community: "Maná", week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes"],
  sent: true, submitted_at: "2026-10-02T20:00:00Z", first_submitted_at: "2026-10-02T20:00:00Z", submit_count: 1, late: false,
  changed_after_deadline: false, reviewed: false, has_unsent_changes: false, participants: 11,
  lists: [
    { kind: "fruver", items: [], changes: [] },
    { kind: "carnes", items: [{ id: "mc1", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, quantity: 3 }], changes },
    { kind: "abarrotes", items: [], changes: [] },
    { kind: "aseo", items: [], changes: [] },
  ],
});

const toasts = () => [...document.querySelectorAll(".toast")].map((t) => t.querySelector(".toast-text")?.textContent);
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  service.marketOverview.mockResolvedValue(ok(overview));
  service.marketList.mockResolvedValue(ok(detail([note("a", "Pescado por pechuga", null, "PESCADO FILETE"), note("b", "Entregar temprano")])));
  service.marketReply.mockResolvedValue(ok(null));
  service.marketConsolidated.mockResolvedValue(ok([]));
  service.marketCatalog.mockResolvedValue(ok([]));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AdminChangeReply: responder una nota", () => {
  it("sin respuesta ofrece «Responder»; al pulsarlo aparece el campo (200 caracteres) y se puede enviar", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AdminChangeReply reply={null} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    const input = screen.getByLabelText("Respuesta a este cambio") as HTMLInputElement;
    expect(input.maxLength).toBe(200);
    fireEvent.change(input, { target: { value: "Se envía pechuga" } });
    expect(screen.getByText("16/200")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar respuesta" })); });
    expect(onSave).toHaveBeenCalledWith("Se envía pechuga");
    expect(screen.queryByLabelText("Respuesta a este cambio")).toBeNull(); // se cerró al guardarse
  });

  it("no deja enviar una respuesta vacía (quitar es otro botón)", () => {
    render(<AdminChangeReply reply={null} busy={false} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.change(screen.getByLabelText("Respuesta a este cambio"), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Enviar respuesta" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("con respuesta la muestra y ofrece «Editar respuesta» (con el texto actual) y «Quitar»", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AdminChangeReply reply={{ text: "Se envía pechuga", at: "2026-10-02T21:00:00Z" }} busy={false} onSave={onSave} />);
    expect(screen.getByText("Se envía pechuga")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Editar respuesta" }));
    expect((screen.getByLabelText("Respuesta a este cambio") as HTMLInputElement).value).toBe("Se envía pechuga");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Quitar" })); });
    expect(onSave).toHaveBeenCalledWith("");
  });

  it("si no se pudo guardar, el campo se queda abierto para reintentar", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<AdminChangeReply reply={null} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.change(screen.getByLabelText("Respuesta a este cambio"), { target: { value: "ok" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar respuesta" })); });
    expect(screen.getByLabelText("Respuesta a este cambio")).toBeTruthy();
  });

  it("mientras se envía, los botones se bloquean", () => {
    render(<AdminChangeReply reply={null} busy={true} onSave={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Responder" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("panel de la nutricionista: responder a los cambios de una comunidad", () => {
  const renderDetail = async () => {
    render(<ToastProvider><AdminMarketLists focus={null} /></ToastProvider>);
    await flush();
    const tr = screen.getByRole("rowheader", { name: "Maná" }).closest("tr")!;
    await act(async () => { fireEvent.click(within(tr).getByRole("button", { name: "Ver lista" })); });
    await flush();
  };
  const block = () => screen.getByRole("group", { name: "Cambios solicitados de Carnes" });

  it("cada nota enviada tiene su botón «Responder»", async () => {
    await renderDetail();
    expect(within(block()).getAllByRole("button", { name: "Responder" })).toHaveLength(2);
  });

  it("responder llama al servidor con la comunidad, la semana, el tipo, la nota y el texto; recarga y avisa", async () => {
    await renderDetail();
    const first = within(block()).getAllByRole("button", { name: "Responder" })[0];
    fireEvent.click(first);
    fireEvent.change(screen.getByLabelText("Respuesta a este cambio"), { target: { value: "  Se envía pechuga  " } });
    const loads = service.marketList.mock.calls.length;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar respuesta" })); });
    await flush();

    expect(service.marketReply).toHaveBeenCalledWith("Maná", WEEK, "carnes", "a", "  Se envía pechuga  ");
    expect(service.marketList.mock.calls.length).toBeGreaterThan(loads); // se recargó el detalle
    expect(toasts()).toContain("Respuesta enviada a Maná.");
  });

  it("una nota que ya tiene respuesta la muestra (y la otra sigue con «Responder»)", async () => {
    service.marketList.mockResolvedValue(ok(detail([note("a", "Pescado por pechuga", { text: "Se envía pechuga", at: "2026-10-02T21:00:00Z" }, "PESCADO FILETE"), note("b", "Entregar temprano")])));
    await renderDetail();
    expect(within(block()).getByText("Se envía pechuga")).toBeTruthy();
    expect(within(block()).getAllByRole("button", { name: "Responder" })).toHaveLength(1);
    expect(within(block()).getByRole("button", { name: "Editar respuesta" })).toBeTruthy();
  });

  it("quitar una respuesta manda texto vacío y avisa «Respuesta quitada.»", async () => {
    service.marketList.mockResolvedValue(ok(detail([note("a", "Pescado por pechuga", { text: "Se envía pechuga", at: "2026-10-02T21:00:00Z" })])));
    await renderDetail();
    await act(async () => { fireEvent.click(within(block()).getByRole("button", { name: "Quitar" })); });
    await flush();
    expect(service.marketReply).toHaveBeenCalledWith("Maná", WEEK, "carnes", "a", "");
    expect(toasts()).toContain("Respuesta quitada.");
  });

  it("si el servidor falla, avisa con un error dentro del bloque, sin toast de éxito, y deja reintentar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.marketReply.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } as never });
    await renderDetail();
    fireEvent.click(within(block()).getAllByRole("button", { name: "Responder" })[0]);
    fireEvent.change(screen.getByLabelText("Respuesta a este cambio"), { target: { value: "ok" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar respuesta" })); });
    await flush();

    expect(within(block()).getByRole("alert").textContent).toContain("No se pudo guardar la respuesta");
    expect(toasts()).toEqual([]);
    expect(screen.getByLabelText("Respuesta a este cambio")).toBeTruthy();
  });

  it("si la sesión venció no muestra error ni toast (la pantalla vuelve a la entrada con su propio aviso)", async () => {
    service.marketReply.mockResolvedValue({ data: null, error: { message: "SESION_ADMIN_INVALIDA" } as never });
    await renderDetail();
    fireEvent.click(within(block()).getAllByRole("button", { name: "Responder" })[0]);
    fireEvent.change(screen.getByLabelText("Respuesta a este cambio"), { target: { value: "ok" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar respuesta" })); });
    await flush();
    expect(within(block()).queryByRole("alert")).toBeNull();
    expect(toasts()).toEqual([]);
  });

  it("un servidor anterior (notas sin `reply`) sigue mostrando «Responder»", async () => {
    service.marketList.mockResolvedValue(ok(detail([{ ...note("a", "Pescado por pechuga"), reply: undefined }])));
    await renderDetail();
    expect(within(block()).getByRole("button", { name: "Responder" })).toBeTruthy();
  });
});
