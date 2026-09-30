import { beforeAll, describe, expect, it } from "vitest";
import { anyProductId, createTestCommunity, supabase, zeros } from "./helpers";

const YEAR = 2026;
const MONTH = 8;

let productId: string;
beforeAll(async () => {
  productId = await anyProductId();
});

const save = (token: string, entries: number[], exits: number[], prev: number[]) =>
  supabase.rpc("kardex_save_product", {
    p_token: token,
    p_year: YEAR,
    p_month: MONTH,
    p_product_id: productId,
    p_exits: exits,
    p_entries: entries,
    p_prev_balances: prev,
  });

const submit = (token: string, week: number, year = YEAR, month = MONTH) =>
  supabase.rpc("kardex_submit_week", { p_token: token, p_year: year, p_month: month, p_week_index: week });

const submissions = async (token: string) => {
  const { data, error } = await supabase.rpc("kardex_week_submissions", { p_token: token, p_year: YEAR, p_month: MONTH });
  expect(error).toBeNull();
  return data as { week_index: number; submit_count: number; reviewed: boolean; modified: boolean }[];
};

describe("enviar semana a la nutricionista", () => {
  it("una semana con movimientos se envía y aparece como enviada, sin modificar ni revisar", async () => {
    const { token } = await createTestCommunity("subok");
    const exits = zeros(35);
    exits[1] = 1.5;
    await save(token, [3, 0, 0, 0, 0], exits, [0, 1.5, 1.5, 1.5, 1.5]);

    const sent = await submit(token, 0);
    expect(sent.error).toBeNull();
    expect(sent.data.submit_count).toBe(1);

    expect(await submissions(token)).toEqual([
      expect.objectContaining({ week_index: 0, submit_count: 1, reviewed: false, modified: false }),
    ]);
  });

  it("una semana sin entradas ni salidas no se puede enviar (aunque tenga saldo heredado)", async () => {
    const { token } = await createTestCommunity("subempty");
    // Solo saldos anteriores distintos de cero, ningún movimiento.
    await save(token, zeros(5), zeros(35), [4, 4, 4, 4, 4]);

    for (const week of [0, 3]) {
      const { error } = await submit(token, week);
      expect(error?.message, `semana ${week}`).toContain("SEMANA_VACIA");
    }
    expect(await submissions(token)).toEqual([]);
  });

  it("cambiar OTRA semana no marca como modificada la ya enviada", async () => {
    const { token } = await createTestCommunity("subother");
    const exits = zeros(35);
    exits[1] = 1;
    await save(token, [3, 0, 0, 0, 0], exits, [0, 2, 2, 2, 2]);
    await submit(token, 0);

    // Se llena la semana 3 (posiciones 14-20) sin tocar la semana 1.
    const later = [...exits];
    later[15] = 2;
    await save(token, [3, 0, 5, 0, 0], later, [0, 2, 2, -3, -3]);

    const [week0] = await submissions(token);
    expect(week0.modified).toBe(false);
  });

  it("cambiar la MISMA semana la marca como modificada, y reenviar limpia la marca", async () => {
    const { token } = await createTestCommunity("submod");
    const exits = zeros(35);
    exits[1] = 1;
    await save(token, [3, 0, 0, 0, 0], exits, [0, 2, 2, 2, 2]);
    await submit(token, 0);

    await save(token, [4, 0, 0, 0, 0], exits, [0, 3, 3, 3, 3]);
    expect((await submissions(token))[0].modified).toBe(true);

    const resent = await submit(token, 0);
    expect(resent.data.submit_count).toBe(2);
    expect(await submissions(token)).toEqual([
      expect.objectContaining({ week_index: 0, submit_count: 2, modified: false, reviewed: false }),
    ]);
  });

  it("un cambio en una semana anterior que altera el saldo marca como modificada la siguiente", async () => {
    const { token } = await createTestCommunity("subprev");
    const exits = zeros(35);
    exits[1] = 1; // semana 1
    exits[8] = 1; // semana 2
    await save(token, [3, 2, 0, 0, 0], exits, [0, 2, 3, 3, 3]);
    await submit(token, 1); // se envía la semana 2 (índice 1)

    // Cambia la semana 1: el saldo anterior de la semana 2 pasa de 2 a 3.
    await save(token, [4, 2, 0, 0, 0], exits, [0, 3, 4, 4, 4]);
    const [week1] = await submissions(token);
    expect(week1.week_index).toBe(1);
    expect(week1.modified).toBe(true);
  });

  it("rechaza fechas fuera de rango", async () => {
    const { token } = await createTestCommunity("subdate");
    for (const [week, month] of [[5, MONTH], [0, 12], [-1, MONTH]]) {
      const { error } = await submit(token, week, YEAR, month);
      expect(error?.message, `semana ${week} mes ${month}`).toContain("Fecha inválida");
    }
  });

  it("los envíos de una comunidad no los ve otra", async () => {
    const a = await createTestCommunity("subisoA");
    const b = await createTestCommunity("subisoB");
    const exits = zeros(35);
    exits[1] = 1;
    await save(a.token, [3, 0, 0, 0, 0], exits, [0, 2, 2, 2, 2]);
    await submit(a.token, 0);

    expect(await submissions(b.token)).toEqual([]);
  });

  it("exige una sesión válida", async () => {
    for (const token of [null, "", "token-falso"]) {
      const sent = await submit(token as string, 0);
      expect(sent.error?.message).toContain("SESION_INVALIDA");
      const list = await supabase.rpc("kardex_week_submissions", { p_token: token, p_year: YEAR, p_month: MONTH });
      expect(list.error?.message).toContain("SESION_INVALIDA");
    }
  });

  it("la tabla y las funciones internas no son accesibles desde afuera", async () => {
    const read = await supabase.from("week_submissions").select("*").limit(1);
    expect(read.error).not.toBeNull();
    const write = await supabase.from("week_submissions").insert({ community: "x", year: 2026, month: 8, week_index: 0, snapshot: {} });
    expect(write.error).not.toBeNull();

    const snapshot = await supabase.rpc("_week_snapshot", { p_community: "Maná", p_year: YEAR, p_month: MONTH, p_week: 0 });
    expect(snapshot.error).not.toBeNull();
    const activity = await supabase.rpc("_week_has_activity", { p_community: "Maná", p_year: YEAR, p_month: MONTH, p_week: 0 });
    expect(activity.error).not.toBeNull();
  });

  it("las funciones de administradora rechazan un token de comunidad", async () => {
    const { token } = await createTestCommunity("subadm");
    const calls = [
      supabase.rpc("admin_week_statuses", { p_token: token, p_year: YEAR, p_month: MONTH }),
      supabase.rpc("admin_notifications", { p_token: token }),
      supabase.rpc("admin_mark_reviewed", { p_token: token, p_id: "00000000-0000-0000-0000-000000000000" }),
      supabase.rpc("admin_weekly_totals", { p_token: token, p_year: YEAR, p_month: MONTH, p_week_index: 0, p_only_sent: true }),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result.error?.message).toContain("SESION_ADMIN_INVALIDA");
    }
  });
});
