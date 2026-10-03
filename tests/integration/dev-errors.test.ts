import { describe, expect, it } from "vitest";
import { createTestCommunity, supabase } from "./helpers";

// Registro de errores del navegador (plan 007, Fase A) contra la base real. Requiere haber corrido supabase/dev_errors_1.sql.
// Escribe solo con comunidades ZZZ_TEST_BORRAR_AUTO_* (sus filas se borran con supabase/cleanup_test_data.sql).
//
// La tabla está cerrada al acceso directo, así que desde aquí no se puede leer lo guardado: se prueba lo que SÍ se puede
// observar con la anon key (que acepta, que rechaza y que no deja leer). El detalle fino —qué fila queda, los topes, el
// tapado de tokens y la limpieza— se prueba en tests/db/dev_errors.test.sql contra un Postgres local.
const report = (token: string | null, extra: Record<string, unknown> = {}) =>
  supabase.rpc("dev_report_client_error", {
    p_token: token, p_source: "rpc", p_level: "warning", p_fn: "kardex_save_product", p_code: null,
    p_message: "prueba automática: sin red", p_version: "test", ...extra,
  });

describe("registro de errores: acceso", () => {
  it("la función existe y acepta un reporte de una comunidad con sesión", async () => {
    const { token } = await createTestCommunity("err-ok");
    const res = await report(token);
    expect(res.error, JSON.stringify(res.error)).toBeNull();
  });

  it("un token falso, vacío o nulo se rechaza con SESION_INVALIDA", async () => {
    for (const token of ["", "token-falso", null]) {
      expect((await report(token)).error?.message).toContain("SESION_INVALIDA");
    }
  });

  it("source, level o función inválidos se rechazan", async () => {
    const { token } = await createTestCommunity("err-valida");
    expect((await report(token, { p_source: "otro" })).error?.message).toContain("Reporte inválido");
    expect((await report(token, { p_level: "critical" })).error?.message).toContain("Reporte inválido");
    expect((await report(token, { p_fn: "a b" })).error?.message).toContain("Reporte inválido");
  });

  it("el texto raro no rompe el reporte: mensaje enorme, código y versión inválidos se limpian", async () => {
    const { token } = await createTestCommunity("err-texto");
    const res = await report(token, { p_message: "x ".repeat(500), p_code: "a b", p_version: "v 1!" });
    expect(res.error, JSON.stringify(res.error)).toBeNull();
  });

  it("la tabla de errores está cerrada: no se lee, no se escribe y no se borra desde la app (permiso denegado, no «no existe»)", async () => {
    // 42501 = permission denied. Exigir ESE código evita que la prueba pase por otra razón (p. ej. la tabla aún no existe).
    expect((await supabase.from("system_error_logs").select("*").limit(1)).error?.code).toBe("42501");
    const insert = await supabase.from("system_error_logs").insert({
      community: "x", source: "rpc", level: "error", fn: "f", message: "m", app_version: "v",
    });
    expect(insert.error?.code).toBe("42501");
    expect((await supabase.from("system_error_logs").delete().eq("community", "x")).error?.code).toBe("42501");
  });
});
