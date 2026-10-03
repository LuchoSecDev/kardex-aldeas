import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestCommunity, supabase } from "./helpers";

// Cuenta del desarrollador (pantalla /dev, plan 007 B1) contra la base real. Requiere haber corrido dev_auth_1/2.sql y
// dev_errors_1/2/3.sql. NO modifica la cuenta: solo inicia sesión (a diferencia de dev-lifecycle.test.ts, que cambia la
// contraseña). Es opt-in con la contraseña VIGENTE de la cuenta (ya cambiada, no la temporal):
//
//   $env:DEV_LOGIN_PASSWORD = "<contraseña actual>"; npm run test:integration
//
// Una contraseña equivocada suma un intento fallido (5 bloquean la cuenta 15 min), por eso la prueba se detiene en el primer
// inicio de sesión si falla (los siguientes solo ocurren con la contraseña ya comprobada). Si la cuenta aún tiene la contraseña TEMPORAL, solo comprueba que esa sesión no deja hacer nada más que
// cambiarla y salta el resto. Escribe únicamente reportes de comunidades ZZZ_TEST_BORRAR_AUTO_* (cleanup_test_data.sql los borra).
const password = process.env.DEV_LOGIN_PASSWORD;

type Login = { token: string; must_change: boolean } | null;
type Group = { community: string; fn: string; source: string; level: string; code: string | null; total: number; open_count: number; last_message: string };

describe.skipIf(!password)("cuenta del desarrollador (con sesión, sin modificar la cuenta)", () => {
  let devToken = "";
  let mustChange = false;
  const c = { name: "", token: "" };
  const FN_A = "kardex_save_product";
  const FN_B = "kardex_load_month";

  const key = (fn: string, level = "warning") => ({ p_community: c.name, p_fn: fn, p_source: "rpc", p_level: level, p_code: null });
  const groups = async (days = 1, onlyOpen = true) => {
    const res = await supabase.rpc("dev_error_groups", { p_token: devToken, p_days: days, p_only_open: onlyOpen });
    expect(res.error, JSON.stringify(res.error)).toBeNull();
    return (res.data as Group[]).filter((g) => g.community === c.name);
  };
  const report = (fn: string, message: string) =>
    supabase.rpc("dev_report_client_error", {
      p_token: c.token, p_source: "rpc", p_level: "warning", p_fn: fn, p_code: null, p_message: message, p_version: "test",
    });

  beforeAll(async () => {
    const login = await supabase.rpc("dev_login", { p_password: password });
    const data = login.data as Login;
    if (login.error || !data) {
      throw new Error("No se pudo iniciar sesión del desarrollador: revisa DEV_LOGIN_PASSWORD (¿vigente y sin bloqueo?).");
    }
    devToken = data.token;
    mustChange = data.must_change;
    Object.assign(c, await createTestCommunity("devacc"));
  });

  afterAll(async () => {
    if (devToken) await supabase.rpc("dev_logout", { p_token: devToken });
  });

  it("las tablas de la cuenta, las sesiones y la auditoría están cerradas (permiso denegado, no «no existe»)", async () => {
    for (const table of ["dev_account", "dev_sessions", "dev_audit_log"]) {
      expect((await supabase.from(table).select("*").limit(1)).error?.code, table).toBe("42501");
    }
  });

  it("una sesión de comunidad o un token falso no sirven en /dev (SESION_DEV_INVALIDA)", async () => {
    for (const token of [c.token, "token-falso", ""]) {
      expect((await supabase.rpc("dev_ping", { p_token: token })).error?.message).toContain("SESION_DEV_INVALIDA");
      expect((await supabase.rpc("dev_error_summary", { p_token: token })).error?.message).toContain("SESION_DEV_INVALIDA");
    }
  });

  it("el token del desarrollador no sirve en las funciones de las comunidades ni de la nutricionista", async () => {
    const community = await supabase.rpc("kardex_months_with_data", { p_token: devToken });
    expect(community.error?.message).toContain("SESION_INVALIDA");
    const admin = await supabase.rpc("admin_ping", { p_token: devToken });
    expect(admin.error?.message).toContain("SESION_ADMIN_INVALIDA");
  });

  it("si la contraseña sigue siendo la temporal, la sesión solo deja cambiarla", async (ctx) => {
    if (!mustChange) ctx.skip("la cuenta ya no tiene contraseña temporal");
    expect((await supabase.rpc("dev_ping", { p_token: devToken })).error?.message).toContain("DEV_DEBE_CAMBIAR_CLAVE");
    expect((await supabase.rpc("dev_error_summary", { p_token: devToken })).error?.message).toContain("DEV_DEBE_CAMBIAR_CLAVE");
  });

  it("con la contraseña ya cambiada: ping, resumen y lista responden con la forma que espera la pantalla", async (ctx) => {
    if (mustChange) ctx.skip("la cuenta aún tiene la contraseña TEMPORAL: cámbiala desde /dev para correr esta parte");
    expect((await supabase.rpc("dev_ping", { p_token: devToken })).data).toBe(true);

    const summary = await supabase.rpc("dev_error_summary", { p_token: devToken });
    expect(summary.error, JSON.stringify(summary.error)).toBeNull();
    expect(summary.data).toEqual(
      expect.objectContaining({
        open_errors: expect.any(Number), open_warnings: expect.any(Number), communities: expect.any(Number),
      })
    );
    expect(Object.keys(summary.data as object)).toContain("last_report_at");
  });

  it("agrupa por comunidad y función, da el detalle, valida rangos y resolver cierra SOLO el grupo pedido", async (ctx) => {
    if (mustChange) ctx.skip("la cuenta aún tiene la contraseña TEMPORAL");

    // Dos reportes iguales (mismo grupo) y uno de otra función (otro grupo) de la misma comunidad de prueba.
    for (const message of ["prueba /dev: sin red 1", "prueba /dev: sin red 2"]) {
      expect((await report(FN_A, message)).error).toBeNull();
    }
    expect((await report(FN_B, "prueba /dev: otra falla")).error).toBeNull();

    const open = await groups();
    expect(open.map((g) => g.fn).sort()).toEqual([FN_A, FN_B].sort());
    const a = open.find((g) => g.fn === FN_A)!;
    expect(a).toEqual(expect.objectContaining({ total: 2, open_count: 2, level: "warning", source: "rpc", code: null }));
    expect(a.last_message).toBe("prueba /dev: sin red 2");

    // Detalle: los 2 reportes, el más nuevo primero, abiertos.
    const detail = await supabase.rpc("dev_error_group_detail", { p_token: devToken, ...key(FN_A), p_limit: 20 });
    expect(detail.error, JSON.stringify(detail.error)).toBeNull();
    const rows = detail.data as { message: string; resolved: boolean }[];
    expect(rows.map((r) => r.message)).toEqual(["prueba /dev: sin red 2", "prueba /dev: sin red 1"]);
    expect(rows.every((r) => !r.resolved)).toBe(true);

    // Rangos inválidos.
    for (const days of [0, 91]) {
      expect((await supabase.rpc("dev_error_groups", { p_token: devToken, p_days: days, p_only_open: true })).error?.message).toContain("Rango inválido");
    }
    for (const limit of [0, 101]) {
      expect((await supabase.rpc("dev_error_group_detail", { p_token: devToken, ...key(FN_A), p_limit: limit })).error?.message).toContain("Rango inválido");
    }

    // Resolver el grupo A cierra 2; repetirlo cierra 0; el grupo B sigue abierto.
    const resolved = await supabase.rpc("dev_resolve_group", { p_token: devToken, ...key(FN_A) });
    expect(resolved.error, JSON.stringify(resolved.error)).toBeNull();
    expect(resolved.data).toBe(2);
    expect((await supabase.rpc("dev_resolve_group", { p_token: devToken, ...key(FN_A) })).data).toBe(0);

    expect((await groups()).map((g) => g.fn)).toEqual([FN_B]);
    const everything = await groups(1, false);
    expect(everything.find((g) => g.fn === FN_A)).toEqual(expect.objectContaining({ total: 2, open_count: 0 }));

    // Un reporte nuevo reabre el grupo.
    expect((await report(FN_A, "prueba /dev: vuelve a fallar")).error).toBeNull();
    const reopened = (await groups()).find((g) => g.fn === FN_A);
    expect(reopened).toEqual(expect.objectContaining({ total: 3, open_count: 1 }));
  });

  it("cerrar sesión invalida el token", async () => {
    const login = await supabase.rpc("dev_login", { p_password: password });
    const own = login.data as Login;
    expect(own?.token).toBeTruthy();
    await supabase.rpc("dev_logout", { p_token: own!.token });
    expect((await supabase.rpc("dev_ping", { p_token: own!.token })).error?.message).toContain("SESION_DEV_INVALIDA");
  });
});
