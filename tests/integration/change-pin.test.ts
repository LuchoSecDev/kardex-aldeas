import { describe, expect, it } from "vitest";
import { createTestCommunity, supabase, TEST_PIN } from "./helpers";

// Plan 006: la comunidad cambia su propio PIN. Necesita haber corrido supabase/change_pin.sql.
// Solo usa comunidades ZZZ_TEST_BORRAR_AUTO_* (los PIN equivocados bloquean la comunidad de prueba, nunca una real).
const change = (token: string, current: string, next: string) =>
  supabase.rpc("change_community_pin", { p_token: token, p_current_pin: current, p_new_pin: next });
const login = (name: string, pin: string | null) => supabase.rpc("login_community", { p_name: name, p_pin: pin });

describe("Cambiar PIN", () => {
  it("con el PIN actual correcto cambia el PIN: el nuevo entra y el anterior ya no", async () => {
    const { name, token } = await createTestCommunity("pin-ok");
    const res = await change(token, TEST_PIN, "8520");
    expect(res.error).toBeNull();
    expect(res.data).toBe(true);

    expect(typeof (await login(name, "8520")).data).toBe("string");
    expect((await login(name, TEST_PIN)).data).toBeNull();
  });

  it("un PIN actual equivocado devuelve false y no cambia nada", async () => {
    const { name, token } = await createTestCommunity("pin-mal");
    const res = await change(token, "1111", "8520");
    expect(res.error).toBeNull();
    expect(res.data).toBe(false);
    expect(typeof (await login(name, TEST_PIN)).data).toBe("string");
  });

  it("rechaza PIN débiles, iguales al actual y con formato inválido", async () => {
    const { token } = await createTestCommunity("pin-reglas");
    expect((await change(token, TEST_PIN, "0000")).error?.message).toContain("PIN_DEBIL");
    expect((await change(token, TEST_PIN, "1234")).error?.message).toContain("PIN_DEBIL");
    expect((await change(token, TEST_PIN, TEST_PIN)).error?.message).toContain("PIN_IGUAL");
    expect((await change(token, TEST_PIN, "85a0")).error?.message).toContain("PIN inválido");
    expect((await change(token, TEST_PIN, "852")).error?.message).toContain("PIN inválido");
  });

  it("sin token o con token falso responde SESION_INVALIDA", async () => {
    for (const token of ["", "token-falso"]) {
      expect((await change(token, TEST_PIN, "8520")).error?.message).toContain("SESION_INVALIDA");
    }
  });

  it("cambiar el PIN cierra las demás sesiones de la comunidad, pero no la que lo cambió", async () => {
    const { name, token } = await createTestCommunity("pin-sesiones");
    const otra = (await login(name, TEST_PIN)).data as string;
    expect(typeof otra).toBe("string");

    expect((await change(token, TEST_PIN, "8520")).data).toBe(true);

    expect((await supabase.rpc("kardex_months_with_data", { p_token: token })).error).toBeNull();
    expect((await supabase.rpc("kardex_months_with_data", { p_token: otra })).error?.message).toContain("SESION_INVALIDA");
  });

  it("cinco PIN actuales equivocados bloquean la comunidad 15 minutos, también para cambiar el PIN", async () => {
    const { token } = await createTestCommunity("pin-bloqueo");
    for (let i = 0; i < 5; i++) expect((await change(token, "1111", "8520")).data).toBe(false);
    expect((await change(token, TEST_PIN, "8520")).error?.message).toContain("PIN_BLOQUEADO");
  });

  it("pin_changed_at y la función interna no se pueden leer ni llamar desde internet", async () => {
    expect((await supabase.from("communities").select("pin_changed_at")).error).not.toBeNull();
    expect((await supabase.rpc("_pin_is_weak", { p: "0000" })).error).not.toBeNull();
  });
});
