// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminBell from "@/components/admin/AdminBell";
import type { AdminMarketNotification } from "@/types/market";
import type { AdminNotification } from "@/types/submissions";

afterEach(cleanup);

const kardexN = (extra: Partial<AdminNotification> = {}): AdminNotification => ({
  id: "k1", community: "Maná", year: 2026, month: 8, week_index: 2, submitted_at: "2026-09-30T10:00:00Z",
  submit_count: 1, modified: false, ...extra,
});

const marketN = (extra: Partial<AdminMarketNotification> = {}): AdminMarketNotification => ({
  community: "Fortaleza", week_start: "2026-10-05", submitted_at: "2026-10-02T20:00:00Z",
  submit_count: 1, late: false, changed_after_deadline: false, ...extra,
});

const baseProps = {
  loadFailed: false,
  reviewingId: null,
  reviewError: null,
  onOpen: vi.fn(),
  onReview: vi.fn(),
  onOpenMarket: vi.fn(),
  onReviewMarket: vi.fn(),
};

const open = () => fireEvent.click(screen.getByRole("button", { name: /Notificaciones/ }));

describe("campanita: kardex + listas de mercado", () => {
  it("el contador suma las semanas del kardex y las listas de mercado", () => {
    render(<AdminBell {...baseProps} notifications={[kardexN()]} marketNotifications={[marketN(), marketN({ community: "Shalom" })]} />);
    expect(screen.getByRole("button", { name: /3 envíos por revisar/ })).toBeTruthy();
  });

  it("sin nada pendiente lo dice; sin la lista de mercado (uso anterior) sigue funcionando", () => {
    render(<AdminBell {...baseProps} notifications={[]} />);
    expect(screen.getByRole("button", { name: /no hay envíos pendientes/ })).toBeTruthy();
    open();
    expect(screen.getByText("No hay envíos pendientes de revisión.")).toBeTruthy();
  });

  it("mezcla las dos clases de aviso, del envío más reciente al más antiguo", () => {
    render(<AdminBell {...baseProps} notifications={[kardexN({ submitted_at: "2026-09-30T10:00:00Z" })]} marketNotifications={[marketN({ submitted_at: "2026-10-02T20:00:00Z" })]} />);
    open();
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Lista de mercado");
    expect(items[1].textContent).toContain("Semana 3 de Septiembre 2026");
  });

  it("la lista de mercado muestra comunidad, semana, si llegó tarde y si fue reenviada", () => {
    render(<AdminBell {...baseProps} notifications={[]} marketNotifications={[marketN({ late: true, submit_count: 2 })]} />);
    open();
    const item = screen.getByRole("listitem");
    expect(item.textContent).toContain("Fortaleza");
    expect(item.textContent).toContain("Semana 2 de octubre");
    expect(item.textContent).toContain("Enviada tarde (reenviada)");
  });

  it("'Ver lista' abre esa lista y cierra el menú; 'Marcar revisada' la revisa", () => {
    const onOpenMarket = vi.fn();
    const onReviewMarket = vi.fn();
    const n = marketN();
    render(<AdminBell {...baseProps} notifications={[]} marketNotifications={[n]} onOpenMarket={onOpenMarket} onReviewMarket={onReviewMarket} />);
    open();
    const item = screen.getByRole("listitem");
    fireEvent.click(within(item).getByRole("button", { name: "Marcar revisada" }));
    expect(onReviewMarket).toHaveBeenCalledWith(n);

    fireEvent.click(within(item).getByRole("button", { name: "Ver lista" }));
    expect(onOpenMarket).toHaveBeenCalledWith(n);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("los avisos del kardex siguen abriendo el kardex", () => {
    const onOpen = vi.fn();
    const n = kardexN();
    render(<AdminBell {...baseProps} notifications={[n]} onOpen={onOpen} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Ver kardex" }));
    expect(onOpen).toHaveBeenCalledWith(n);
  });

  it("mientras se marca una lista, su botón dice 'Marcando…' y todos se bloquean", () => {
    render(<AdminBell {...baseProps} notifications={[kardexN()]} marketNotifications={[marketN()]} reviewingId="m:Fortaleza|2026-10-05" />);
    open();
    expect(screen.getByRole("button", { name: "Marcando…" })).toBeTruthy();
    for (const b of screen.getAllByRole("button", { name: /Marcar revisada|Marcando/ })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("muestra el error de carga y el de revisión", () => {
    render(<AdminBell {...baseProps} notifications={[]} loadFailed reviewError="No se pudo marcar como revisada. Inténtalo de nuevo." />);
    open();
    expect(screen.getAllByRole("alert").map((a) => a.textContent).join(" ")).toContain("No se pudieron actualizar las notificaciones");
    expect(screen.getAllByRole("alert").map((a) => a.textContent).join(" ")).toContain("No se pudo marcar como revisada");
  });
});
