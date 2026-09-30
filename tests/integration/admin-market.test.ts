import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestCommunity, supabase } from "./helpers";

// Listas de mercado en el panel de la nutricionista (plan 003, Fase C). Requiere haber corrido
// supabase/market_admin_1..3.sql. Escribe solo en comunidades ZZZ_TEST_BORRAR_AUTO_*.
//
// Las pruebas de seguridad corren siempre. Las que necesitan una sesión de administradora son
// opt-in y NO modifican la cuenta (solo inician sesión), con la contraseña VIGENTE:
//
//   $env:ADMIN_LOGIN_PASSWORD = "<contraseña actual>"; npm run test:integration
//
// Una contraseña equivocada suma un intento fallido (5 bloquean la cuenta 15 min), por eso se
// inicia sesión una sola vez y se para si falla.
const password = process.env.ADMIN_LOGIN_PASSWORD;

// Lunes de una semana lejana (2099-03-02 es lunes): el plazo nunca está vencido.
const WEEK = "2099-03-02";

describe("listas de mercado (nutricionista): acceso", () => {
  const calls = (token: string, community = "ZZZ_TEST_no_existe") => [
    supabase.rpc("admin_market_overview", { p_token: token, p_week_start: WEEK }),
    supabase.rpc("admin_market_list", { p_token: token, p_community: community, p_week_start: WEEK }),
    supabase.rpc("admin_market_mark_reviewed", { p_token: token, p_community: community, p_week_start: WEEK }),
    supabase.rpc("admin_market_notifications", { p_token: token }),
  ];

  it("sin token o con token falso, todas responden SESION_ADMIN_INVALIDA", async () => {
    for (const result of await Promise.all(calls("token-falso"))) {
      expect(result.error?.message).toContain("SESION_ADMIN_INVALIDA");
    }
  });

  it("un token de COMUNIDAD no sirve como token de administradora", async () => {
    const { token } = await createTestCommunity("admmktcom");
    for (const result of await Promise.all(calls(token))) {
      expect(result.error?.message).toContain("SESION_ADMIN_INVALIDA");
    }
  });
});

describe.skipIf(!password)("listas de mercado (nutricionista): con sesión de administradora", () => {
  let adminToken = "";
  const a = { name: "", token: "" };
  const b = { name: "", token: "" };

  const overviewRow = async (community: string, week = WEEK) => {
    const { data, error } = await supabase.rpc("admin_market_overview", { p_token: adminToken, p_week_start: week });
    expect(error).toBeNull();
    return (data.communities as { community: string }[]).find((r) => r.community === community) as Record<string, unknown>;
  };

  beforeAll(async () => {
    const login = await supabase.rpc("admin_login", { p_password: password });
    if (login.error || !login.data) {
      throw new Error("No se pudo iniciar sesión de administradora: revisa ADMIN_LOGIN_PASSWORD (¿vigente y sin bloqueo?).");
    }
    if (login.data.must_change) {
      throw new Error("La cuenta aún tiene la contraseña TEMPORAL: cámbiala desde /admin antes de correr esta prueba.");
    }
    adminToken = login.data.token;

    // A envía fruver y carnes; B solo guarda un borrador.
    Object.assign(a, await createTestCommunity("admmktA"));
    Object.assign(b, await createTestCommunity("admmktB"));
    await supabase.rpc("market_set_participants", { p_token: a.token, p_participants: 11 });
    await supabase.rpc("market_set_participants", { p_token: b.token, p_participants: 9 });
    await supabase.rpc("market_list_save", { p_token: a.token, p_week_start: WEEK, p_kind: "fruver", p_quantities: { mf3: 4, mf1: 2.5 } });
    await supabase.rpc("market_list_save", { p_token: a.token, p_week_start: WEEK, p_kind: "carnes", p_quantities: { mc1: 12 } });
    expect((await supabase.rpc("market_list_submit", { p_token: a.token, p_week_start: WEEK })).error).toBeNull();
    await supabase.rpc("market_list_save", { p_token: b.token, p_week_start: WEEK, p_kind: "aseo", p_quantities: { ms1: 1 } });
  });

  afterAll(async () => {
    if (adminToken) await supabase.rpc("admin_logout", { p_token: adminToken });
  });

  it("el resumen muestra lo ENVIADO de A y que B solo tiene un borrador", async () => {
    const ra = await overviewRow(a.name);
    expect(ra).toMatchObject({ sent: true, late: false, reviewed: false, has_unsent_changes: false, participants: 11, submit_count: 1 });
    expect(ra.counts).toEqual({ fruver: 2, carnes: 1, abarrotes: 0, aseo: 0 });

    const rb = await overviewRow(b.name);
    expect(rb).toMatchObject({ sent: false, has_draft: true });
    expect(rb.counts).toEqual({ fruver: 0, carnes: 0, abarrotes: 0, aseo: 0 });
  });

  it("el detalle trae solo lo pedido, en el orden del catálogo, con nombre, unidad y cantidad, sin precios", async () => {
    const { data, error } = await supabase.rpc("admin_market_list", { p_token: adminToken, p_community: a.name, p_week_start: WEEK });
    expect(error).toBeNull();
    expect(data.sent).toBe(true);
    expect(data.lists.map((l: { kind: string }) => l.kind)).toEqual(["fruver", "carnes", "abarrotes", "aseo"]);
    const fruver = data.lists[0].items;
    expect(fruver.map((i: { id: string }) => i.id)).toEqual(["mf1", "mf3"]);
    expect(fruver[0]).toMatchObject({ name: "ACELGA", unit: "KG", quantity: 2.5 });
    expect(Object.keys(fruver[0]).sort()).toEqual(["id", "is_event", "name", "quantity", "unit"]);
    expect(data.lists[2].items).toEqual([]);
  });

  it("editar después de enviar no cambia lo que ve la nutricionista, pero lo avisa", async () => {
    await supabase.rpc("market_list_save", { p_token: a.token, p_week_start: WEEK, p_kind: "carnes", p_quantities: { mc1: 24, mc2: 6 } });
    const ra = await overviewRow(a.name);
    expect(ra.has_unsent_changes).toBe(true);
    expect((ra.counts as Record<string, number>).carnes).toBe(1);
    await supabase.rpc("market_list_save", { p_token: a.token, p_week_start: WEEK, p_kind: "carnes", p_quantities: { mc1: 12 } });
  });

  it("revisar la saca de la campanita; reenviar con cambios la devuelve", async () => {
    const pending = async () => {
      const { data, error } = await supabase.rpc("admin_market_notifications", { p_token: adminToken });
      expect(error).toBeNull();
      return (data as { community: string; week_start: string }[]).some((n) => n.community === a.name && n.week_start === WEEK);
    };
    expect(await pending()).toBe(true);

    expect((await supabase.rpc("admin_market_mark_reviewed", { p_token: adminToken, p_community: a.name, p_week_start: WEEK })).error).toBeNull();
    expect(await pending()).toBe(false);
    expect((await overviewRow(a.name)).reviewed).toBe(true);

    await supabase.rpc("market_list_save", { p_token: a.token, p_week_start: WEEK, p_kind: "carnes", p_quantities: { mc1: 30 } });
    await supabase.rpc("market_list_submit", { p_token: a.token, p_week_start: WEEK });
    expect(await pending()).toBe(true);
    expect((await overviewRow(a.name)).reviewed).toBe(false);
  });

  it("no se puede revisar lo que no se envió, ni una comunidad que no existe", async () => {
    const notSent = await supabase.rpc("admin_market_mark_reviewed", { p_token: adminToken, p_community: b.name, p_week_start: WEEK });
    expect(notSent.error?.message).toContain("Envío no encontrado");
    const missing = await supabase.rpc("admin_market_list", { p_token: adminToken, p_community: "ZZZ_TEST_no_existe", p_week_start: WEEK });
    expect(missing.error?.message).toContain("Comunidad no encontrada");
  });

  it("rechaza semanas que no son lunes", async () => {
    const { error } = await supabase.rpc("admin_market_overview", { p_token: adminToken, p_week_start: "2099-03-03" });
    expect(error?.message).toContain("Semana inválida");
  });
});
