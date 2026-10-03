// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_RETRY_DELAYS_MS, AUTO_RETRY_MAX, useSaveAutoRetry, type AutoRetryStatus } from "@/hooks/useSaveAutoRetry";

// Recuperación automática de los cambios sin guardar: cuándo reintenta solo y cuándo no.
let online = true;
const setOnline = (value: boolean) => {
  online = value;
  act(() => { window.dispatchEvent(new Event(value ? "online" : "offline")); });
};
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(initial: AutoRetryStatus = "idle") {
  const retry = vi.fn();
  const view = renderHook(({ status }) => useSaveAutoRetry(status, retry), { initialProps: { status: initial } });
  const go = (status: AutoRetryStatus) => view.rerender({ status });
  return { retry, go, view };
}

describe("reintento por reloj (con conexión)", () => {
  it("no hace nada mientras todo va bien", async () => {
    const { retry, go } = setup("saved");
    go("saving");
    go("saved");
    await advance(10 * 60_000);
    expect(retry).not.toHaveBeenCalled();
  });

  it("en error reintenta a los 15 s y luego espera más: 30 s y 60 s (que se repite)", async () => {
    const { retry, go } = setup("saving");
    go("error");
    await advance(AUTO_RETRY_DELAYS_MS[0] - 1);
    expect(retry).not.toHaveBeenCalled();
    await advance(1);
    expect(retry).toHaveBeenCalledTimes(1);

    // El reintento falla de nuevo: pasa por «guardando» y vuelve a «error».
    go("saving");
    go("error");
    await advance(AUTO_RETRY_DELAYS_MS[1] - 1);
    expect(retry).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(retry).toHaveBeenCalledTimes(2);

    go("saving");
    go("error");
    await advance(AUTO_RETRY_DELAYS_MS[2]);
    expect(retry).toHaveBeenCalledTimes(3);
    go("saving");
    go("error");
    await advance(AUTO_RETRY_DELAYS_MS[2]);
    expect(retry).toHaveBeenCalledTimes(4);
  });

  it("si el guardado se logra, cancela el reintento pendiente y reinicia la cuenta", async () => {
    const { retry, go } = setup("saving");
    go("error");
    await advance(AUTO_RETRY_DELAYS_MS[0]);
    expect(retry).toHaveBeenCalledTimes(1);
    go("saving");
    go("saved");
    await advance(5 * 60_000);
    expect(retry).toHaveBeenCalledTimes(1);

    // Una falla nueva vuelve a empezar desde los 15 s.
    go("saving");
    go("error");
    await advance(AUTO_RETRY_DELAYS_MS[0]);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it(`deja de reintentar por reloj tras ${AUTO_RETRY_MAX} intentos (un error que repetir no arregla no insiste para siempre)`, async () => {
    const { retry, go } = setup("saving");
    for (let i = 0; i < AUTO_RETRY_MAX + 3; i++) {
      go("error");
      await advance(AUTO_RETRY_DELAYS_MS[AUTO_RETRY_DELAYS_MS.length - 1]);
      go("saving");
    }
    expect(retry).toHaveBeenCalledTimes(AUTO_RETRY_MAX);
  });
});

describe("sin conexión", () => {
  it("no reintenta por reloj, y al volver la conexión reintenta de inmediato", async () => {
    setOnline(false);
    const { retry, go, view } = setup("saving");
    expect(view.result.current.offline).toBe(true);
    go("error");
    await advance(10 * 60_000);
    expect(retry).not.toHaveBeenCalled();

    setOnline(true);
    expect(view.result.current.offline).toBe(false);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("al volver la conexión sin nada pendiente no reintenta", () => {
    setOnline(false);
    const { retry, go } = setup("saving");
    go("saved");
    setOnline(true);
    expect(retry).not.toHaveBeenCalled();
  });

  it("usa siempre el reintento más reciente aunque la función cambie en cada pintado (como en la lista de mercado)", async () => {
    const older = vi.fn();
    const newer = vi.fn();
    const view = renderHook(({ status, fn }) => useSaveAutoRetry(status, fn), {
      initialProps: { status: "saving" as AutoRetryStatus, fn: older },
    });
    view.rerender({ status: "error", fn: older });
    await advance(AUTO_RETRY_DELAYS_MS[0] - 1000);
    // Un pintado intermedio con otra función no reinicia el reloj y se usa la nueva.
    view.rerender({ status: "error", fn: newer });
    await advance(1000);
    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
  });
});

describe("al volver a la pestaña o a la ventana", () => {
  it("reintenta de inmediato si hay un guardado fallido y hay conexión", () => {
    const { retry, go } = setup("saving");
    go("error");
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(retry).toHaveBeenCalledTimes(1);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("no reintenta si todo está guardado, ni si el navegador sigue sin conexión", () => {
    const { retry, go } = setup("saving");
    go("saved");
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(retry).not.toHaveBeenCalled();

    setOnline(false);
    go("error");
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(retry).not.toHaveBeenCalled();
  });
});

describe("recovering (para que el aviso no parpadee)", () => {
  it("se activa en la primera falla, sigue activo mientras se reintenta y se apaga al guardar", () => {
    const { go, view } = setup("saving");
    expect(view.result.current.recovering).toBe(false);
    go("error");
    expect(view.result.current.recovering).toBe(true);
    go("saving");
    expect(view.result.current.recovering).toBe(true);
    go("saved");
    expect(view.result.current.recovering).toBe(false);
  });
});
