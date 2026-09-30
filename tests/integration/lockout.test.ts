import { describe, expect, it } from "vitest";
import { TEST_PIN, createTestCommunity, supabase } from "./helpers";

// Esta prueba deja una comunidad ZZZ_TEST_BORRAR_AUTO_* bloqueada 15 minutos;
// no importa: usa una comunidad nueva y se borra con cleanup_test_data.sql.
describe("bloqueo por intentos fallidos de PIN", () => {
  it("tras 5 fallos seguidos bloquea la comunidad, incluso con el PIN correcto", async () => {
    const { name } = await createTestCommunity("lock");

    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data, error } = await supabase.rpc("login_community", { p_name: name, p_pin: "0000" });
      expect(error, `intento ${attempt}`).toBeNull();
      expect(data, `intento ${attempt}`).toBeNull();
    }

    const sixth = await supabase.rpc("login_community", { p_name: name, p_pin: "0000" });
    expect(sixth.error?.message).toContain("PIN_BLOQUEADO");

    const correctWhileLocked = await supabase.rpc("login_community", { p_name: name, p_pin: TEST_PIN });
    expect(correctWhileLocked.error?.message).toContain("PIN_BLOQUEADO");
  });

  it("un PIN correcto antes del límite reinicia el contador", async () => {
    const { name } = await createTestCommunity("reset");

    for (let i = 0; i < 4; i++) {
      await supabase.rpc("login_community", { p_name: name, p_pin: "0000" });
    }
    const ok = await supabase.rpc("login_community", { p_name: name, p_pin: TEST_PIN });
    expect(typeof ok.data).toBe("string");

    // Con el contador en cero, otros 4 fallos siguen sin bloquear.
    for (let i = 0; i < 4; i++) {
      const { error } = await supabase.rpc("login_community", { p_name: name, p_pin: "0000" });
      expect(error).toBeNull();
    }
    const stillOk = await supabase.rpc("login_community", { p_name: name, p_pin: TEST_PIN });
    expect(typeof stillOk.data).toBe("string");
  });
});
