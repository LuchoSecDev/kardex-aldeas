import { describe, expect, it } from "vitest";
import { createTestCommunity, supabase } from "./helpers";

// Lista de mercado (plan 003, Fase A) contra la base real. Requiere haber
// corrido supabase/market_lists_1..5.sql y los market_seed_N.sql. Escribe solo en
// comunidades ZZZ_TEST_BORRAR_AUTO_*. Las semanas usadas son del futuro lejano
// (sin calendario sembrado), así que el plazo por defecto nunca está vencido.
//
// El detalle fino (plazos, tardías, permisos de tablas) se prueba también en
// tests/db/market_lists.test.sql contra un Postgres local.

// Lunes de una semana lejana (2099-01-05 es lunes).
const WEEK = "2099-01-05";

const load = (token: string, week = WEEK) => supabase.rpc("market_list_load", { p_token: token, p_week_start: week });
const save = (token: string, kind: string, quantities: Record<string, number>, week = WEEK) =>
  supabase.rpc("market_list_save", { p_token: token, p_week_start: week, p_kind: kind, p_quantities: quantities });
const submit = (token: string, week = WEEK) => supabase.rpc("market_list_submit", { p_token: token, p_week_start: week });
const participants = (token: string, n: number) => supabase.rpc("market_set_participants", { p_token: token, p_participants: n });

describe("lista de mercado: acceso y catálogo", () => {
  it("las tablas están cerradas al acceso directo", async () => {
    for (const table of ["market_items", "market_calendar", "market_lists"]) {
      const { data, error } = await supabase.from(table).select("*").limit(1);
      expect(error, table).not.toBeNull();
      expect(data, table).toBeNull();
    }
  });

  it("las funciones internas no se pueden llamar", async () => {
    for (const fn of ["_market_deadline", "_market_check_week", "_market_clean_quantities"]) {
      const { error } = await supabase.rpc(fn, { p_friday: "2026-10-02", p_week_start: WEEK, p_kind: "fruver", p_quantities: {} });
      expect(error, fn).not.toBeNull();
    }
  });

  it("un token falso se rechaza en todas las funciones", async () => {
    const bad = "token-falso";
    const results = await Promise.all([
      supabase.rpc("market_catalog", { p_token: bad }),
      load(bad),
      save(bad, "fruver", {}),
      participants(bad, 5),
      submit(bad),
    ]);
    for (const r of results) expect(r.error?.message).toContain("SESION_INVALIDA");
  });

  it("el catálogo trae los 285 ítems del Excel, sin precios", async () => {
    const { token } = await createTestCommunity("mktcat");
    const { data, error } = await supabase.rpc("market_catalog", { p_token: token });
    expect(error).toBeNull();
    const items = data as { id: string; kind: string }[];
    expect(items).toHaveLength(285);
    const count = (kind: string) => items.filter((i) => i.kind === kind).length;
    expect([count("fruver"), count("carnes"), count("abarrotes"), count("aseo")]).toEqual([117, 35, 80, 53]);
    expect(Object.keys(items[0]).sort()).toEqual(["id", "is_event", "kind", "name", "sort_order", "unit"]);
  });
});

describe("lista de mercado: cargar, guardar y enviar", () => {
  it("una semana sin nada se carga vacía, con el plazo por defecto (viernes 5 pm Bogotá)", async () => {
    const { token } = await createTestCommunity("mktload");
    const { data, error } = await load(token);
    expect(error).toBeNull();
    expect(data.friday).toBe("2099-01-02");
    expect(data.kinds_due).toBeNull(); // viernes no sembrado
    expect(new Date(data.deadline_at).toISOString()).toBe("2099-01-02T22:00:00.000Z");
    expect(data.participants).toBeNull();
    expect(data.lists).toEqual([]);
  });

  it("rechaza semanas que no son lunes", async () => {
    const { token } = await createTestCommunity("mktweek");
    expect((await load(token, "2099-01-06")).error?.message).toContain("Semana inválida");
    expect((await save(token, "fruver", {}, "2099-01-06")).error?.message).toContain("Semana inválida");
    expect((await submit(token, "2099-01-06")).error?.message).toContain("Semana inválida");
  });

  it("guarda el borrador: descarta ceros, conserva decimales y reemplaza al guardar de nuevo", async () => {
    const { token } = await createTestCommunity("mktsave");
    expect((await save(token, "fruver", { mf1: 2.5, mf2: 0, mf3: 0.25 })).error).toBeNull();
    let { data } = await load(token);
    expect(data.lists).toHaveLength(1);
    expect(data.lists[0]).toMatchObject({ kind: "fruver", sent: false, modified: false, quantities: { mf1: 2.5, mf3: 0.25 } });

    await save(token, "fruver", { mf1: 4 });
    ({ data } = await load(token));
    expect(data.lists[0].quantities).toEqual({ mf1: 4 });
  });

  it("valida ítems, tipos y cantidades en el servidor", async () => {
    const { token } = await createTestCommunity("mktval");
    const cases: [string, Record<string, unknown>, string][] = [
      ["fruver", { mc1: 1 }, "Producto inválido"], // ítem de carnes en fruver
      ["fruver", { nada: 1 }, "Producto inválido"],
      ["fruver", { mf1: -1 }, "Cantidades inválidas"],
      ["fruver", { mf1: "2" }, "Cantidades inválidas"],
      ["fruver", { mf1: 100001 }, "Cantidades inválidas"],
      ["panaderia", {}, "Tipo de lista inválido"],
    ];
    for (const [kind, quantities, message] of cases) {
      const { error } = await save(token, kind, quantities as Record<string, number>);
      expect(error?.message, JSON.stringify(quantities)).toContain(message);
    }
  });

  it("los participantes se validan y solo los ve su comunidad", async () => {
    const a = await createTestCommunity("mktpartA");
    const b = await createTestCommunity("mktpartB");
    for (const bad of [0, 501]) expect((await participants(a.token, bad)).error?.message).toContain("Participantes inválidos");
    expect((await participants(a.token, 11)).error).toBeNull();
    expect((await load(a.token)).data.participants).toBe(11);
    expect((await load(b.token)).data.participants).toBeNull();
  });

  it("enviar exige participantes y al menos un ítem pedido", async () => {
    const { token } = await createTestCommunity("mktreq");
    await save(token, "fruver", { mf1: 1 });
    expect((await submit(token)).error?.message).toContain("PARTICIPANTES_REQUERIDOS");

    await participants(token, 8);
    const other = "2099-02-02"; // otra semana, sin nada guardado
    expect((await submit(token, other)).error?.message).toContain("LISTA_VACIA");
  });

  it("enviar registra las 4 listas, reenviar sube el contador y editar después marca 'modificada'", async () => {
    const { token } = await createTestCommunity("mktsend");
    await participants(token, 11);
    await save(token, "fruver", { mf1: 4 });
    await save(token, "carnes", { mc1: 12 });

    const sent = await submit(token);
    expect(sent.error).toBeNull();
    expect(sent.data.late).toBe(false);
    expect(sent.data.changed_after_deadline).toBe(false);

    let { data } = await load(token);
    expect(data.lists).toHaveLength(4);
    for (const list of data.lists) expect(list).toMatchObject({ sent: true, modified: false, submit_count: 1, late: false });

    await save(token, "carnes", { mc1: 24 });
    ({ data } = await load(token));
    const byKind = (kind: string) => data.lists.find((l: { kind: string }) => l.kind === kind);
    expect(byKind("carnes")).toMatchObject({ modified: true });
    expect(byKind("fruver")).toMatchObject({ modified: false });

    expect((await submit(token)).error).toBeNull();
    ({ data } = await load(token));
    for (const list of data.lists) expect(list).toMatchObject({ modified: false, submit_count: 2 });
  });

  it("un envío después del plazo queda marcado como tardío (semana del 5 de enero de 2026, ya vencida)", async () => {
    const { token } = await createTestCommunity("mktlate");
    await participants(token, 5);
    const past = "2026-01-05"; // viernes de pedido: 2 ene 2026
    await save(token, "fruver", { mf1: 1 }, past);
    const sent = await submit(token, past);
    expect(sent.error).toBeNull();
    expect(sent.data.late).toBe(true);

    await save(token, "fruver", { mf1: 2 }, past);
    const resent = await submit(token, past);
    expect(resent.data).toMatchObject({ late: true, changed_after_deadline: true });
  });

  it("el calendario sembrado se refleja en la carga (semana del 5 de octubre de 2026)", async () => {
    const { token } = await createTestCommunity("mktcal");
    const { data } = await load(token, "2026-10-05");
    expect(data.friday).toBe("2026-10-02");
    expect(data.kinds_due).toEqual(["fruver", "carnes", "abarrotes"]);
    expect(new Date(data.deadline_at).toISOString()).toBe("2026-10-02T22:00:00.000Z");
  });

  it("dos comunidades no se ven entre sí", async () => {
    const a = await createTestCommunity("mktisoA");
    const b = await createTestCommunity("mktisoB");
    await save(a.token, "aseo", { ms1: 3 });
    expect((await load(b.token)).data.lists).toEqual([]);
    expect((await load(a.token)).data.lists[0].quantities).toEqual({ ms1: 3 });
  });
});
