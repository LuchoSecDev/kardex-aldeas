// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMarketList, AdminMarketOverview, AdminMarketRow, MarketItem, MarketWeek } from "@/types/market";

// Toasts de la lista de mercado de la comunidad, del cambio de PIN y del panel de la nutricionista.
vi.mock("@/lib/marketService", () => ({
  marketService: {
    loadCatalog: vi.fn(), loadWeek: vi.fn(), saveList: vi.fn(), saveChanges: vi.fn(), setParticipants: vi.fn(), submitWeek: vi.fn(),
  },
}));
vi.mock("@/lib/kardexService", () => ({ kardexService: { changePin: vi.fn() } }));
vi.mock("@/lib/adminService", () => ({
  adminService: {
    marketOverview: vi.fn(), marketList: vi.fn(), markMarketReviewed: vi.fn(), marketConsolidated: vi.fn(), marketCatalog: vi.fn(),
  },
}));
vi.mock("@/lib/exporters/marketExporter", () => ({
  exportConsolidatedToExcel: vi.fn().mockResolvedValue(undefined),
  exportCommunityListToExcel: vi.fn().mockResolvedValue(undefined),
}));

import AdminMarketLists from "@/components/admin/AdminMarketLists";
import ChangePinModal from "@/components/ChangePinModal";
import MarketListDashboard from "@/components/market/MarketListDashboard";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { SAVE_DEBOUNCE_MS } from "@/hooks/useMarketList";
import { adminService } from "@/lib/adminService";
import { exportCommunityListToExcel, exportConsolidatedToExcel } from "@/lib/exporters/marketExporter";
import { kardexService } from "@/lib/kardexService";
import { marketService } from "@/lib/marketService";

const market = vi.mocked(marketService, true);
const admin = vi.mocked(adminService, true);
const pin = vi.mocked(kardexService, true);
const exportCommunity = vi.mocked(exportCommunityListToExcel);
const exportConsolidated = vi.mocked(exportConsolidatedToExcel);

const ok = <T,>(data: T) => ({ data, error: null });
const NOW = new Date("2026-10-03T15:00:00Z"); // sábado: se abre la semana del 5 oct
const WEEK = "2026-10-05";
const CATALOG: MarketItem[] = [
  { id: "mc1", kind: "carnes", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, sort_order: 1 },
  { id: "mf1", kind: "fruver", name: "ACELGA", unit: "KG", is_event: false, sort_order: 1 },
];

const toasts = () => [...document.querySelectorAll(".toast")].map((t) => t.querySelector(".toast-text")?.textContent);
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------------------------------------------
describe("lista de mercado de la comunidad: toasts", () => {
  const week = (lists: unknown[] = [], participants: number | null = 11): { data: MarketWeek; error: null } => ({
    data: { week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes"], participants, lists: lists as MarketWeek["lists"] },
    error: null,
  });
  const carnesRow = { kind: "carnes", quantities: { mc1: 2 }, changes: [], sent: false, modified: false, submitted_at: null, first_submitted_at: null, submit_count: 0, late: false, changed_after_deadline: false };

  const renderLoaded = async () => {
    render(<ToastProvider><MarketListDashboard community="Maná" onLogout={vi.fn()} /></ToastProvider>);
    await flush();
  };

  beforeEach(() => {
    market.loadCatalog.mockResolvedValue(ok(CATALOG));
    market.loadWeek.mockResolvedValue(week([carnesRow]));
    market.saveList.mockResolvedValue(ok(null));
    market.saveChanges.mockResolvedValue(ok(null));
    market.setParticipants.mockResolvedValue(ok(null));
    market.submitWeek.mockResolvedValue(ok({ submitted_at: NOW.toISOString(), late: false, changed_after_deadline: false }));
  });

  it("enviar la lista avisa «Lista enviada a la nutricionista.» con un toast verde", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Enviar lista de la semana" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    await flush();
    expect(toasts()).toContain("Lista enviada a la nutricionista.");
    expect(document.querySelector(".toast--success")).not.toBeNull();
  });

  it("un envío tardío lo dice en el toast", async () => {
    market.submitWeek.mockResolvedValue(ok({ submitted_at: NOW.toISOString(), late: true, changed_after_deadline: false }));
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Enviar lista de la semana" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    await flush();
    expect(toasts().join()).toContain("después del plazo");
  });

  it("si el servidor rechaza el envío, sale un error que se queda", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    market.submitWeek.mockResolvedValue({ data: null, error: { message: "LISTA_VACIA" } as never });
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Enviar lista de la semana" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    await flush();
    await advance(60_000);
    expect(toasts()).toContain("La lista está vacía: escribe la cantidad de al menos un producto.");
    expect(document.querySelector(".toast--error")).not.toBeNull();
  });

  it("guardar los participantes avisa cuántos quedaron", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Cambiar \(llegó o se fue alguien\)/ }));
    fireEvent.change(screen.getByLabelText("Nuevo número de participantes"), { target: { value: "9" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar" })); });
    expect(market.setParticipants).toHaveBeenCalledWith(9);
    expect(toasts()).toContain("Participantes guardados: 9.");
  });

  it("agregar, editar y quitar un cambio avisan cada uno", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Cambios del pedido de fruver/ }));
    fireEvent.change(screen.getByLabelText("Cambio"), { target: { value: "Entregar temprano" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar cambio" }));
    expect(toasts()).toContain("Cambio agregado a la lista.");

    fireEvent.click(screen.getByRole("button", { name: "Editar el cambio: Entregar temprano" }));
    fireEvent.change(screen.getByLabelText("Editar el cambio"), { target: { value: "Entregar a las 7" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(toasts()).toContain("Cambio actualizado.");

    fireEvent.click(screen.getByRole("button", { name: "Quitar el cambio: Entregar a las 7" }));
    expect(toasts()).toContain("Cambio quitado de la lista.");
    await advance(SAVE_DEBOUNCE_MS);
  });

  it("un cambio vacío NO da toast de éxito (solo el aviso del formulario)", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Cambios del pedido de fruver/ }));
    fireEvent.change(screen.getByLabelText("Cambio"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar cambio" }));
    expect(toasts()).toEqual([]);
  });

  it("escribir una cantidad y que se guarde sola NO da toast (para eso está «✓ Todos los cambios guardados»)", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/ACELGA/), { target: { value: "3" } });
    await advance(SAVE_DEBOUNCE_MS);
    expect(market.saveList).toHaveBeenCalled();
    expect(screen.getByText("✓ Todos los cambios guardados")).toBeTruthy();
    expect(toasts()).toEqual([]);
  });

  it("si un guardado falló y luego se logra con «Reintentar», avisa «Listo: tus cambios se guardaron.»", async () => {
    market.saveList.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Cantidades inválidas" } as never });
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/ACELGA/), { target: { value: "3" } });
    await advance(SAVE_DEBOUNCE_MS);
    expect(toasts()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await advance(0);
    expect(toasts()).toContain("Listo: tus cambios se guardaron.");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("cambio de PIN: toast", () => {
  it("al cambiarlo avisa «Tu PIN se cambió…» además del mensaje del diálogo", async () => {
    pin.changePin.mockResolvedValue(ok(true) as never);
    render(<ToastProvider><ChangePinModal onClose={vi.fn()} /></ToastProvider>);
    fireEvent.change(screen.getByLabelText("PIN actual"), { target: { value: "4917" } });
    fireEvent.change(screen.getByLabelText("PIN nuevo"), { target: { value: "8520" } });
    fireEvent.change(screen.getByLabelText("Confirma el PIN nuevo"), { target: { value: "8520" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cambiar PIN" })); });
    expect(toasts()).toContain("Tu PIN se cambió. Desde ahora entra con el PIN nuevo.");
    expect(screen.getByText(/Tu PIN se cambió\./, { selector: "strong" })).toBeTruthy();
  });

  it("con el PIN actual equivocado no hay toast de éxito", async () => {
    pin.changePin.mockResolvedValue(ok(false) as never);
    render(<ToastProvider><ChangePinModal onClose={vi.fn()} /></ToastProvider>);
    fireEvent.change(screen.getByLabelText("PIN actual"), { target: { value: "1111" } });
    fireEvent.change(screen.getByLabelText("PIN nuevo"), { target: { value: "8520" } });
    fireEvent.change(screen.getByLabelText("Confirma el PIN nuevo"), { target: { value: "8520" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cambiar PIN" })); });
    expect(toasts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("panel de la nutricionista: toasts", () => {
  const row = (community: string, extra: Partial<AdminMarketRow> = {}): AdminMarketRow => ({
    community, participants: 10, sent: true, submitted_at: "2026-10-02T20:00:00Z", first_submitted_at: "2026-10-02T20:00:00Z",
    submit_count: 1, late: false, changed_after_deadline: false, reviewed: false, has_unsent_changes: false, has_draft: false,
    counts: { fruver: 1, carnes: 1, abarrotes: 0, aseo: 0 }, ...extra,
  });
  const overview: AdminMarketOverview = {
    week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes"],
    communities: [row("Maná"), row("Fortaleza")],
  };
  const detail: AdminMarketList = {
    community: "Maná", week_start: WEEK, friday: "2026-10-02", deadline_at: "2026-10-02T22:00:00Z", kinds_due: ["fruver", "carnes"],
    sent: true, submitted_at: "2026-10-02T20:00:00Z", first_submitted_at: "2026-10-02T20:00:00Z", submit_count: 1, late: false,
    changed_after_deadline: false, reviewed: false, has_unsent_changes: false, participants: 11,
    lists: [{ kind: "fruver", items: [{ id: "mf1", name: "ACELGA", unit: "KG", is_event: false, quantity: 2 }] }],
  };

  beforeEach(() => {
    admin.marketOverview.mockResolvedValue(ok(overview));
    admin.marketList.mockResolvedValue(ok(detail));
    admin.markMarketReviewed.mockResolvedValue(ok(null));
    admin.marketConsolidated.mockResolvedValue(ok([]));
    admin.marketCatalog.mockResolvedValue(ok(CATALOG));
  });

  const renderPanel = async () => {
    render(<ToastProvider><AdminMarketLists focus={null} /></ToastProvider>);
    await flush();
  };
  const openMana = async () => {
    const tr = screen.getByRole("rowheader", { name: "Maná" }).closest("tr")!;
    await act(async () => { fireEvent.click(within(tr).getByRole("button", { name: "Ver lista" })); });
    await flush();
  };

  it("«Marcar revisada» avisa qué lista quedó revisada", async () => {
    await renderPanel();
    await openMana();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Marcar revisada" })); });
    await flush();
    expect(admin.markMarketReviewed).toHaveBeenCalledWith("Maná", WEEK);
    expect(toasts()).toContain("La lista de Maná quedó marcada como revisada.");
  });

  it("si no se pudo marcar revisada, no hay toast de éxito", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    admin.markMarketReviewed.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } as never });
    await renderPanel();
    await openMana();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Marcar revisada" })); });
    await flush();
    expect(toasts()).toEqual([]);
  });

  it("descargar el Excel de una comunidad avisa «Excel de Maná descargado.»", async () => {
    await renderPanel();
    await openMana();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel (formato actual)" })); });
    await flush();
    expect(exportCommunity).toHaveBeenCalledTimes(1);
    expect(toasts()).toContain("Excel de Maná descargado.");
  });

  it("si el Excel de una comunidad falla, avisa con un error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    exportCommunity.mockRejectedValueOnce(new Error("boom"));
    await renderPanel();
    await openMana();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel (formato actual)" })); });
    await flush();
    expect(toasts().join()).toContain("No se pudo generar el Excel de Maná");
    expect(document.querySelector(".toast--error")).not.toBeNull();
  });

  it("descargar el consolidado avisa «Excel consolidado descargado.»", async () => {
    admin.marketConsolidated.mockResolvedValue(ok([
      { community: "Maná", kind: "fruver", item_id: "mf1", name: "ACELGA", unit: "KG", is_event: false, sort_order: 1, quantity: 2 },
    ]));
    await renderPanel();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Consolidado" })); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descargar Excel consolidado" })); });
    await flush();
    expect(exportConsolidated).toHaveBeenCalledTimes(1);
    expect(toasts()).toContain("Excel consolidado descargado.");
  });
});
