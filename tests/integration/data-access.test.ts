import { beforeAll, describe, expect, it } from "vitest";
import { anyProductId, createTestCommunity, supabase, zeros } from "./helpers";

let productId: string;

beforeAll(async () => {
  productId = await anyProductId();
});

const save = (
  token: string,
  overrides: Partial<{
    p_year: number;
    p_month: number;
    p_product_id: string;
    p_exits: unknown;
    p_entries: unknown;
    p_prev_balances: unknown;
  }> = {}
) =>
  supabase.rpc("kardex_save_product", {
    p_token: token,
    p_year: 2026,
    p_month: 8,
    p_product_id: productId,
    p_exits: zeros(35),
    p_entries: zeros(5),
    p_prev_balances: zeros(5),
    ...overrides,
  });

const saveAjuste = (token: string, overrides: Record<string, unknown> = {}) =>
  supabase.rpc("kardex_insert_ajuste", {
    p_token: token,
    p_product_id: productId,
    p_year: 2026,
    p_month: 8,
    p_week_index: 0,
    p_saldo_anterior: 0,
    p_saldo_nuevo: 10,
    p_motivo: "Saldo inicial (prueba automática)",
    ...overrides,
  });

describe("acceso directo a las tablas cerrado", () => {
  it("no se puede leer kardex_records ni ajustes directamente", async () => {
    for (const table of ["kardex_records", "ajustes"]) {
      const { data, error } = await supabase.from(table).select("id").limit(1);
      expect(error, `${table} select`).not.toBeNull();
      expect(data, `${table} select`).toBeNull();
    }
  });

  it("no se puede escribir en kardex_records ni ajustes directamente", async () => {
    const a = await supabase.from("kardex_records").insert({ community: "ZZZ_TEST_BORRAR_AUTO_direct", year: 2026, month: 8, product_id: productId });
    expect(a.error).not.toBeNull();
    const b = await supabase.from("ajustes").insert({
      community: "ZZZ_TEST_BORRAR_AUTO_direct", product_id: productId, year: 2026, month: 8,
      week_index: 0, saldo_anterior: 0, saldo_nuevo: 1, motivo: "x",
    });
    expect(b.error).not.toBeNull();
  });

  it("pin_hash no es legible", async () => {
    const { error } = await supabase.from("communities").select("pin_hash").limit(1);
    expect(error).not.toBeNull();
  });

  it("no se puede escribir en communities directamente", async () => {
    const { error } = await supabase.from("communities").insert({ name: "ZZZ_TEST_BORRAR_AUTO_direct2" });
    expect(error).not.toBeNull();
  });

  it("verify_community_pin no se puede llamar directamente (solo login_community)", async () => {
    const { error } = await supabase.rpc("verify_community_pin", { p_name: "Maná", p_pin: "0000" });
    expect(error).not.toBeNull();
  });
});

describe("guardar y leer el kardex", () => {
  it("guarda y devuelve los mismos datos, incluidos decimales y saldos negativos", async () => {
    const { token } = await createTestCommunity("roundtrip");
    const exits = zeros(35);
    exits[1] = 1.5;
    exits[8] = 0.5;
    const entries = [5, 0, 2.5, 0, 0];
    const prev = [10, 13.5, -1, 0, 0.25];

    const saved = await save(token, { p_exits: exits, p_entries: entries, p_prev_balances: prev });
    expect(saved.error).toBeNull();

    const { data, error } = await supabase.rpc("kardex_load_month", { p_token: token, p_year: 2026, p_month: 8 });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].product_id).toBe(productId);
    expect(data[0].exits).toEqual(exits);
    expect(data[0].entries).toEqual(entries);
    expect(data[0].prev_balances).toEqual(prev);
  });

  it("guardar dos veces el mismo producto actualiza la fila, no la duplica", async () => {
    const { token } = await createTestCommunity("upsert");
    await save(token, { p_entries: [1, 0, 0, 0, 0] });
    await save(token, { p_entries: [2, 0, 0, 0, 0] });

    const { data } = await supabase.rpc("kardex_load_month", { p_token: token, p_year: 2026, p_month: 8 });
    expect(data).toHaveLength(1);
    expect(data[0].entries[0]).toBe(2);
  });

  it("los meses con datos incluyen solo los de la propia comunidad", async () => {
    const a = await createTestCommunity("monthsA");
    const b = await createTestCommunity("monthsB");
    await save(a.token, { p_year: 2026, p_month: 3 });

    const mineA = await supabase.rpc("kardex_months_with_data", { p_token: a.token });
    const mineB = await supabase.rpc("kardex_months_with_data", { p_token: b.token });
    expect(mineA.data).toEqual([{ year: 2026, month: 3 }]);
    expect(mineB.data).toEqual([]);
  });

  it("una comunidad no ve los datos de otra", async () => {
    const a = await createTestCommunity("isoA");
    const b = await createTestCommunity("isoB");
    await save(a.token, { p_entries: [9, 0, 0, 0, 0] });
    await saveAjuste(a.token);

    const monthB = await supabase.rpc("kardex_load_month", { p_token: b.token, p_year: 2026, p_month: 8 });
    const ajustesB = await supabase.rpc("kardex_load_ajustes", { p_token: b.token, p_year: 2026, p_month: 8 });
    const historyB = await supabase.rpc("kardex_load_ajustes_history", { p_token: b.token });
    expect(monthB.data).toEqual([]);
    expect(ajustesB.data).toEqual([]);
    expect(historyB.data).toEqual([]);
  });
});

describe("validaciones del servidor al guardar", () => {
  it.each([
    ["menos de 35 salidas", { p_exits: zeros(34) }, "Datos incompletos"],
    ["más de 35 salidas", { p_exits: zeros(36) }, "Datos incompletos"],
    ["entradas incompletas", { p_entries: zeros(4) }, "Datos incompletos"],
    ["saldos incompletos", { p_prev_balances: zeros(6) }, "Datos incompletos"],
    ["salidas que no son un arreglo", { p_exits: "hola" }, "Datos incompletos"],
    ["una salida negativa", { p_exits: [...zeros(3), -1, ...zeros(31)] }, "Valores inválidos"],
    ["una entrada negativa", { p_entries: [0, -2, 0, 0, 0] }, "Valores inválidos"],
    ["una salida que no es número", { p_exits: [...zeros(3), "x", ...zeros(31)] }, "Valores inválidos"],
    ["un producto inexistente", { p_product_id: "producto-que-no-existe" }, "Producto inválido"],
    ["el mes 12 (los meses van de 0 a 11)", { p_month: 12 }, "Fecha inválida"],
    ["un año absurdo", { p_year: 1900 }, "Fecha inválida"],
  ])("rechaza %s", async (_label, override, message) => {
    const { token } = await createTestCommunity("valid");
    const { error } = await save(token, override);
    expect(error?.message).toContain(message);
  });

  it("no guarda nada cuando la validación falla", async () => {
    const { token } = await createTestCommunity("noreplace");
    await save(token, { p_exits: zeros(34) });
    const { data } = await supabase.rpc("kardex_load_month", { p_token: token, p_year: 2026, p_month: 8 });
    expect(data).toEqual([]);
  });
});

describe("ajustes auditados", () => {
  it("un ajuste se guarda y aparece en el mes y en el historial", async () => {
    const { token } = await createTestCommunity("ajuste");
    expect((await saveAjuste(token)).error).toBeNull();

    const month = await supabase.rpc("kardex_load_ajustes", { p_token: token, p_year: 2026, p_month: 8 });
    expect(month.data).toHaveLength(1);
    expect(month.data[0]).toMatchObject({ product_id: productId, week_index: 0, saldo_nuevo: 10 });

    const history = await supabase.rpc("kardex_load_ajustes_history", { p_token: token });
    expect(history.data).toHaveLength(1);
  });

  it("el historial viene del más reciente al más antiguo", async () => {
    const { token } = await createTestCommunity("order");
    await saveAjuste(token, { p_saldo_nuevo: 1, p_motivo: "primero" });
    await saveAjuste(token, { p_saldo_nuevo: 2, p_motivo: "segundo" });

    const { data } = await supabase.rpc("kardex_load_ajustes_history", { p_token: token });
    expect(data.map((a: { motivo: string }) => a.motivo)).toEqual(["segundo", "primero"]);
  });

  it.each([
    ["un motivo vacío", { p_motivo: "   " }, "Motivo inválido"],
    ["un motivo de más de 500 caracteres", { p_motivo: "x".repeat(501) }, "Motivo inválido"],
    ["un saldo nuevo negativo", { p_saldo_nuevo: -1 }, "Saldo inválido"],
    ["una semana fuera de rango", { p_week_index: 5 }, "Fecha inválida"],
    ["un producto inexistente", { p_product_id: "producto-que-no-existe" }, "Producto inválido"],
  ])("rechaza %s", async (_label, override, message) => {
    const { token } = await createTestCommunity("ajvalid");
    const { error } = await saveAjuste(token, override);
    expect(error?.message).toContain(message);
  });

  it("no existe forma de editar o borrar un ajuste desde el cliente", async () => {
    const { token } = await createTestCommunity("append");
    await saveAjuste(token);
    const upd = await supabase.from("ajustes").update({ motivo: "hackeado" }).eq("product_id", productId);
    const del = await supabase.from("ajustes").delete().eq("product_id", productId);
    expect(upd.error).not.toBeNull();
    expect(del.error).not.toBeNull();
  });
});
