import { describe, expect, it } from "vitest";
import { supabase } from "./helpers";

// CICLO COMPLETO de la cuenta de administradora. OPT-IN porque CAMBIA la
// contraseña de la cuenta real y termina bloqueándola 15 minutos:
//
//   1. Antes: corre supabase/admin_reset_password.sql con la contraseña que
//      tengas en ADMIN_TEST_PASSWORD (.env.local, nunca en git).
//   2. Corre:  $env:RUN_ADMIN_LIFECYCLE=1; npm run test:integration
//   3. Después: la cuenta queda con otra contraseña y bloqueada. ANTES de
//      entregarla a la nutricionista, vuelve a correr admin_reset_password.sql
//      con la contraseña temporal que le vas a dar.
//
// NUNCA la corras después de haber entregado la cuenta a la nutricionista sin
// avisarle: le cambiaría la contraseña.
const enabled = process.env.RUN_ADMIN_LIFECYCLE === "1" && !!process.env.ADMIN_TEST_PASSWORD;

const TEMP = process.env.ADMIN_TEST_PASSWORD ?? "";
const suffix = Math.random().toString(36).slice(2, 8);
const NEW1 = `Clave-de-prueba-uno-${suffix}`;
const NEW2 = `Clave-de-prueba-dos-${suffix}`;
const NEW3 = `Clave-de-prueba-tres-${suffix}`;

type Login = { token: string; must_change: boolean } | null;
const login = async (password: string) => {
  const { data, error } = await supabase.rpc("admin_login", { p_password: password });
  return { data: data as Login, error };
};

// (Las pruebas de un mismo bloque corren en orden; el estado se comparte entre ellas.)
describe.skipIf(!enabled)("ciclo de vida de la cuenta de administradora", () => {
  const state: { pendingToken: string; tokenB: string; recoveryCode: string; newCode: string } = {
    pendingToken: "",
    tokenB: "",
    recoveryCode: "",
    newCode: "",
  };

  it("una contraseña incorrecta no entra", async () => {
    const { data, error } = await login("contraseña-incorrecta-123");
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("la contraseña temporal entra y marca que debe cambiarse", async () => {
    const { data } = await login(TEMP);
    expect(data?.must_change).toBe(true);
    state.pendingToken = data!.token;
  });

  it("mientras es temporal, solo se puede cambiar la contraseña", async () => {
    const { error } = await supabase.rpc("admin_ping", { p_token: state.pendingToken });
    expect(error?.message).toContain("DEBE_CAMBIAR_CLAVE");
  });

  it("cambiar con la contraseña actual equivocada devuelve ok=false", async () => {
    const { data, error } = await supabase.rpc("admin_change_password", {
      p_token: state.pendingToken,
      p_current: "no-es-la-actual-123",
      p_new: NEW1,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false, recovery_code: null });
  });

  it("rechaza una contraseña nueva demasiado corta", async () => {
    const { error } = await supabase.rpc("admin_change_password", {
      p_token: state.pendingToken,
      p_current: TEMP,
      p_new: "corta",
    });
    expect(error?.message).toContain("Contraseña inválida");
  });

  it("rechaza una contraseña nueva igual a la actual", async () => {
    const { error } = await supabase.rpc("admin_change_password", {
      p_token: state.pendingToken,
      p_current: TEMP,
      p_new: TEMP,
    });
    expect(error?.message).toContain("distinta");
  });

  it("el primer cambio funciona y entrega el código de recuperación (20 caracteres)", async () => {
    const { data, error } = await supabase.rpc("admin_change_password", {
      p_token: state.pendingToken,
      p_current: TEMP,
      p_new: NEW1,
    });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.recovery_code).toMatch(/^[0-9A-F]{20}$/);
    state.recoveryCode = data.recovery_code;
  });

  it("tras el cambio la sesión ya puede usarse", async () => {
    const { data, error } = await supabase.rpc("admin_ping", { p_token: state.pendingToken });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("la contraseña temporal ya no entra; la nueva sí y ya no pide cambio", async () => {
    expect((await login(TEMP)).data).toBeNull();
    const { data } = await login(NEW1);
    expect(data?.must_change).toBe(false);
    state.tokenB = data!.token;
  });

  it("un token de administradora no sirve para leer datos de comunidades", async () => {
    const { error } = await supabase.rpc("kardex_load_month", { p_token: state.tokenB, p_year: 2026, p_month: 8 });
    expect(error?.message).toContain("SESION_INVALIDA");
  });

  it("el cambio voluntario pide la contraseña actual, no rota el código y cierra las demás sesiones", async () => {
    const { data, error } = await supabase.rpc("admin_change_password", {
      p_token: state.tokenB,
      p_current: NEW1,
      p_new: NEW2,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: true, recovery_code: null });

    const old = await supabase.rpc("admin_ping", { p_token: state.pendingToken });
    expect(old.error?.message).toContain("SESION_ADMIN_INVALIDA");
    const current = await supabase.rpc("admin_ping", { p_token: state.tokenB });
    expect(current.error).toBeNull();
  });

  it("recuperar con un código equivocado devuelve ok=false", async () => {
    const { data, error } = await supabase.rpc("admin_recover_password", { p_code: "0".repeat(20), p_new: NEW3 });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false, recovery_code: null });
  });

  it("recuperar con el código correcto pero una contraseña corta falla sin gastar el código", async () => {
    const { error } = await supabase.rpc("admin_recover_password", { p_code: state.recoveryCode, p_new: "corta" });
    expect(error?.message).toContain("Contraseña inválida");
  });

  it("recuperar con el código correcto cambia la contraseña, cierra sesiones y entrega un código nuevo", async () => {
    // El código se acepta sin importar mayúsculas/espacios.
    const { data, error } = await supabase.rpc("admin_recover_password", {
      p_code: ` ${state.recoveryCode.toLowerCase()} `,
      p_new: NEW3,
    });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.recovery_code).toMatch(/^[0-9A-F]{20}$/);
    expect(data.recovery_code).not.toBe(state.recoveryCode);
    state.newCode = data.recovery_code;

    const oldSession = await supabase.rpc("admin_ping", { p_token: state.tokenB });
    expect(oldSession.error?.message).toContain("SESION_ADMIN_INVALIDA");
  });

  it("el código de recuperación es de un solo uso", async () => {
    const { data } = await supabase.rpc("admin_recover_password", { p_code: state.recoveryCode, p_new: NEW1 });
    expect(data.ok).toBe(false);
  });

  it("después de recuperar, entra con la contraseña nueva y no con las anteriores", async () => {
    expect((await login(NEW2)).data).toBeNull();
    expect((await login(NEW3)).data?.must_change).toBe(false);
  });

  it("5 intentos fallidos bloquean la cuenta, incluso con la contraseña correcta", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data, error } = await login("contraseña-incorrecta-123");
      expect(error, `intento ${attempt}`).toBeNull();
      expect(data, `intento ${attempt}`).toBeNull();
    }
    const sixth = await login("contraseña-incorrecta-123");
    expect(sixth.error?.message).toContain("ADMIN_BLOQUEADO");

    const correct = await login(NEW3);
    expect(correct.error?.message).toContain("ADMIN_BLOQUEADO");
  });
});
