import { describe, expect, it } from "vitest";
import { createTestCommunity, supabase } from "./helpers";

// Pruebas SIN riesgo para la cuenta real de la nutricionista: no intentan
// entrar con contraseñas (eso sumaría intentos fallidos y podría bloquearla).
// El ciclo completo (login, cambio, recuperación, bloqueo) está en
// admin-lifecycle.test.ts y es opt-in.
describe("acceso de administradora: lo que no debe permitirse", () => {
  it("sin token o con token falso, las funciones de admin responden SESION_ADMIN_INVALIDA", async () => {
    for (const token of [null, "", "token-falso"]) {
      const ping = await supabase.rpc("admin_ping", { p_token: token });
      expect(ping.error?.message, `ping ${String(token)}`).toContain("SESION_ADMIN_INVALIDA");

      const change = await supabase.rpc("admin_change_password", {
        p_token: token,
        p_current: "x",
        p_new: "una-contraseña-larga-123",
      });
      expect(change.error?.message, `change ${String(token)}`).toContain("SESION_ADMIN_INVALIDA");
    }
  });

  it("un token de COMUNIDAD no sirve como token de administradora", async () => {
    const { token } = await createTestCommunity("adminx");
    const { error } = await supabase.rpc("admin_ping", { p_token: token });
    expect(error?.message).toContain("SESION_ADMIN_INVALIDA");
  });

  it("cerrar sesión con un token inexistente no falla ni revela nada", async () => {
    const { error } = await supabase.rpc("admin_logout", { p_token: "token-falso" });
    expect(error).toBeNull();
  });

  it("las funciones internas de administradora no se pueden llamar desde afuera", async () => {
    const calls = [
      supabase.rpc("_admin_session", { p_token: "x", p_allow_pending: true }),
      supabase.rpc("_admin_register_failure"),
      supabase.rpc("_admin_assert_not_locked"),
      supabase.rpc("_admin_new_recovery_code"),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result.error).not.toBeNull();
    }
  });

  it("las tablas de la cuenta y las sesiones no son legibles ni escribibles", async () => {
    for (const table of ["admin_account", "admin_sessions"]) {
      const read = await supabase.from(table).select("*").limit(1);
      expect(read.error, `${table} select`).not.toBeNull();
      expect(read.data, `${table} select`).toBeNull();
    }
    const insert = await supabase.from("admin_account").insert({ id: 2, password_hash: "x" });
    expect(insert.error).not.toBeNull();
    const update = await supabase.from("admin_account").update({ must_change: false }).eq("id", 1);
    expect(update.error).not.toBeNull();
  });
});
