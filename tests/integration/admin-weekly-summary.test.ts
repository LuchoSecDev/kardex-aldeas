import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aggregateWeekly, type WeeklyRow } from "@/lib/weeklySummary";
import type { Product } from "@/types/kardex";
import { anyProductId, createTestCommunity, supabase, zeros } from "./helpers";

// Requiere una sesión de administradora, pero NO modifica la cuenta: solo inicia
// sesión (a diferencia de admin-lifecycle.test.ts, que cambia la contraseña).
// Es opt-in con la contraseña VIGENTE de la cuenta (ya cambiada, no la temporal):
//
//   $env:ADMIN_LOGIN_PASSWORD = "<contraseña actual>"; npm run test:integration
//
// Una contraseña equivocada suma un intento fallido (5 bloquean la cuenta 15
// min), por eso la prueba inicia sesión UNA sola vez y para si falla.
const password = process.env.ADMIN_LOGIN_PASSWORD;

const YEAR = 2026;
const MONTH = 8;

type Row = WeeklyRow;

describe.skipIf(!password)("resumen semanal (con sesión de administradora)", () => {
  let adminToken = "";
  let productId = "";
  const a = { name: "", token: "" };
  const b = { name: "", token: "" };

  beforeAll(async () => {
    const login = await supabase.rpc("admin_login", { p_password: password });
    if (login.error || !login.data) {
      throw new Error("No se pudo iniciar sesión de administradora: revisa ADMIN_LOGIN_PASSWORD (¿vigente y sin bloqueo?).");
    }
    if (login.data.must_change) {
      throw new Error("La cuenta aún tiene la contraseña TEMPORAL: cámbiala desde /admin antes de correr esta prueba.");
    }
    adminToken = login.data.token;
    productId = await anyProductId();

    const save = (token: string, entries: number[], exits: number[], prev: number[]) =>
      supabase.rpc("kardex_save_product", {
        p_token: token, p_year: YEAR, p_month: MONTH, p_product_id: productId,
        p_exits: exits, p_entries: entries, p_prev_balances: prev,
      });

    // Comunidad A: semana 1 con entradas 9 y salida 1.5 (día 2); semana 2 con salida 2. ENVÍA la semana 1.
    Object.assign(a, await createTestCommunity("sumA"));
    const exitsA = zeros(35);
    exitsA[1] = 1.5;
    exitsA[8] = 2;
    expect((await save(a.token, [9, 0, 0, 0, 0], exitsA, [0, 7.5, 5.5, 5.5, 5.5])).error).toBeNull();
    expect((await supabase.rpc("kardex_submit_week", { p_token: a.token, p_year: YEAR, p_month: MONTH, p_week_index: 0 })).error).toBeNull();

    // Comunidad B: semana 1 con entradas 4 y salida 2 (día 3). NO envía.
    Object.assign(b, await createTestCommunity("sumB"));
    const exitsB = zeros(35);
    exitsB[2] = 2;
    expect((await save(b.token, [4, 0, 0, 0, 0], exitsB, [0, 2, 2, 2, 2])).error).toBeNull();
  });

  afterAll(async () => {
    if (adminToken) await supabase.rpc("admin_logout", { p_token: adminToken });
  });

  const totals = async (week: number, onlySent: boolean) => {
    const { data, error } = await supabase.rpc("admin_weekly_totals", {
      p_token: adminToken, p_year: YEAR, p_month: MONTH, p_week_index: week, p_only_sent: onlySent,
    });
    expect(error).toBeNull();
    return (data as Row[]).filter((r) => r.community === a.name || r.community === b.name);
  };

  it("solo-enviadas: incluye a la comunidad que envió la semana con sus cifras, y no a la que no envió", async () => {
    const rows = await totals(0, true);
    expect(rows.map((r) => r.community)).toEqual([a.name]);
    expect(rows[0]).toMatchObject({ product_id: productId, prev_balance: 0, entries: 9, exits: 1.5 });
  });

  it("todas las comunidades: incluye a las dos, y las cifras suman bien", async () => {
    const rows = await totals(0, false);
    expect(rows.map((r) => r.community).sort()).toEqual([a.name, b.name].sort());

    const product: Product = { id: productId, category: "X", name: "Producto de prueba", unit: "UND", minStock: 5 };
    const [t] = aggregateWeekly(rows, [product]);
    expect(t.entries).toBe(13); // 9 + 4
    expect(t.exits).toBe(3.5); // 1.5 + 2
    expect(t.final).toBe(9.5); // 0 + 13 - 3.5
    expect(t.byCommunity).toHaveLength(2);
  });

  it("suma solo las salidas de los 7 días de esa semana", async () => {
    // La salida de A del día 9 (2 unidades) cae en la semana 2, no en la 1.
    const week1 = (await totals(0, false)).find((r) => r.community === a.name)!;
    expect(week1.exits).toBe(1.5);
    const week2 = (await totals(1, false)).find((r) => r.community === a.name)!;
    expect(week2).toMatchObject({ prev_balance: 7.5, entries: 0, exits: 2 });
  });

  it("una semana que la comunidad no envió no aparece en solo-enviadas", async () => {
    expect(await totals(1, true)).toEqual([]);
  });

  it("una semana sin movimientos solo trae el saldo heredado (el stock que se arrastra también cuenta)", async () => {
    // Semana 5: nadie registró entradas ni salidas, pero sí llegan saldos anteriores distintos de cero.
    const rows = await totals(4, false);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => {
      expect(r.entries).toBe(0);
      expect(r.exits).toBe(0);
      expect(r.prev_balance).not.toBe(0);
    });
  });

  it("una semana con todo en cero no devuelve filas (los saldos en cero se omiten)", async () => {
    // Un mes sin datos de estas comunidades: ninguna fila suya.
    const { data, error } = await supabase.rpc("admin_weekly_totals", {
      p_token: adminToken, p_year: YEAR, p_month: 0, p_week_index: 0, p_only_sent: false,
    });
    expect(error).toBeNull();
    expect((data as Row[]).filter((r) => r.community === a.name || r.community === b.name)).toEqual([]);
  });

  it("rechaza semanas y meses fuera de rango", async () => {
    // Desde el plan 004 (semana 6 de cierre) el índice 5 es válido: el primero fuera de rango es el 6.
    for (const [week, month] of [[6, MONTH], [-1, MONTH], [0, 12]]) {
      const { error } = await supabase.rpc("admin_weekly_totals", {
        p_token: adminToken, p_year: YEAR, p_month: month, p_week_index: week, p_only_sent: true,
      });
      expect(error?.message, `semana ${week} mes ${month}`).toContain("Fecha inválida");
    }
  });

  it("rechaza tokens falsos y tokens de comunidad", async () => {
    for (const token of ["token-falso", a.token]) {
      const { error } = await supabase.rpc("admin_weekly_totals", {
        p_token: token, p_year: YEAR, p_month: MONTH, p_week_index: 0, p_only_sent: true,
      });
      expect(error?.message).toContain("SESION_ADMIN_INVALIDA");
    }
  });
});
