import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestCommunity, supabase } from "./helpers";

// Respuestas de la nutricionista a los cambios de la lista de mercado (plan 008, Fase D) contra la base real. Requiere haber
// corrido supabase/market_replies_1..4.sql. Escribe solo en comunidades ZZZ_TEST_BORRAR_AUTO_*. La semana es del futuro lejano
// (2099-05-04 es lunes): el plazo nunca está vencido.
//
// El detalle fino se prueba en tests/db/market_replies.test.sql contra un Postgres local. Las pruebas de seguridad corren
// siempre; las que necesitan sesión de administradora son opt-in y solo inician sesión (ver admin-market.test.ts):
//   $env:ADMIN_LOGIN_PASSWORD = "<contraseña actual>"; npm run test:integration
const WEEK = "2099-05-04";
const password = process.env.ADMIN_LOGIN_PASSWORD;

const unseen = (token: string) => supabase.rpc("market_replies_unseen", { p_token: token });
const markSeen = (token: string, kind?: string) =>
  supabase.rpc("market_replies_mark_seen", { p_token: token, p_week_start: WEEK, ...(kind ? { p_kind: kind } : {}) });
const load = (token: string) => supabase.rpc("market_list_load", { p_token: token, p_week_start: WEEK });

describe("respuestas a los cambios: acceso", () => {
  it("un token falso o vacío se rechaza en las funciones de la comunidad", async () => {
    for (const token of ["", "token-falso"]) {
      expect((await unseen(token)).error?.message).toContain("SESION_INVALIDA");
      expect((await markSeen(token)).error?.message).toContain("SESION_INVALIDA");
    }
  });

  it("la tabla de respuestas está cerrada y un token de COMUNIDAD no sirve para responder", async () => {
    expect((await supabase.from("market_change_replies").select("*").limit(1)).error).not.toBeNull();
    const { token } = await createTestCommunity("rep-acceso");
    const res = await supabase.rpc("admin_market_reply", {
      p_token: token, p_community: "ZZZ_TEST_x", p_week_start: WEEK, p_kind: "carnes", p_change_id: "n1", p_text: "hola",
    });
    expect(res.error?.message).toContain("SESION_ADMIN_INVALIDA");
  });

  it("una comunidad sin respuestas ve la campanita vacía, y marcar leídas no falla", async () => {
    const { token } = await createTestCommunity("rep-vacia");
    const res = await unseen(token);
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
    expect((await markSeen(token, "carnes")).error).toBeNull();
    const week = await load(token);
    expect(week.error).toBeNull();
  });
});

describe.skipIf(!password)("respuestas a los cambios: flujo completo con sesión de administradora", () => {
  let adminToken = "";

  beforeAll(async () => {
    const login = await supabase.rpc("admin_login", { p_password: password });
    if (login.error || !login.data) {
      throw new Error("No se pudo iniciar sesión de administradora: revisa ADMIN_LOGIN_PASSWORD (¿vigente y sin bloqueo?).");
    }
    if (login.data.must_change) throw new Error("La cuenta aún tiene la contraseña TEMPORAL: cámbiala desde /admin.");
    adminToken = login.data.token as string;
  });

  afterAll(async () => {
    if (adminToken) await supabase.rpc("admin_logout", { p_token: adminToken });
  });

  const reply = (community: string, kind: string, changeId: string, text: string) =>
    supabase.rpc("admin_market_reply", { p_token: adminToken, p_community: community, p_week_start: WEEK, p_kind: kind, p_change_id: changeId, p_text: text });

  it("responde a una nota enviada: la comunidad la ve, la campanita la cuenta y se marca leída", async () => {
    const c = await createTestCommunity("rep-flujo");
    await supabase.rpc("market_set_participants", { p_token: c.token, p_participants: 6 });
    const catalog = await supabase.rpc("market_catalog", { p_token: c.token });
    const item = (catalog.data as { id: string; kind: string }[]).find((i) => i.kind === "carnes")!.id;
    await supabase.rpc("market_list_save", { p_token: c.token, p_week_start: WEEK, p_kind: "carnes", p_quantities: { [item]: 1 } });
    await supabase.rpc("market_list_save_changes", {
      p_token: c.token, p_week_start: WEEK, p_kind: "carnes", p_changes: [{ id: "n1", item_id: item, text: "Pescado por pechuga" }],
    });
    expect((await supabase.rpc("market_list_submit", { p_token: c.token, p_week_start: WEEK })).error).toBeNull();

    expect((await reply(c.name, "carnes", "no-existe", "x")).error?.message).toContain("Cambio no encontrado");
    expect((await reply(c.name, "carnes", "n1", "Se envía pechuga")).error).toBeNull();

    const week = await load(c.token);
    const carnes = week.data.lists.find((l: { kind: string }) => l.kind === "carnes");
    expect(carnes.replies).toEqual([expect.objectContaining({ change_id: "n1", text: "Se envía pechuga", change_text: "Pescado por pechuga", seen: false })]);

    const pending = await unseen(c.token);
    expect(pending.data).toHaveLength(1);
    expect(pending.data[0]).toMatchObject({ change_id: "n1", kind: "carnes", reply_text: "Se envía pechuga" });

    const detail = await supabase.rpc("admin_market_list", { p_token: adminToken, p_community: c.name, p_week_start: WEEK });
    const note = detail.data.lists.find((l: { kind: string }) => l.kind === "carnes").changes[0];
    expect(note.reply.text).toBe("Se envía pechuga");

    expect((await markSeen(c.token, "fruver")).error).toBeNull(); // otro tipo: no toca esta
    expect((await unseen(c.token)).data).toHaveLength(1);
    expect((await markSeen(c.token, "carnes")).error).toBeNull();
    expect((await unseen(c.token)).data).toEqual([]);

    // Un texto vacío quita la respuesta.
    expect((await reply(c.name, "carnes", "n1", "  ")).error).toBeNull();
    const after = await load(c.token);
    expect(after.data.lists.find((l: { kind: string }) => l.kind === "carnes").replies).toEqual([]);
  });
});
