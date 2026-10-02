// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketReplyNotification } from "@/types/market";

vi.mock("@/lib/marketService", () => ({ marketService: { loadUnseenReplies: vi.fn() } }));

import ReplyBell from "@/components/market/ReplyBell";
import { REPLIES_CHANGED_EVENT, useMarketReplies } from "@/hooks/useMarketReplies";
import { marketService } from "@/lib/marketService";

const service = vi.mocked(marketService, true);
const ok = <T,>(data: T) => ({ data, error: null });

const reply = (extra: Partial<MarketReplyNotification> = {}): MarketReplyNotification => ({
  week_start: "2026-10-05", kind: "carnes", change_id: "c1", change_text: "Pescado por pechuga", item_name: "PESCADO FILETE",
  reply_text: "Se envía pechuga", replied_at: "2026-10-01T15:00:00Z", ...extra,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ReplyBell: la campanita de la comunidad", () => {
  it("sin respuestas nuevas: sin número y con un mensaje claro al abrirla", () => {
    render(<ReplyBell replies={[]} onOpen={vi.fn()} />);
    const bell = screen.getByRole("button", { name: "Respuestas de la nutricionista: no hay nuevas" });
    expect(document.querySelector(".reply-bell-badge")).toBeNull();
    fireEvent.click(bell);
    expect(screen.getByText("No tienes respuestas nuevas.")).toBeTruthy();
  });

  it("con respuestas: muestra el número (con singular/plural en el nombre accesible)", () => {
    const { rerender } = render(<ReplyBell replies={[reply()]} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Respuestas de la nutricionista: 1 nueva" })).toBeTruthy();
    expect(document.querySelector(".reply-bell-badge")!.textContent).toBe("1");
    rerender(<ReplyBell replies={[reply(), reply({ change_id: "c2" })]} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Respuestas de la nutricionista: 2 nuevas" })).toBeTruthy();
  });

  it("cada respuesta dice dónde está (tipo, semana, producto), qué había pedido y qué le respondieron", () => {
    render(<ReplyBell replies={[reply()]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Respuestas de la nutricionista: 1 nueva/ }));
    const dialog = screen.getByRole("dialog", { name: "Respuestas de la nutricionista" });
    expect(dialog.textContent).toContain("Carnes");
    expect(dialog.textContent).toContain("PESCADO FILETE");
    expect(within(dialog).getByText("Tu cambio: «Pescado por pechuga»")).toBeTruthy();
    expect(within(dialog).getByText("Respuesta: Se envía pechuga")).toBeTruthy();
  });

  it("una nota general (sin producto) no muestra un nombre de producto", () => {
    render(<ReplyBell replies={[reply({ item_name: null })]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Respuestas de la nutricionista/ }));
    expect(screen.getByRole("dialog").textContent).not.toContain("null");
  });

  it("«Ver en la lista» avisa cuál respuesta es y cierra el menú", () => {
    const onOpen = vi.fn();
    const r = reply();
    render(<ReplyBell replies={[r]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Respuestas de la nutricionista/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ver en la lista" }));
    expect(onOpen).toHaveBeenCalledWith(r);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("se cierra con Escape y al tocar fuera", () => {
    render(<div><ReplyBell replies={[reply()]} onOpen={vi.fn()} /><p>afuera</p></div>);
    const bell = screen.getByRole("button", { name: /Respuestas de la nutricionista/ });
    fireEvent.click(bell);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(bell);
    fireEvent.mouseDown(screen.getByText("afuera"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("el texto de la respuesta se muestra como texto, nunca como HTML", () => {
    render(<ReplyBell replies={[reply({ reply_text: "<b>hola</b>", change_text: "<i>x</i>" })]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Respuestas de la nutricionista/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("b, i")).toBeNull();
    expect(dialog.textContent).toContain("<b>hola</b>");
  });
});

describe("useMarketReplies: consulta de la campanita", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    service.loadUnseenReplies.mockResolvedValue(ok([reply()]));
  });

  const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

  it("consulta al montar y entrega las respuestas", async () => {
    const { result } = renderHook(() => useMarketReplies());
    await flush();
    expect(service.loadUnseenReplies).toHaveBeenCalledTimes(1);
    expect(result.current.replies).toEqual([reply()]);
  });

  it("vuelve a consultar cada 60 segundos, y ni un segundo antes", async () => {
    renderHook(() => useMarketReplies());
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(service.loadUnseenReplies).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(service.loadUnseenReplies).toHaveBeenCalledTimes(2);
  });

  it("consulta al volver a la pestaña (solo si está visible) y cuando otra parte avisa con el evento", async () => {
    renderHook(() => useMarketReplies());
    await flush();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(service.loadUnseenReplies).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(service.loadUnseenReplies).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event(REPLIES_CHANGED_EVENT));
    await flush();
    expect(service.loadUnseenReplies).toHaveBeenCalledTimes(3);
  });

  it("al desmontar deja de consultar (sin oyentes ni temporizador)", async () => {
    const { unmount } = renderHook(() => useMarketReplies());
    await flush();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
    window.dispatchEvent(new Event(REPLIES_CHANGED_EVENT));
    await flush();
    expect(service.loadUnseenReplies).toHaveBeenCalledTimes(1);
  });

  it("si falla, no muestra nada, avisa UNA sola vez en la consola y sigue intentando", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    service.loadUnseenReplies.mockResolvedValue({ data: null, error: { message: "Could not find the function" } as never });
    const { result } = renderHook(() => useMarketReplies());
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(result.current.replies).toEqual([]);
    expect(service.loadUnseenReplies.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("si la sesión venció no ensucia la consola", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    service.loadUnseenReplies.mockResolvedValue({ data: null, error: { message: "SESION_INVALIDA" } as never });
    renderHook(() => useMarketReplies());
    await flush();
    expect(error).not.toHaveBeenCalled();
  });

  it("al recuperarse tras un fallo vuelve a mostrar las respuestas", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.loadUnseenReplies.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } as never });
    const { result } = renderHook(() => useMarketReplies());
    await flush();
    expect(result.current.replies).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.replies).toEqual([reply()]);
  });
});
