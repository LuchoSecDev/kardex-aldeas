import { describe, expect, it, vi } from "vitest";
import { DEDUP_WINDOW_MS, MAX_QUEUED, createErrorReporter, isExpectedCondition, levelForRpcError } from "@/lib/errorReporter";
import type { ErrorReport, ErrorSender } from "@/lib/errorReporter";

// Aviso de errores del navegador (plan 007, Fase A). Se prueba con un `send` falso: lo importante es que NUNCA estorbe, que
// no repita ni inunde, que no mande lo que no debe y que sin red espere y salga después con la sesión correcta.
const OK = { error: null };
const NETWORK = { error: { message: "TypeError: Failed to fetch" } }; // sin código: no hubo respuesta del servidor

function setup(opts: { token?: string | null; send?: ErrorSender } = {}) {
  let t = 1_000_000;
  const token = { value: opts.token === undefined ? "tok-A" : opts.token };
  const send = vi.fn<ErrorSender>(opts.send ?? (async () => OK));
  const reporter = createErrorReporter({ send, getToken: () => token.value, version: "abc1234", now: () => t });
  return { reporter, send, token, advance: (ms: number) => { t += ms; } };
}

const report = (extra: Partial<ErrorReport> = {}): ErrorReport => ({
  source: "rpc", level: "error", fn: "kardex_save_product", code: "P0001", message: "Datos incompletos", ...extra,
});

describe("lo que se manda", () => {
  it("manda el token aparte y el reporte con la función, el código, el mensaje y la versión; nada más", async () => {
    const { reporter, send } = setup();
    await reporter.report(report());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("tok-A", {
      source: "rpc", level: "error", fn: "kardex_save_product", code: "P0001", message: "Datos incompletos", version: "abc1234",
    });
    // El reporte no tiene lugar para argumentos de la llamada ni para el token.
    expect(Object.keys(send.mock.calls[0][1]).sort()).toEqual(["code", "fn", "level", "message", "source", "version"]);
  });

  it("sin sesión no se manda nada (la comunidad la deduce el servidor del token)", async () => {
    const { reporter, send } = setup({ token: null });
    await reporter.report(report());
    expect(send).not.toHaveBeenCalled();
  });

  it("limpia el texto: espacios en uno, recorta a 300 y pone «sin mensaje» si viene vacío", async () => {
    const { reporter, send } = setup();
    await reporter.report(report({ message: "  hola \n  mundo\t" }));
    await reporter.report(report({ message: "x".repeat(400), fn: "otra_funcion" }));
    await reporter.report(report({ message: "   ", fn: "otra_mas" }));
    expect(send.mock.calls[0][1].message).toBe("hola mundo");
    expect(send.mock.calls[1][1].message).toHaveLength(300);
    expect(send.mock.calls[2][1].message).toBe("sin mensaje");
  });

  it("una función o un código con caracteres raros no viajan tal cual", async () => {
    const { reporter, send } = setup();
    await reporter.report(report({ fn: "mi funcion; drop", code: "a b" }));
    expect(send.mock.calls[0][1].fn).toBe("desconocida");
    expect(send.mock.calls[0][1].code).toBeNull();
  });
});

describe("no repetir ni inundar", () => {
  it("el mismo error se manda una vez por minuto", async () => {
    const { reporter, send, advance } = setup();
    await reporter.report(report());
    advance(DEDUP_WINDOW_MS - 1);
    await reporter.report(report());
    expect(send).toHaveBeenCalledTimes(1);
    advance(2);
    await reporter.report(report());
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("errores distintos sí se mandan los dos", async () => {
    const { reporter, send } = setup();
    await reporter.report(report({ message: "uno" }));
    await reporter.report(report({ message: "dos" }));
    await reporter.report(report({ fn: "otra_funcion", message: "uno" }));
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe("cuándo es un error y cuándo un flujo normal", () => {
  it("las condiciones esperadas en MAYÚSCULAS (LISTA_VACIA, PIN_DEBIL, SESION_INVALIDA) no son fallos", () => {
    for (const m of ["LISTA_VACIA", "PIN_DEBIL", "SESION_INVALIDA", "PIN_BLOQUEADO", "DEMASIADOS_CAMBIOS"]) expect(isExpectedCondition(m), m).toBe(true);
    for (const m of ["Cambios inválidos", "Datos incompletos", "TypeError: Failed to fetch", "", undefined, null]) expect(isExpectedCondition(m), String(m)).toBe(false);
  });

  it("reportRpcError ignora lo esperado y reporta el resto con su nivel", async () => {
    const { reporter, send } = setup();
    await reporter.reportRpcError("market_list_submit", { code: "P0001", message: "LISTA_VACIA" });
    await reporter.reportRpcError("kardex_load_month", { code: "", message: "SESION_INVALIDA" });
    expect(send).not.toHaveBeenCalled();

    await reporter.reportRpcError("market_list_save", { code: "P0001", message: "Cantidades inválidas" });
    await reporter.reportRpcError("kardex_save_product", { code: "", message: "TypeError: Failed to fetch" });
    expect(send.mock.calls[0][1]).toMatchObject({ source: "rpc", level: "error", fn: "market_list_save", code: "P0001" });
    expect(send.mock.calls[1][1]).toMatchObject({ source: "rpc", level: "warning", fn: "kardex_save_product" });
  });

  it("sin código de base de datos es una advertencia de red; con código, un error", () => {
    expect(levelForRpcError({ code: "" })).toBe("warning");
    expect(levelForRpcError({ code: undefined })).toBe("warning");
    expect(levelForRpcError({ code: "P0001" })).toBe("error");
    expect(levelForRpcError({ code: "PGRST301" })).toBe("error");
  });
});

describe("nunca estorba", () => {
  it("si el envío lanza una excepción, se traga y el reporte espera", async () => {
    const { reporter } = setup({ send: async () => { throw new Error("boom"); } });
    await expect(reporter.report(report())).resolves.toBeUndefined();
    expect(reporter.pending()).toBe(1);
  });

  it("si pedir el token lanza, tampoco rompe", async () => {
    const send = vi.fn<ErrorSender>(async () => OK);
    const reporter = createErrorReporter({ send, getToken: () => { throw new Error("sin sesión"); }, version: "v" });
    await expect(reporter.report(report())).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("un error del servidor CON código (p. ej. «Reporte inválido») no se reintenta ni se acumula", async () => {
    const { reporter, send } = setup({ send: async () => ({ error: { code: "P0001", message: "Reporte inválido" } }) });
    await reporter.report(report());
    expect(reporter.pending()).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("si la función aún no existe en la base (SQL sin correr), se apaga hasta recargar", async () => {
    for (const error of [{ code: "PGRST202", message: "x" }, { code: "42883", message: "x" }, { code: "", message: "Could not find the function public.dev_report_client_error" }]) {
      const { reporter, send } = setup({ send: async () => ({ error }) });
      await reporter.report(report({ message: "a" }));
      expect(reporter.isDisabled(), JSON.stringify(error)).toBe(true);
      await reporter.report(report({ message: "b" }));
      expect(send).toHaveBeenCalledTimes(1);
      expect(reporter.pending()).toBe(0);
    }
  });
});

describe("sin red", () => {
  it("espera en memoria y sale al volver la conexión, en orden", async () => {
    let online = false;
    const { reporter, send } = setup({ send: async () => (online ? OK : NETWORK) });
    await reporter.report(report({ message: "primero" }));
    await reporter.report(report({ message: "segundo" }));
    expect(reporter.pending()).toBe(2);

    online = true;
    await reporter.flush();
    expect(reporter.pending()).toBe(0);
    const delivered = send.mock.calls.filter((_, i) => i >= 2).map((c) => c[1].message);
    expect(delivered).toEqual(["primero", "segundo"]);
  });

  it("el evento «online» de la página vacía la cola", async () => {
    let online = false;
    const { reporter } = setup({ send: async () => (online ? OK : NETWORK) });
    const target = new EventTarget();
    reporter.installGlobalHandlers(target as unknown as Window);
    await reporter.report(report());
    expect(reporter.pending()).toBe(1);

    online = true;
    target.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(reporter.pending()).toBe(0));
  });

  it("cada reporte espera con la sesión con la que nació, aunque después cambie la comunidad", async () => {
    let online = false;
    const { reporter, send, token } = setup({ send: async () => (online ? OK : NETWORK) });
    await reporter.report(report({ message: "de A" }));
    token.value = "tok-B"; // otra comunidad entra en el mismo equipo
    online = true;
    await reporter.flush();
    expect(send).toHaveBeenLastCalledWith("tok-A", expect.objectContaining({ message: "de A" }));
  });

  it("guarda como máximo 20: si se llena, se pierde el más viejo", async () => {
    const { reporter, send } = setup({ send: async () => NETWORK });
    for (let i = 0; i < MAX_QUEUED + 5; i++) await reporter.report(report({ message: `e${i}` }));
    expect(reporter.pending()).toBe(MAX_QUEUED);
    send.mockImplementation(async () => OK);
    await reporter.flush();
    expect(send.mock.calls.slice(-MAX_QUEUED)[0][1].message).toBe("e5");
  });
});

describe("errores de la página", () => {
  const install = () => {
    const ctx = setup();
    const target = new EventTarget();
    const off = ctx.reporter.installGlobalHandlers(target as unknown as Window);
    const fire = (type: string, props: Record<string, unknown>) => {
      const e = new Event(type);
      Object.assign(e, props);
      target.dispatchEvent(e);
    };
    return { ...ctx, target, off, fire };
  };

  it("un error no capturado se reporta como de la página", async () => {
    const { send, fire } = install();
    fire("error", { message: "Cannot read properties of undefined" });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][1]).toMatchObject({ source: "window", level: "error", fn: "window.onerror", message: "Cannot read properties of undefined" });
  });

  it("un recurso que no cargó (sin mensaje) y los avisos benignos del navegador no se reportan", async () => {
    const { send, fire } = install();
    fire("error", {});
    fire("error", { message: "" });
    fire("error", { message: "ResizeObserver loop completed with undelivered notifications." });
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
  });

  it("una promesa rechazada se reporta (con Error o con texto); una condición esperada no", async () => {
    const { send, fire } = install();
    fire("unhandledrejection", { reason: new Error("fallo de red al guardar") });
    fire("unhandledrejection", { reason: "otro fallo" });
    fire("unhandledrejection", { reason: new Error("SESION_INVALIDA") });
    fire("unhandledrejection", { reason: { raro: true } });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls.map((c) => c[1].message)).toEqual(["fallo de red al guardar", "otro fallo", "Promesa rechazada"]);
    expect(send.mock.calls[0][1].fn).toBe("window.unhandledrejection");
  });

  it("al quitar los manejadores deja de escuchar", async () => {
    const { send, fire, off } = install();
    off();
    fire("error", { message: "x" });
    fire("unhandledrejection", { reason: new Error("y") });
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
  });
});
