import { describe, expect, it } from "vitest";
import { anyProductId, createTestCommunity, supabase, zeros } from "./helpers";

// Control de versión al guardar (plan 012) contra la base real. Requiere haber corrido supabase/kardex_version_1.sql: sin él, el
// guardado con versión falla con PGRST202 y estas pruebas lo dicen claro en vez de pasar por otra razón.
// Escribe solo con comunidades ZZZ_TEST_BORRAR_AUTO_* (cleanup_test_data.sql las borra).
const YEAR = 2026;
const MONTH = 9;

type Save = { token: string; productId: string; exits?: number[]; check?: boolean; expected?: string | null };
const save = ({ token, productId, exits = zeros(35), check = true, expected = null }: Save) =>
  supabase.rpc("kardex_save_product", {
    p_token: token, p_year: YEAR, p_month: MONTH, p_product_id: productId,
    p_exits: exits, p_entries: zeros(5), p_prev_balances: zeros(5),
    ...(check ? { p_check_version: true, p_expected_updated_at: expected } : {}),
  });

const load = async (token: string, productId: string) => {
  const { data, error } = await supabase.rpc("kardex_load_month", { p_token: token, p_year: YEAR, p_month: MONTH });
  expect(error).toBeNull();
  return (data as { product_id: string; updated_at: string; exits: number[] }[]).find((r) => r.product_id === productId);
};

describe("kardex_save_product con control de versión", () => {
  it("la función con versión existe (si falla con PGRST202, falta correr kardex_version_1.sql)", async () => {
    const { token } = await createTestCommunity("ver-existe");
    const productId = await anyProductId();
    const res = await save({ token, productId });
    expect(res.error?.code, "¿corriste supabase/kardex_version_1.sql?").not.toBe("PGRST202");
    expect(res.error, JSON.stringify(res.error)).toBeNull();
    expect(typeof res.data).toBe("string");
  });

  it("recorrido completo: fila nueva, guardar con la versión leída, conflicto con una vieja, y nada se pisa", async () => {
    const { token } = await createTestCommunity("ver-ciclo");
    const productId = await anyProductId();

    const v1 = (await save({ token, productId, exits: [2, ...zeros(34)] })).data as string;
    // La versión que devuelve el guardado es la que lee la carga del mes (mismo instante).
    const loaded = await load(token, productId);
    expect(Date.parse(loaded!.updated_at)).toBe(Date.parse(v1));

    // Con la versión TAL COMO la entregó la lectura (texto) el guardado se acepta: es lo que hace la pantalla.
    const v2 = (await save({ token, productId, exits: [3, ...zeros(34)], expected: loaded!.updated_at })).data as string;
    expect(Date.parse(v2)).toBeGreaterThan(Date.parse(v1));

    // Otra pantalla que todavía tiene v1: se rechaza y no pisa el 3.
    const stale = await save({ token, productId, exits: [99, ...zeros(34)], expected: loaded!.updated_at });
    expect(stale.error?.message).toContain("CONFLICTO_VERSION");
    expect((await load(token, productId))!.exits[0]).toBe(3);

    // «No había fila» cuando ya existe: conflicto.
    const created = await save({ token, productId, expected: null });
    expect(created.error?.message).toContain("CONFLICTO_VERSION");
  });

  it("un cliente anterior (sin versión) sigue guardando y cambia la versión: los nuevos lo notan", async () => {
    const { token } = await createTestCommunity("ver-viejo");
    const productId = await anyProductId();
    const v1 = (await save({ token, productId })).data as string;
    const legacy = await save({ token, productId, exits: [5, ...zeros(34)], check: false });
    expect(legacy.error, JSON.stringify(legacy.error)).toBeNull();
    expect((await load(token, productId))!.exits[0]).toBe(5);
    const afterLegacy = await save({ token, productId, expected: v1 });
    expect(afterLegacy.error?.message).toContain("CONFLICTO_VERSION");
  });

  it("la versión de una comunidad no sirve para la fila de otra, y un token falso se rechaza", async () => {
    const a = await createTestCommunity("ver-iso-a");
    const b = await createTestCommunity("ver-iso-b");
    const productId = await anyProductId();
    const va = (await save({ token: a.token, productId })).data as string;
    await save({ token: b.token, productId });
    const crossed = await save({ token: b.token, productId, expected: va });
    expect(crossed.error?.message).toContain("CONFLICTO_VERSION");
    const fake = await save({ token: "token-falso", productId });
    expect(fake.error?.message).toContain("SESION_INVALIDA");
  });

  it("las validaciones siguen valiendo con versión", async () => {
    const { token } = await createTestCommunity("ver-valida");
    const productId = await anyProductId();
    const short = await save({ token, productId, exits: zeros(30) });
    expect(short.error?.message).toContain("Datos incompletos");
    const negative = await save({ token, productId, exits: [-1, ...zeros(34)] });
    expect(negative.error?.message).toContain("Valores inválidos");
  });
});
