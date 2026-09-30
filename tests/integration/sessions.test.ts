import { describe, expect, it } from "vitest";
import { TEST_PIN, createTestCommunity, supabase, uniqueName } from "./helpers";

describe("PIN y sesiones", () => {
  it("login a una comunidad que no existe devuelve null", async () => {
    const { data, error } = await supabase.rpc("login_community", { p_name: uniqueName("nope"), p_pin: "0000" });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("crear comunidad con PIN y entrar entrega un token de 64 caracteres", async () => {
    const { token } = await createTestCommunity("login");
    expect(token).toHaveLength(64);
  });

  it("un PIN incorrecto devuelve null (sin token)", async () => {
    const { name } = await createTestCommunity("badpin");
    const { data, error } = await supabase.rpc("login_community", { p_name: name, p_pin: "0000" });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("una comunidad con PIN no entra sin PIN", async () => {
    const { name } = await createTestCommunity("nopin");
    const { data } = await supabase.rpc("login_community", { p_name: name, p_pin: null });
    expect(data).toBeNull();
  });

  it("Maná (comunidad real con PIN) no entra sin PIN", async () => {
    // Solo lectura: con p_pin nulo no se cuenta como intento fallido.
    const { data } = await supabase.rpc("login_community", { p_name: "Maná", p_pin: null });
    expect(data).toBeNull();
  });

  it("rechaza un PIN que no sean 4 dígitos", async () => {
    const { error } = await supabase.rpc("create_community_with_pin", { p_name: uniqueName("badfmt"), p_pin: "12a4" });
    expect(error?.message).toContain("PIN inválido");
  });

  it("rechaza nombres de comunidad demasiado cortos", async () => {
    const { error } = await supabase.rpc("create_community_with_pin", { p_name: "x", p_pin: TEST_PIN });
    expect(error?.message).toContain("Nombre de comunidad inválido");
  });

  it("crear una comunidad que ya existe devuelve false y no cambia su PIN", async () => {
    const { name } = await createTestCommunity("dup");
    const again = await supabase.rpc("create_community_with_pin", { p_name: name, p_pin: "9999" });
    expect(again.data).toBe(false);
    const login = await supabase.rpc("login_community", { p_name: name, p_pin: TEST_PIN });
    expect(typeof login.data).toBe("string");
  });

  it("sin token o con token falso, los datos responden SESION_INVALIDA", async () => {
    for (const token of [null, "", "token-falso"]) {
      const { error } = await supabase.rpc("kardex_load_month", { p_token: token, p_year: 2026, p_month: 8 });
      expect(error?.message).toContain("SESION_INVALIDA");
    }
  });

  it("cerrar sesión invalida el token", async () => {
    const { token } = await createTestCommunity("logout");
    const before = await supabase.rpc("kardex_months_with_data", { p_token: token });
    expect(before.error).toBeNull();

    await supabase.rpc("logout_community", { p_token: token });

    const after = await supabase.rpc("kardex_months_with_data", { p_token: token });
    expect(after.error?.message).toContain("SESION_INVALIDA");
  });

  it("la función interna _session_community no se puede llamar desde afuera", async () => {
    const { token } = await createTestCommunity("internal");
    const { data, error } = await supabase.rpc("_session_community", { p_token: token });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("los datos de una sesión no aceptan indicar otra comunidad", async () => {
    const { token } = await createTestCommunity("nocomm");
    const { error } = await supabase.rpc("kardex_load_month", {
      p_token: token,
      p_year: 2026,
      p_month: 8,
      p_community: "Maná",
    });
    expect(error).not.toBeNull();
  });
});
