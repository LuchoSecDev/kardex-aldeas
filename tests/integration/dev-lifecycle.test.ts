import { describe, expect, it } from "vitest";
import { supabase } from "./helpers";

// CICLO COMPLETO de la cuenta del desarrollador (/dev). OPT-IN porque CAMBIA la contraseña de la cuenta real y termina bloqueándola
// 15 minutos (no hay código de recuperación: se restablece con supabase/dev_reset_password.sql):
//
//   1. Antes: corre dev_reset_password.sql (copia local .env.dev-reset.sql) con la contraseña que tengas en DEV_TEST_PASSWORD
//      (.env.local, nunca en git; mínimo 12 caracteres).
//   2. Corre SOLO este archivo (si no, dev-account.test.ts compite por la misma cuenta):
//        $env:RUN_DEV_LIFECYCLE=1; npx vitest run tests/integration/dev-lifecycle.test.ts
//   3. Después: la cuenta queda con otra contraseña y bloqueada. ANTES de usarla, vuelve a correr dev_reset_password.sql con la
//      contraseña temporal real, y bórrala del SQL Editor.
//
// NUNCA la corras sobre la cuenta que ya usas a diario sin avisarte: te cambiaría la contraseña.
const enabled = process.env.RUN_DEV_LIFECYCLE === "1" && !!process.env.DEV_TEST_PASSWORD;

const TEMP = process.env.DEV_TEST_PASSWORD ?? "";
const suffix = Math.random().toString(36).slice(2, 8);
const NEW1 = `Clave-de-prueba-uno-${suffix}`;
const NEW2 = `Clave-de-prueba-dos-${suffix}`;

type Login = { token: string; must_change: boolean } | null;
const login = async (password: string) => {
  const { data, error } = await supabase.rpc("dev_login", { p_password: password });
  return { data: data as Login, error };
};
const change = (token: string, current: string, next: string) =>
  supabase.rpc("dev_change_password", { p_token: token, p_current: current, p_new: next });

// (Las pruebas de un mismo bloque corren en orden; el estado se comparte entre ellas.)
describe.skipIf(!enabled)("ciclo de vida de la cuenta del desarrollador", () => {
  const state = { pending: "", second: "" };

  it("una contraseña incorrecta no entra", async () => {
    const { data, error } = await login("contraseña-incorrecta-123");
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("la contraseña temporal entra y marca que debe cambiarse", async () => {
    const { data } = await login(TEMP);
    expect(data?.must_change).toBe(true);
    state.pending = data!.token;
  });

  it("mientras es temporal, solo se puede cambiar la contraseña (ni ping ni lecturas)", async () => {
    expect((await supabase.rpc("dev_ping", { p_token: state.pending })).error?.message).toContain("DEV_DEBE_CAMBIAR_CLAVE");
    expect((await supabase.rpc("dev_error_summary", { p_token: state.pending })).error?.message).toContain("DEV_DEBE_CAMBIAR_CLAVE");
    expect((await supabase.rpc("dev_error_groups", { p_token: state.pending, p_days: 1, p_only_open: true })).error?.message).toContain("DEV_DEBE_CAMBIAR_CLAVE");
  });

  it("cambiar con la contraseña actual equivocada devuelve ok=false", async () => {
    const { data, error } = await change(state.pending, "no-es-la-actual-123", NEW1);
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false });
  });

  it("una contraseña nueva corta o igual a la actual se rechaza", async () => {
    expect((await change(state.pending, TEMP, "corta")).error?.message).toContain("Contraseña inválida");
    expect((await change(state.pending, TEMP, TEMP)).error?.message).toContain("distinta de la actual");
  });

  it("el cambio correcto deja la sesión usable, y la contraseña temporal deja de servir", async () => {
    const res = await change(state.pending, TEMP, NEW1);
    expect(res.error, JSON.stringify(res.error)).toBeNull();
    expect(res.data).toEqual({ ok: true });
    expect((await supabase.rpc("dev_ping", { p_token: state.pending })).data).toBe(true);

    expect((await login(TEMP)).data).toBeNull();
    const entered = await login(NEW1);
    expect(entered.data?.must_change).toBe(false);
    state.second = entered.data!.token;
  });

  it("cambiar la contraseña cierra las demás sesiones", async () => {
    expect((await change(state.second, NEW1, NEW2)).data).toEqual({ ok: true });
    expect((await supabase.rpc("dev_ping", { p_token: state.second })).data).toBe(true);
    expect((await supabase.rpc("dev_ping", { p_token: state.pending })).error?.message).toContain("SESION_DEV_INVALIDA");
  });

  it("5 contraseñas incorrectas bloquean la cuenta, incluso para la contraseña correcta", async () => {
    for (let i = 0; i < 5; i++) expect((await login("contraseña-incorrecta-123")).data).toBeNull();
    const blocked = await login(NEW2);
    expect(blocked.error?.message).toContain("DEV_BLOQUEADO");
    expect(blocked.data).toBeNull();
  });
});
