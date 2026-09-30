import { describe, expect, it } from "vitest";
import { anyProductId, createTestCommunity, supabase } from "./helpers";

// CICLO COMPLETO de la cuenta de administradora. OPT-IN porque CAMBIA la
// contraseña de la cuenta real y termina bloqueándola 15 minutos:
//
//   1. Antes: corre supabase/admin_reset_password.sql con la contraseña que
//      tengas en ADMIN_TEST_PASSWORD (.env.local, nunca en git).
//   2. Corre:  $env:RUN_ADMIN_LIFECYCLE=1; npm run test:integration
//   3. Después: la cuenta queda con otra contraseña y bloqueada. ANTES de
//      entregarla a la nutricionista, vuelve a correr admin_reset_password.sql
//      con la contraseña temporal que le vas a dar.
//
// NUNCA la corras después de haber entregado la cuenta a la nutricionista sin
// avisarle: le cambiaría la contraseña.
const enabled = process.env.RUN_ADMIN_LIFECYCLE === "1" && !!process.env.ADMIN_TEST_PASSWORD;

const TEMP = process.env.ADMIN_TEST_PASSWORD ?? "";
const suffix = Math.random().toString(36).slice(2, 8);
const NEW1 = `Clave-de-prueba-uno-${suffix}`;
const NEW2 = `Clave-de-prueba-dos-${suffix}`;
const NEW3 = `Clave-de-prueba-tres-${suffix}`;

type Login = { token: string; must_change: boolean } | null;
const login = async (password: string) => {
  const { data, error } = await supabase.rpc("admin_login", { p_password: password });
  return { data: data as Login, error };
};

// (Las pruebas de un mismo bloque corren en orden; el estado se comparte entre ellas.)
describe.skipIf(!enabled)("ciclo de vida de la cuenta de administradora", () => {
  // Comunidad de prueba compartida entre los bloques de lecturas y de envíos.
  const testCommunity = { name: "", token: "", productId: "" };

  const state: { pendingToken: string; tokenB: string; recoveryCode: string; newCode: string } = {
    pendingToken: "",
    tokenB: "",
    recoveryCode: "",
    newCode: "",
  };

  it("una contraseña incorrecta no entra", async () => {
    const { data, error } = await login("contraseña-incorrecta-123");
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("la contraseña temporal entra y marca que debe cambiarse", async () => {
    const { data } = await login(TEMP);
    expect(data?.must_change).toBe(true);
    state.pendingToken = data!.token;
  });

  it("mientras es temporal, solo se puede cambiar la contraseña (ni ping ni lecturas)", async () => {
    const ping = await supabase.rpc("admin_ping", { p_token: state.pendingToken });
    expect(ping.error?.message).toContain("DEBE_CAMBIAR_CLAVE");

    const overview = await supabase.rpc("admin_communities_overview", { p_token: state.pendingToken, p_year: 2026, p_month: 8 });
    expect(overview.error?.message).toContain("DEBE_CAMBIAR_CLAVE");
  });

  it("cambiar con la contraseña actual equivocada devuelve ok=false", async () => {
    const { data, error } = await supabase.rpc("admin_change_password", {
      p_token: state.pendingToken,
      p_current: "no-es-la-actual-123",
      p_new: NEW1,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false, recovery_code: null });
  });

  it("rechaza una contraseña nueva demasiado corta", async () => {
    const { error } = await supabase.rpc("admin_change_password", {
      p_token: state.pendingToken,
      p_current: TEMP,
      p_new: "corta",
    });
    expect(error?.message).toContain("Contraseña inválida");
  });

  it("rechaza una contraseña nueva igual a la actual", async () => {
    const { error } = await supabase.rpc("admin_change_password", {
      p_token: state.pendingToken,
      p_current: TEMP,
      p_new: TEMP,
    });
    expect(error?.message).toContain("distinta");
  });

  it("el primer cambio funciona y entrega el código de recuperación (20 caracteres)", async () => {
    const { data, error } = await supabase.rpc("admin_change_password", {
      p_token: state.pendingToken,
      p_current: TEMP,
      p_new: NEW1,
    });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.recovery_code).toMatch(/^[0-9A-F]{20}$/);
    state.recoveryCode = data.recovery_code;
  });

  it("tras el cambio la sesión ya puede usarse", async () => {
    const { data, error } = await supabase.rpc("admin_ping", { p_token: state.pendingToken });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("la contraseña temporal ya no entra; la nueva sí y ya no pide cambio", async () => {
    expect((await login(TEMP)).data).toBeNull();
    const { data } = await login(NEW1);
    expect(data?.must_change).toBe(false);
    state.tokenB = data!.token;
  });

  it("un token de administradora no sirve para leer datos de comunidades", async () => {
    const { error } = await supabase.rpc("kardex_load_month", { p_token: state.tokenB, p_year: 2026, p_month: 8 });
    expect(error?.message).toContain("SESION_INVALIDA");
  });

  it("el cambio voluntario pide la contraseña actual, no rota el código y cierra las demás sesiones", async () => {
    const { data, error } = await supabase.rpc("admin_change_password", {
      p_token: state.tokenB,
      p_current: NEW1,
      p_new: NEW2,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: true, recovery_code: null });

    const old = await supabase.rpc("admin_ping", { p_token: state.pendingToken });
    expect(old.error?.message).toContain("SESION_ADMIN_INVALIDA");
    const current = await supabase.rpc("admin_ping", { p_token: state.tokenB });
    expect(current.error).toBeNull();
  });

  // --- Fase B: lecturas de administradora (con la sesión ya válida, tokenB) ---
  describe("lecturas de administradora (solo lectura)", () => {
    const admin = testCommunity;
    const YEAR = 2026;
    const MONTH = 8;

    it("prepara una comunidad de prueba con datos solo en la semana 1 y un ajuste", async () => {
      const community = await createTestCommunity("adminread");
      admin.name = community.name;
      admin.token = community.token;
      admin.productId = await anyProductId();

      const exits = Array(35).fill(0);
      exits[1] = 1.5;
      const saved = await supabase.rpc("kardex_save_product", {
        p_token: admin.token,
        p_year: YEAR,
        p_month: MONTH,
        p_product_id: admin.productId,
        p_exits: exits,
        p_entries: [3, 0, 0, 0, 0],
        p_prev_balances: [0, 1.5, 1.5, 1.5, 1.5],
      });
      expect(saved.error).toBeNull();

      const ajuste = await supabase.rpc("kardex_insert_ajuste", {
        p_token: admin.token,
        p_product_id: admin.productId,
        p_year: YEAR,
        p_month: MONTH,
        p_week_index: 0,
        p_saldo_anterior: 0,
        p_saldo_nuevo: 0,
        p_motivo: "prueba de lectura de administradora",
      });
      expect(ajuste.error).toBeNull();
    });

    it("el resumen incluye la comunidad con sus semanas con registros (solo la 1)", async () => {
      const { data, error } = await supabase.rpc("admin_communities_overview", {
        p_token: state.tokenB,
        p_year: YEAR,
        p_month: MONTH,
      });
      expect(error).toBeNull();
      const row = data.find((c: { name: string }) => c.name === admin.name);
      expect(row).toBeDefined();
      expect(row.products_count).toBe(1);
      expect(row.weeks_active).toEqual([true, false, false, false, false]);
      expect(row.last_update).not.toBeNull();
      expect(row).not.toHaveProperty("pin_hash");
    });

    it("el resumen de otro mes muestra esa comunidad sin registros", async () => {
      const { data } = await supabase.rpc("admin_communities_overview", { p_token: state.tokenB, p_year: YEAR, p_month: 0 });
      const row = data.find((c: { name: string }) => c.name === admin.name);
      expect(row.products_count).toBe(0);
      expect(row.weeks_active).toEqual([false, false, false, false, false]);
    });

    it("lee el kardex, los ajustes y los meses de cualquier comunidad", async () => {
      const month = await supabase.rpc("admin_load_month", { p_token: state.tokenB, p_community: admin.name, p_year: YEAR, p_month: MONTH });
      expect(month.error).toBeNull();
      expect(month.data).toHaveLength(1);
      expect(month.data[0].entries).toEqual([3, 0, 0, 0, 0]);
      expect(month.data[0].exits[1]).toBe(1.5);

      const ajustes = await supabase.rpc("admin_load_ajustes", { p_token: state.tokenB, p_community: admin.name, p_year: YEAR, p_month: MONTH });
      expect(ajustes.data).toHaveLength(1);

      const history = await supabase.rpc("admin_load_ajustes_history", { p_token: state.tokenB, p_community: admin.name });
      expect(history.data).toHaveLength(1);

      const months = await supabase.rpc("admin_months_with_data", { p_token: state.tokenB, p_community: admin.name });
      expect(months.data).toEqual([{ year: YEAR, month: MONTH }]);
    });

    it("una comunidad inexistente devuelve listas vacías, no errores", async () => {
      const month = await supabase.rpc("admin_load_month", { p_token: state.tokenB, p_community: "ZZZ_TEST_no_existe", p_year: YEAR, p_month: MONTH });
      expect(month.error).toBeNull();
      expect(month.data).toEqual([]);
    });

    it("las funciones de lectura rechazan tokens falsos y tokens de comunidad", async () => {
      for (const token of ["token-falso", admin.token]) {
        for (const call of [
          supabase.rpc("admin_communities_overview", { p_token: token, p_year: YEAR, p_month: MONTH }),
          supabase.rpc("admin_load_month", { p_token: token, p_community: admin.name, p_year: YEAR, p_month: MONTH }),
          supabase.rpc("admin_months_with_data", { p_token: token, p_community: admin.name }),
        ]) {
          const { error } = await call;
          expect(error?.message).toContain("SESION_ADMIN_INVALIDA");
        }
      }
    });

    it("la administradora no puede escribir: no existe ninguna función de escritura con su token", async () => {
      const { error } = await supabase.rpc("kardex_save_product", {
        p_token: state.tokenB,
        p_year: YEAR,
        p_month: MONTH,
        p_product_id: admin.productId,
        p_exits: Array(35).fill(0),
        p_entries: [0, 0, 0, 0, 0],
        p_prev_balances: [0, 0, 0, 0, 0],
      });
      expect(error?.message).toContain("SESION_INVALIDA");
    });
  });

  // --- Fase C: envíos de semana, campanita y revisión (tokenB sigue válido) ---
  describe("envíos de semana, campanita y revisión", () => {
    const YEAR = 2026;
    const MONTH = 8;
    let submissionId = "";

    // Se reutiliza la comunidad de prueba (con datos en la semana 1) creada en el bloque de lecturas.
    const adminState = () => testCommunity;

    it("prepara: la comunidad de prueba envía su semana 1", async () => {
      expect(testCommunity.name).not.toBe("");
      const { error } = await supabase.rpc("kardex_submit_week", {
        p_token: adminState().token,
        p_year: YEAR,
        p_month: MONTH,
        p_week_index: 0,
      });
      expect(error).toBeNull();
    });

    it("el estado de las semanas muestra el envío sin revisar ni modificar", async () => {
      const { data, error } = await supabase.rpc("admin_week_statuses", { p_token: state.tokenB, p_year: YEAR, p_month: MONTH });
      expect(error).toBeNull();
      const row = data.find((s: { community: string }) => s.community === adminState().name);
      expect(row).toMatchObject({ week_index: 0, submit_count: 1, reviewed_at: null, modified: false });
    });

    it("la campanita incluye el envío", async () => {
      const { data, error } = await supabase.rpc("admin_notifications", { p_token: state.tokenB });
      expect(error).toBeNull();
      const row = data.find((n: { community: string }) => n.community === adminState().name);
      expect(row).toMatchObject({ year: YEAR, month: MONTH, week_index: 0, modified: false });
      submissionId = row.id;
    });

    it("marcar como revisada la saca de la campanita", async () => {
      const reviewed = await supabase.rpc("admin_mark_reviewed", { p_token: state.tokenB, p_id: submissionId });
      expect(reviewed.error).toBeNull();

      const { data } = await supabase.rpc("admin_notifications", { p_token: state.tokenB });
      expect(data.some((n: { id: string }) => n.id === submissionId)).toBe(false);

      const statuses = await supabase.rpc("admin_week_statuses", { p_token: state.tokenB, p_year: YEAR, p_month: MONTH });
      const row = statuses.data.find((s: { community: string }) => s.community === adminState().name);
      expect(row.reviewed_at).not.toBeNull();
      expect(row.modified).toBe(false);
    });

    it("si la comunidad cambia la semana después de revisada, vuelve a la campanita como modificada", async () => {
      const exits = Array(35).fill(0);
      exits[1] = 1.5;
      const saved = await supabase.rpc("kardex_save_product", {
        p_token: adminState().token,
        p_year: YEAR,
        p_month: MONTH,
        p_product_id: adminState().productId,
        p_exits: exits,
        p_entries: [9, 0, 0, 0, 0], // antes eran 3
        p_prev_balances: [0, 7.5, 7.5, 7.5, 7.5],
      });
      expect(saved.error).toBeNull();

      const { data } = await supabase.rpc("admin_notifications", { p_token: state.tokenB });
      const row = data.find((n: { id: string }) => n.id === submissionId);
      expect(row).toBeDefined();
      expect(row.modified).toBe(true);
    });

    it("revisarla de nuevo acepta los cambios: deja de estar modificada", async () => {
      await supabase.rpc("admin_mark_reviewed", { p_token: state.tokenB, p_id: submissionId });
      const { data } = await supabase.rpc("admin_notifications", { p_token: state.tokenB });
      expect(data.some((n: { id: string }) => n.id === submissionId)).toBe(false);
    });

    it("reenviar la semana la devuelve a la campanita, sin revisar", async () => {
      const { error } = await supabase.rpc("kardex_submit_week", {
        p_token: adminState().token,
        p_year: YEAR,
        p_month: MONTH,
        p_week_index: 0,
      });
      expect(error).toBeNull();

      const { data } = await supabase.rpc("admin_notifications", { p_token: state.tokenB });
      const row = data.find((n: { id: string }) => n.id === submissionId);
      expect(row).toMatchObject({ submit_count: 2, modified: false });
    });

    it("marcar un envío inexistente da error claro", async () => {
      const { error } = await supabase.rpc("admin_mark_reviewed", {
        p_token: state.tokenB,
        p_id: "00000000-0000-0000-0000-000000000000",
      });
      expect(error?.message).toContain("Envío no encontrado");
    });

    it("las funciones nuevas rechazan tokens falsos", async () => {
      for (const call of [
        supabase.rpc("admin_week_statuses", { p_token: "token-falso", p_year: YEAR, p_month: MONTH }),
        supabase.rpc("admin_notifications", { p_token: "token-falso" }),
        supabase.rpc("admin_mark_reviewed", { p_token: "token-falso", p_id: submissionId }),
      ]) {
        const { error } = await call;
        expect(error?.message).toContain("SESION_ADMIN_INVALIDA");
      }
    });
  });

  it("recuperar con un código equivocado devuelve ok=false", async () => {
    const { data, error } = await supabase.rpc("admin_recover_password", { p_code: "0".repeat(20), p_new: NEW3 });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false, recovery_code: null });
  });

  it("recuperar con el código correcto pero una contraseña corta falla sin gastar el código", async () => {
    const { error } = await supabase.rpc("admin_recover_password", { p_code: state.recoveryCode, p_new: "corta" });
    expect(error?.message).toContain("Contraseña inválida");
  });

  it("recuperar con el código correcto cambia la contraseña, cierra sesiones y entrega un código nuevo", async () => {
    // El código se acepta sin importar mayúsculas/espacios.
    const { data, error } = await supabase.rpc("admin_recover_password", {
      p_code: ` ${state.recoveryCode.toLowerCase()} `,
      p_new: NEW3,
    });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.recovery_code).toMatch(/^[0-9A-F]{20}$/);
    expect(data.recovery_code).not.toBe(state.recoveryCode);
    state.newCode = data.recovery_code;

    const oldSession = await supabase.rpc("admin_ping", { p_token: state.tokenB });
    expect(oldSession.error?.message).toContain("SESION_ADMIN_INVALIDA");
  });

  it("el código de recuperación es de un solo uso", async () => {
    const { data } = await supabase.rpc("admin_recover_password", { p_code: state.recoveryCode, p_new: NEW1 });
    expect(data.ok).toBe(false);
  });

  it("después de recuperar, entra con la contraseña nueva y no con las anteriores", async () => {
    expect((await login(NEW2)).data).toBeNull();
    expect((await login(NEW3)).data?.must_change).toBe(false);
  });

  it("5 intentos fallidos bloquean la cuenta, incluso con la contraseña correcta", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data, error } = await login("contraseña-incorrecta-123");
      expect(error, `intento ${attempt}`).toBeNull();
      expect(data, `intento ${attempt}`).toBeNull();
    }
    const sixth = await login("contraseña-incorrecta-123");
    expect(sixth.error?.message).toContain("ADMIN_BLOQUEADO");

    const correct = await login(NEW3);
    expect(correct.error?.message).toContain("ADMIN_BLOQUEADO");
  });
});
