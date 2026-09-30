import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anyProductId, createTestCommunity, supabase, zeros } from "./helpers";

// Semana 6 de cierre (plan 004, hallazgo H1) contra la base real. Requiere haber corrido
// supabase/six_weeks_1..5.sql. Escribe solo en comunidades ZZZ_TEST_BORRAR_AUTO_*.
//
// Marzo de 2026 (mes 2) empieza en domingo: el 30 y el 31 van en la semana 6 (posiciones 35 y 36
// del arreglo de salidas). Las pruebas con sesión de administradora son opt-in (ADMIN_LOGIN_PASSWORD,
// solo inicia sesión, no cambia la cuenta).
const YEAR = 2026;
const MARZO = 2;

let productId: string;
beforeAll(async () => {
  productId = await anyProductId();
});

const at = (n: number, values: Record<number, number>) => {
  const arr = zeros(n);
  Object.entries(values).forEach(([i, v]) => { arr[Number(i)] = v; });
  return arr;
};

const save = (token: string, exits: number[], entries: number[], prev: number[], month = MARZO) =>
  supabase.rpc("kardex_save_product", {
    p_token: token, p_year: YEAR, p_month: month, p_product_id: productId,
    p_exits: exits, p_entries: entries, p_prev_balances: prev,
  });

const load = async (token: string, month = MARZO) => {
  const { data, error } = await supabase.rpc("kardex_load_month", { p_token: token, p_year: YEAR, p_month: month });
  expect(error).toBeNull();
  return data as { product_id: string; exits: number[]; entries: number[]; prev_balances: number[] }[];
};

const submit = (token: string, week: number) =>
  supabase.rpc("kardex_submit_week", { p_token: token, p_year: YEAR, p_month: MARZO, p_week_index: week });

describe("semana 6 de cierre: guardar y leer", () => {
  it("guarda y devuelve 42 salidas, 6 entradas y 6 saldos, con decimales en el 30 y 31 de marzo", async () => {
    const { token } = await createTestCommunity("sem6save");
    const exits = at(42, { 35: 1.5, 36: 0.5 });
    const res = await save(token, exits, at(6, { 5: 3 }), at(6, { 5: 10 }));
    expect(res.error).toBeNull();

    const [row] = await load(token);
    expect(row.exits).toHaveLength(42);
    expect(row.exits[35]).toBe(1.5);
    expect(row.exits[36]).toBe(0.5);
    expect(row.entries).toEqual(at(6, { 5: 3 }));
    expect(row.prev_balances[5]).toBe(10);
  });

  it("el formato anterior (35/5/5) sigue aceptado y se devuelve tal cual", async () => {
    const { token } = await createTestCommunity("sem6legacy");
    expect((await save(token, zeros(35), zeros(5), zeros(5), 8)).error).toBeNull();
    const [row] = await load(token, 8);
    expect(row.exits).toHaveLength(35);
  });

  it("una fila de 35 días se puede reemplazar por una de 42 (el mes gana la semana 6)", async () => {
    const { token } = await createTestCommunity("sem6upgrade");
    await save(token, zeros(35), zeros(5), zeros(5));
    expect((await save(token, at(42, { 36: 2 }), zeros(6), zeros(6))).error).toBeNull();
    const [row] = await load(token);
    expect(row.exits).toHaveLength(42);
  });

  it.each([
    ["36 salidas con 5 entradas y 5 saldos", () => [zeros(36), zeros(5), zeros(5)]],
    ["35 salidas pero 6 entradas y 6 saldos", () => [zeros(35), zeros(6), zeros(6)]],
    ["42 salidas pero 5 entradas", () => [zeros(42), zeros(5), zeros(6)]],
    ["42 salidas pero 5 saldos", () => [zeros(42), zeros(6), zeros(5)]],
    ["43 salidas", () => [zeros(43), zeros(6), zeros(6)]],
  ])("rechaza %s", async (_label, build) => {
    const { token } = await createTestCommunity("sem6bad");
    const [exits, entries, prev] = build();
    expect((await save(token, exits, entries, prev)).error?.message).toContain("Datos incompletos");
  });

  it("sigue validando los valores en las posiciones nuevas", async () => {
    const { token } = await createTestCommunity("sem6vals");
    expect((await save(token, at(42, { 40: -1 }), zeros(6), zeros(6))).error?.message).toContain("Valores inválidos");
    expect((await save(token, zeros(42), at(6, { 5: -2 }), zeros(6))).error?.message).toContain("Valores inválidos");
  });
});

describe("semana 6 de cierre: ajustes y envío", () => {
  it("acepta un ajuste auditado en la semana 6 (índice 5) y rechaza la 7 (índice 6)", async () => {
    const { token } = await createTestCommunity("sem6adj");
    const adjust = (week: number) =>
      supabase.rpc("kardex_insert_ajuste", {
        p_token: token, p_product_id: productId, p_year: YEAR, p_month: MARZO, p_week_index: week,
        p_saldo_anterior: 10, p_saldo_nuevo: 8, p_motivo: "conteo de cierre",
      });
    expect((await adjust(5)).error).toBeNull();
    const { data } = await supabase.rpc("kardex_load_ajustes", { p_token: token, p_year: YEAR, p_month: MARZO });
    expect(data).toEqual([expect.objectContaining({ week_index: 5, saldo_nuevo: 8 })]);
    expect((await adjust(6)).error?.message).toContain("Fecha inválida");
  });

  it("la semana 6 se envía cuando tiene movimientos, queda modificada si cambia y se puede reenviar", async () => {
    const { token } = await createTestCommunity("sem6send");
    // Sin movimientos en la semana 6 no se puede enviar.
    await save(token, at(42, { 1: 1 }), at(6, { 0: 5 }), zeros(6));
    expect((await submit(token, 5)).error?.message).toContain("SEMANA_VACIA");

    await save(token, at(42, { 1: 1, 35: 1, 36: 1 }), at(6, { 0: 5 }), zeros(6));
    const sent = await submit(token, 5);
    expect(sent.error).toBeNull();
    expect(sent.data.submit_count).toBe(1);

    const list = async () =>
      (await supabase.rpc("kardex_week_submissions", { p_token: token, p_year: YEAR, p_month: MARZO })).data as { week_index: number; modified: boolean }[];
    expect(await list()).toEqual([expect.objectContaining({ week_index: 5, modified: false })]);

    await save(token, at(42, { 1: 3, 35: 1, 36: 1 }), at(6, { 0: 5 }), zeros(6)); // cambia la semana 1, no la 6
    expect((await list())[0].modified).toBe(false);
    await save(token, at(42, { 1: 3, 35: 2, 36: 1 }), at(6, { 0: 5 }), zeros(6)); // cambia el 30 de marzo
    expect((await list())[0].modified).toBe(true);
    expect((await submit(token, 5)).data.submit_count).toBe(2);
    expect((await list())[0].modified).toBe(false);
  });

  it("rechaza la semana 7 (índice 6)", async () => {
    const { token } = await createTestCommunity("sem6date");
    expect((await submit(token, 6)).error?.message).toContain("Fecha inválida");
  });
});

const password = process.env.ADMIN_LOGIN_PASSWORD;

describe.skipIf(!password)("semana 6 de cierre: nutricionista (con sesión de administradora)", () => {
  let adminToken = "";
  const a = { name: "", token: "" };

  beforeAll(async () => {
    const login = await supabase.rpc("admin_login", { p_password: password });
    if (login.error || !login.data) {
      throw new Error("No se pudo iniciar sesión de administradora: revisa ADMIN_LOGIN_PASSWORD (¿vigente y sin bloqueo?).");
    }
    if (login.data.must_change) throw new Error("La cuenta aún tiene la contraseña TEMPORAL: cámbiala desde /admin.");
    adminToken = login.data.token;

    Object.assign(a, await createTestCommunity("sem6adm"));
    await save(a.token, at(42, { 35: 2, 36: 0.5 }), at(6, { 5: 3 }), at(6, { 5: 10 }));
    expect((await submit(a.token, 5)).error).toBeNull();
  });

  afterAll(async () => {
    if (adminToken) await supabase.rpc("admin_logout", { p_token: adminToken });
  });

  it("el resumen de comunidades trae 6 banderas de semana y marca la 6", async () => {
    const { data, error } = await supabase.rpc("admin_communities_overview", { p_token: adminToken, p_year: YEAR, p_month: MARZO });
    expect(error).toBeNull();
    const row = (data as { name: string; weeks_active: boolean[] }[]).find((r) => r.name === a.name)!;
    expect(row.weeks_active).toHaveLength(6);
    expect(row.weeks_active[5]).toBe(true);
    expect(row.weeks_active.slice(0, 5)).toEqual([false, false, false, false, false]);
  });

  it("el resumen semanal de la semana 6 suma saldo anterior, entradas y salidas", async () => {
    const { data, error } = await supabase.rpc("admin_weekly_totals", {
      p_token: adminToken, p_year: YEAR, p_month: MARZO, p_week_index: 5, p_only_sent: true,
    });
    expect(error).toBeNull();
    const row = (data as { community: string; prev_balance: number; entries: number; exits: number }[]).find((r) => r.community === a.name);
    expect(row).toMatchObject({ prev_balance: 10, entries: 3, exits: 2.5 });
  });

  it("rechaza la semana 7 en el resumen semanal", async () => {
    const { error } = await supabase.rpc("admin_weekly_totals", {
      p_token: adminToken, p_year: YEAR, p_month: MARZO, p_week_index: 6, p_only_sent: true,
    });
    expect(error?.message).toContain("Fecha inválida");
  });
});
