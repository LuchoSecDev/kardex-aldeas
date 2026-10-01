import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestCommunity, supabase } from "./helpers";

// Zona de cambios de la lista de mercado (plan 008, Fase A) contra la base real. Requiere haber corrido
// supabase/market_changes_1..6.sql. Escribe solo en comunidades ZZZ_TEST_BORRAR_AUTO_*. La semana es del
// futuro lejano (2099-04-06 es lunes): el plazo nunca está vencido.
//
// El detalle fino (límites, fechas, «modificada», plazos) se prueba en tests/db/market_changes.test.sql contra un
// Postgres local. Las pruebas que necesitan sesión de administradora son opt-in y solo inician sesión (ver
// admin-market.test.ts): $env:ADMIN_LOGIN_PASSWORD = "<contraseña actual>"; npm run test:integration
const WEEK = "2099-04-06";
const password = process.env.ADMIN_LOGIN_PASSWORD;

type Note = { id: string; item_id: string | null; text: string; at?: string };

const saveChanges = (token: string, kind: string, changes: unknown, week = WEEK) =>
  supabase.rpc("market_list_save_changes", { p_token: token, p_week_start: week, p_kind: kind, p_changes: changes });
const load = (token: string, week = WEEK) => supabase.rpc("market_list_load", { p_token: token, p_week_start: week });
const listOf = async (token: string, kind: string) => {
  const { data, error } = await load(token);
  expect(error).toBeNull();
  return (data.lists as { kind: string; changes: Note[]; modified: boolean }[]).find((l) => l.kind === kind);
};
const carneId = async (token: string) => {
  const { data, error } = await supabase.rpc("market_catalog", { p_token: token });
  expect(error).toBeNull();
  return (data as { id: string; kind: string }[]).find((i) => i.kind === "carnes")!.id;
};

describe("zona de cambios: acceso", () => {
  it("un token falso o vacío se rechaza", async () => {
    for (const token of ["", "token-falso"]) {
      expect((await saveChanges(token, "carnes", [])).error?.message).toContain("SESION_INVALIDA");
    }
  });

  it("las notas no se pueden leer directo de la tabla ni llamar a la función interna", async () => {
    expect((await supabase.from("market_lists").select("changes").limit(1)).error).not.toBeNull();
    expect((await supabase.rpc("_market_clean_changes", { p_kind: "carnes", p_changes: [], p_current: [] })).error).not.toBeNull();
  });
});

describe("zona de cambios: la comunidad guarda sus notas", () => {
  it("guarda, limpia el texto y conserva el producto; otra comunidad no las ve", async () => {
    const a = await createTestCommunity("chg-a");
    const b = await createTestCommunity("chg-b");
    const item = await carneId(a.token);

    const saved = await saveChanges(a.token, "carnes", [
      { id: "c1", item_id: item, text: "  Cambiar   pescado\npor pechuga " },
      { id: "c2", item_id: null, text: "Entregar temprano" },
    ]);
    expect(saved.error).toBeNull();

    const list = await listOf(a.token, "carnes");
    expect(list?.changes.map((n) => n.text)).toEqual(["Cambiar pescado por pechuga", "Entregar temprano"]);
    expect(list?.changes[0].item_id).toBe(item);
    expect(list?.changes[1].item_id).toBeNull();
    expect(list?.changes[0].at).toMatch(/^20\d\d-\d\d-\d\dT[\d:]{8}Z$/);

    expect(await listOf(b.token, "carnes")).toBeUndefined();
  });

  it("rechaza más de 20 notas, ids repetidos, textos vacíos o largos y productos de otro tipo", async () => {
    const { token } = await createTestCommunity("chg-reglas");
    const notes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, item_id: null, text: `nota ${i}` }));

    expect((await saveChanges(token, "carnes", notes(20))).error).toBeNull();
    expect((await saveChanges(token, "carnes", notes(21))).error?.message).toContain("DEMASIADOS_CAMBIOS");
    expect((await saveChanges(token, "carnes", [{ id: "x", text: "a" }, { id: "x", text: "b" }])).error?.message).toContain("Cambios inválidos");
    expect((await saveChanges(token, "carnes", [{ id: "x", text: "   " }])).error?.message).toContain("Cambios inválidos");
    expect((await saveChanges(token, "carnes", [{ id: "x", text: "a".repeat(201) }])).error?.message).toContain("Cambios inválidos");
    expect((await saveChanges(token, "carnes", [{ id: "x", item_id: "no-existe", text: "a" }])).error?.message).toContain("Producto inválido");
    expect((await saveChanges(token, "panaderia", [])).error?.message).toContain("Tipo de lista inválido");
    expect((await listOf(token, "carnes"))?.changes).toHaveLength(20);
  });

  it("enviar la lista lleva las notas; editarlas después la deja «modificada»", async () => {
    const { token } = await createTestCommunity("chg-envio");
    expect((await supabase.rpc("market_set_participants", { p_token: token, p_participants: 9 })).error).toBeNull();
    const item = await carneId(token);

    await supabase.rpc("market_list_save", { p_token: token, p_week_start: WEEK, p_kind: "carnes", p_quantities: { [item]: 2 } });
    await saveChanges(token, "carnes", [{ id: "p1", item_id: item, text: "Pescado por pechuga" }]);
    expect((await supabase.rpc("market_list_submit", { p_token: token, p_week_start: WEEK })).error).toBeNull();
    expect((await listOf(token, "carnes"))?.modified).toBe(false);

    await saveChanges(token, "carnes", [{ id: "p1", item_id: item, text: "Pescado por pavo" }]);
    expect((await listOf(token, "carnes"))?.modified).toBe(true);
  });
});

describe.skipIf(!password)("zona de cambios: la nutricionista ve lo enviado", () => {
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

  it("el detalle trae las notas ENVIADAS con el nombre del producto, y el resumen las cuenta", async () => {
    const c = await createTestCommunity("chg-adm");
    await supabase.rpc("market_set_participants", { p_token: c.token, p_participants: 7 });
    const item = await carneId(c.token);
    await supabase.rpc("market_list_save", { p_token: c.token, p_week_start: WEEK, p_kind: "carnes", p_quantities: { [item]: 1 } });
    await saveChanges(c.token, "carnes", [
      { id: "a1", item_id: item, text: "Pescado por pechuga" },
      { id: "a2", item_id: null, text: "Llega el miércoles" },
    ]);
    expect((await supabase.rpc("market_list_submit", { p_token: c.token, p_week_start: WEEK })).error).toBeNull();
    // Una nota nueva sin enviar no debe verse todavía.
    await saveChanges(c.token, "carnes", [
      { id: "a1", item_id: item, text: "Pescado por pechuga" },
      { id: "a2", item_id: null, text: "Llega el miércoles" },
      { id: "a3", item_id: null, text: "Borrador sin enviar" },
    ]);

    const detail = await supabase.rpc("admin_market_list", { p_token: adminToken, p_community: c.name, p_week_start: WEEK });
    expect(detail.error).toBeNull();
    const carnes = detail.data.lists.find((l: { kind: string }) => l.kind === "carnes");
    expect(carnes.changes.map((n: { text: string }) => n.text)).toEqual(["Pescado por pechuga", "Llega el miércoles"]);
    expect(carnes.changes[0].item_name).toBeTruthy();
    expect(carnes.changes[1].item_name).toBeNull();
    expect(detail.data.has_unsent_changes).toBe(true);

    const overview = await supabase.rpc("admin_market_overview", { p_token: adminToken, p_week_start: WEEK });
    const row = overview.data.communities.find((r: { community: string }) => r.community === c.name);
    expect(row.changes_count).toBe(2);
  });
});
