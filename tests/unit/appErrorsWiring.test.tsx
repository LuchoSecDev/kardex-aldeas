// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cómo se conecta el aviso de errores (plan 007, Fase A) con el resto de la app: authedRpc, la función SQL y el layout.
const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { appErrors } from "@/lib/appErrors";
import { authedRpc } from "@/lib/authedRpc";
import ErrorReporter from "@/components/ErrorReporter";
import { session } from "@/lib/session";

const reportRpcError = vi.spyOn(appErrors, "reportRpcError").mockResolvedValue(undefined);

beforeEach(() => {
  rpc.mockReset();
  reportRpcError.mockClear();
  session.set("tok-A");
});
afterEach(() => {
  cleanup();
  session.set(null);
});

describe("authedRpc avisa de los fallos sin cambiar lo que devuelve", () => {
  it("un fallo se reporta con la función y el error, y el resultado sale igual que antes", async () => {
    const error = { code: "P0001", message: "Cantidades inválidas" };
    rpc.mockResolvedValue({ data: null, error });
    const result = await authedRpc("market_list_save", { p_kind: "carnes", p_quantities: { m1: 3 } });
    expect(result).toEqual({ data: null, error });
    expect(reportRpcError).toHaveBeenCalledTimes(1);
    // Solo la función y el error: nunca los argumentos de la llamada (llevan el token y las cantidades).
    expect(reportRpcError).toHaveBeenCalledWith("market_list_save", error, "tok-A");
    expect(JSON.stringify(reportRpcError.mock.calls)).not.toContain("carnes");
    expect(JSON.stringify(reportRpcError.mock.calls)).not.toContain("p_quantities");
  });

  it("el aviso se atribuye a la sesión que tenía la llamada, aunque entre otra comunidad mientras espera", async () => {
    rpc.mockImplementation(async () => {
      session.set("tok-B"); // otra comunidad entra en el mismo equipo mientras la llamada de A sigue en vuelo
      return { data: null, error: { code: "P0001", message: "Cantidades inválidas" } };
    });
    await authedRpc("market_list_save");
    expect(rpc).toHaveBeenCalledWith("market_list_save", expect.objectContaining({ p_token: "tok-A" }));
    expect(reportRpcError).toHaveBeenCalledWith("market_list_save", expect.anything(), "tok-A");
  });

  it("si todo sale bien no se reporta nada", async () => {
    rpc.mockResolvedValue({ data: [1, 2], error: null });
    expect(await authedRpc("market_catalog")).toEqual({ data: [1, 2], error: null });
    expect(reportRpcError).not.toHaveBeenCalled();
  });

  it("una sesión vencida avisa a la pantalla y NO se reporta", async () => {
    const expired = vi.fn();
    const off = session.onExpired(expired);
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "SESION_INVALIDA" } });
    await authedRpc("kardex_load_month", { p_year: 2026, p_month: 9 });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(reportRpcError).not.toHaveBeenCalled();
    off();
  });

  it("si el aviso fallara por dentro, la llamada de datos no se entera", async () => {
    reportRpcError.mockRejectedValueOnce(new Error("boom"));
    rpc.mockResolvedValue({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    await expect(authedRpc("kardex_save_product")).resolves.toMatchObject({ data: null });
  });
});

describe("la llamada a la función SQL", () => {
  it("manda exactamente los parámetros de dev_report_client_error y devuelve su error", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "nope" } });
    const result = await appErrors.report({ source: "rpc", level: "warning", fn: "kardex_save_product", code: null, message: "sin red" });
    expect(result).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, params] = rpc.mock.calls[0];
    expect(name).toBe("dev_report_client_error");
    expect(Object.keys(params).sort()).toEqual(["p_code", "p_fn", "p_level", "p_message", "p_source", "p_token", "p_version"]);
    expect(params).toMatchObject({ p_token: "tok-A", p_source: "rpc", p_level: "warning", p_fn: "kardex_save_product", p_code: null, p_message: "sin red" });
    expect(params.p_version).toMatch(/^[A-Za-z0-9_.-]{1,12}$/);
  });
});

describe("el componente del layout", () => {
  it("instala los manejadores de la página al montarse y los quita al desmontarse", () => {
    const off = vi.fn();
    const install = vi.spyOn(appErrors, "installGlobalHandlers").mockReturnValue(off);
    const { container, unmount } = render(<ErrorReporter />);
    expect(container.innerHTML).toBe("");
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith(window);
    unmount();
    expect(off).toHaveBeenCalledTimes(1);
    install.mockRestore();
  });

  it("está montado en el layout (cubre todas las pantallas)", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain('import ErrorReporter from "@/components/ErrorReporter"');
    expect(layout).toContain("<ErrorReporter />");
  });
});
