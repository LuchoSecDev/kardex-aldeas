import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El servicio de /dev (plan 007, B1): qué funciones llama, con qué parámetros, que use SIEMPRE el token del desarrollador (nunca el de
// una comunidad ni el de la nutricionista) y cómo trata la sesión vencida y los mensajes de error.
const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { devErrorMessage, devService } from "@/lib/devService";
import { devSession } from "@/lib/devSession";
import { adminSession } from "@/lib/adminSession";
import { session } from "@/lib/session";
import type { DevGroupKey } from "@/types/dev";

const GROUP: DevGroupKey = { community: "Maná", fn: "kardex_save_product", source: "rpc", level: "warning", code: null };

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  devSession.set("tok-dev");
  adminSession.set("tok-admin");
  session.set("tok-com");
});
afterEach(() => {
  devSession.set(null);
  adminSession.set(null);
  session.set(null);
});

describe("login y cambio de contraseña", () => {
  it("el login no lleva token y devuelve lo que responde el servidor", async () => {
    rpc.mockResolvedValue({ data: { token: "t", must_change: true }, error: null });
    const res = await devService.login("mi-clave-larga-123");
    expect(rpc).toHaveBeenCalledWith("dev_login", { p_password: "mi-clave-larga-123" });
    expect(res.data).toEqual({ token: "t", must_change: true });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("tok-");
  });

  it("cambiar la contraseña manda el token del desarrollador, la actual y la nueva", async () => {
    await devService.changePassword("actual-larga-1", "nueva-larga-12");
    expect(rpc).toHaveBeenCalledWith("dev_change_password", { p_token: "tok-dev", p_current: "actual-larga-1", p_new: "nueva-larga-12" });
  });

  it("cerrar sesión borra el token en memoria y avisa al servidor; sin sesión no llama", async () => {
    await devService.logout();
    expect(rpc).toHaveBeenCalledWith("dev_logout", { p_token: "tok-dev" });
    expect(devSession.get()).toBeNull();
    rpc.mockClear();
    await devService.logout();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("lectura y resolver", () => {
  it("cada función usa su nombre y el token del desarrollador, y NUNCA los de otras cuentas", async () => {
    await devService.summary();
    await devService.groups(7, true);
    await devService.detail(GROUP, 20);
    await devService.resolve(GROUP);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["dev_error_summary", "dev_error_groups", "dev_error_group_detail", "dev_resolve_group"]);
    for (const [, args] of rpc.mock.calls) expect(args.p_token).toBe("tok-dev");
    const todo = JSON.stringify(rpc.mock.calls);
    expect(todo).not.toContain("tok-admin");
    expect(todo).not.toContain("tok-com");
  });

  it("los parámetros son los que esperan las funciones SQL", async () => {
    await devService.groups(30, false);
    expect(rpc).toHaveBeenLastCalledWith("dev_error_groups", { p_token: "tok-dev", p_days: 30, p_only_open: false });
    await devService.detail({ ...GROUP, level: "error", code: "P0001" }, 5);
    expect(rpc).toHaveBeenLastCalledWith("dev_error_group_detail", {
      p_token: "tok-dev", p_community: "Maná", p_fn: "kardex_save_product", p_source: "rpc", p_level: "error", p_code: "P0001", p_limit: 5,
    });
    await devService.detail(GROUP);
    expect(rpc.mock.calls.at(-1)![1].p_limit).toBe(20);
    await devService.resolve(GROUP);
    expect(rpc).toHaveBeenLastCalledWith("dev_resolve_group", {
      p_token: "tok-dev", p_community: "Maná", p_fn: "kardex_save_product", p_source: "rpc", p_level: "warning", p_code: null,
    });
  });
});

describe("sesión vencida y mensajes", () => {
  it("SESION_DEV_INVALIDA borra el token y avisa a la pantalla; otros errores no", async () => {
    const expired = vi.fn();
    const off = devSession.onExpired(expired);
    rpc.mockResolvedValue({ data: null, error: { message: "SESION_DEV_INVALIDA", code: "P0001" } });
    await devService.summary();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(devSession.get()).toBeNull();

    devSession.set("tok-dev");
    rpc.mockResolvedValue({ data: null, error: { message: "Rango inválido", code: "P0001" } });
    await devService.summary();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(devSession.get()).toBe("tok-dev");
    off();
  });

  it("el token del desarrollador vive aparte: vencerlo no toca los de la comunidad ni la nutricionista", () => {
    devSession.notifyExpired();
    expect(adminSession.get()).toBe("tok-admin");
    expect(session.get()).toBe("tok-com");
  });

  it("los mensajes para la persona: bloqueo, validación de la contraseña y un texto genérico para lo demás", () => {
    expect(devErrorMessage({ message: "DEV_BLOQUEADO" } as never)).toContain("15 minutos");
    expect(devErrorMessage({ message: "Contraseña inválida: mínimo 12 caracteres" } as never)).toBe("Contraseña inválida: mínimo 12 caracteres");
    expect(devErrorMessage({ message: "La nueva contraseña debe ser distinta de la actual" } as never)).toContain("distinta");
    const generico = devErrorMessage({ message: "TypeError: Failed to fetch" } as never);
    expect(generico).toContain("Revisa tu conexión");
    expect(generico).not.toContain("TypeError");
    expect(devErrorMessage({ message: undefined } as never)).toContain("Revisa tu conexión");
  });
});
