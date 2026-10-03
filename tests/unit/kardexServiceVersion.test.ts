import { beforeEach, describe, expect, it, vi } from "vitest";

// kardexService.saveProductData con control de versión (plan 012): qué parámetros manda y qué hace si el servidor aún no tiene la
// función nueva (kardex_version_1.sql sin correr). Cada prueba carga el módulo de cero: el aviso «sin control de versión» es del módulo.
const authedRpc = vi.fn();
vi.mock("@/lib/authedRpc", () => ({ authedRpc: (...args: unknown[]) => authedRpc(...args) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const V = "2026-03-01T10:00:00.123456+00:00";
const exits = [1];
const entries = [2];
const prev = [3];

async function load() {
  vi.resetModules();
  return (await import("@/lib/kardexService")).kardexService;
}
const argsOf = (call: number) => authedRpc.mock.calls[call][1] as Record<string, unknown>;

beforeEach(() => {
  authedRpc.mockReset();
  authedRpc.mockResolvedValue({ data: V, error: null });
});

describe("saveProductData con versión", () => {
  it("manda la versión TAL CUAL (texto con microsegundos) y pide comprobarla", async () => {
    const service = await load();
    await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    expect(authedRpc).toHaveBeenCalledTimes(1);
    expect(authedRpc.mock.calls[0][0]).toBe("kardex_save_product");
    expect(argsOf(0)).toMatchObject({ p_year: 2026, p_month: 2, p_product_id: "p1", p_check_version: true, p_expected_updated_at: V });
    expect(argsOf(0).p_expected_updated_at).toBe(V);
  });

  it("null significa «no había fila» y también pide comprobar", async () => {
    const service = await load();
    await service.saveProductData(2026, 2, "p1", exits, entries, prev, null);
    expect(argsOf(0)).toMatchObject({ p_check_version: true, p_expected_updated_at: null });
  });

  it("sin versión (undefined) guarda como antes, sin parámetros nuevos", async () => {
    const service = await load();
    await service.saveProductData(2026, 2, "p1", exits, entries, prev);
    expect(argsOf(0)).not.toHaveProperty("p_check_version");
    expect(argsOf(0)).not.toHaveProperty("p_expected_updated_at");
  });

  it("devuelve la versión nueva que respondió el servidor", async () => {
    const service = await load();
    const res = await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    expect(res).toEqual({ data: V, error: null });
  });

  it("un conflicto se devuelve tal cual, sin reintentar", async () => {
    authedRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "CONFLICTO_VERSION" } });
    const service = await load();
    const res = await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    expect(res.error?.message).toBe("CONFLICTO_VERSION");
    expect(authedRpc).toHaveBeenCalledTimes(1);
  });

  it("un error de red se devuelve tal cual (la cola decide si reintenta)", async () => {
    authedRpc.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    const service = await load();
    const res = await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    expect(res.error?.message).toBe("Failed to fetch");
    expect(authedRpc).toHaveBeenCalledTimes(1);
  });
});

describe("servidor sin la función nueva (PGRST202)", () => {
  it("guarda igual como antes, en vez de dejar de guardar", async () => {
    authedRpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })
      .mockResolvedValueOnce({ data: null, error: null });
    const service = await load();
    const res = await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    expect(authedRpc).toHaveBeenCalledTimes(2);
    expect(argsOf(0)).toHaveProperty("p_check_version", true);
    expect(argsOf(1)).not.toHaveProperty("p_check_version");
    expect(argsOf(1)).not.toHaveProperty("p_expected_updated_at");
    expect(res.error).toBeNull();
  });

  it("y no vuelve a intentar con versión (una sola llamada por guardado) hasta recargar la página", async () => {
    authedRpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "x" } })
      .mockResolvedValue({ data: null, error: null });
    const service = await load();
    await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    authedRpc.mockClear();
    await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    expect(authedRpc).toHaveBeenCalledTimes(1);
    expect(argsOf(0)).not.toHaveProperty("p_check_version");
  });

  it("otro código de error NO activa el modo sin versión", async () => {
    authedRpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } });
    const service = await load();
    await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    authedRpc.mockClear();
    await service.saveProductData(2026, 2, "p1", exits, entries, prev, V);
    expect(argsOf(0)).toHaveProperty("p_check_version", true);
  });
});
