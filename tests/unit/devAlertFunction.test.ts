import { describe, expect, it } from "vitest";
import { DEFAULTS, buildAlert, colombiaTime, createHandler, readConfig, scrub, secretsMatch, shouldAlert } from "../../supabase/functions/dev-alert/index";
import type { LogRow } from "../../supabase/functions/dev-alert/index";

// Edge Function `dev-alert` (plan 007, Fase A2): avisa por correo y Telegram cuando hay una racha de errores. Se prueba con
// un `fetch` falso que hace de Supabase, Resend y Telegram: lo importante es que NO avise sin racha ni sin la clave
// compartida, que avise una sola vez por turno, que un canal caído no tumbe al otro y que ningún secreto salga en logs ni respuestas.
const NOW = Date.parse("2026-10-02T17:00:00.000Z"); // 12:00 en Colombia
const SECRET = "clave-compartida-de-prueba";
const ENV: Record<string, string> = {
  ALERT_WEBHOOK_SECRET: SECRET,
  SUPABASE_URL: "https://proyecto.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-de-prueba",
  RESEND_API_KEY: "re_clave_de_prueba",
  ALERT_EMAIL_TO: "yo@ejemplo.com",
  TELEGRAM_BOT_TOKEN: "111:token-de-prueba",
  TELEGRAM_CHAT_ID: "987654",
};

const record: LogRow = {
  id: 7, created_at: "2026-10-02T16:59:30.000Z", community: "Maná", source: "rpc", level: "error",
  fn: "kardex_save_product", code: "P0001", message: "Datos incompletos", app_version: "abc1234",
};
const payload = (over: Record<string, unknown> = {}) => JSON.stringify({ type: "INSERT", table: "system_error_logs", schema: "public", record, old_record: null, ...over });

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
type Plan = {
  rows?: { level: string }[];            // lo que devuelve el conteo de reportes
  claimed?: unknown[];                    // filas que devuelve la actualización del turno
  countStatus?: number;
  countThrows?: boolean;                  // una excepción inesperada al consultar Supabase
  claimStatus?: number;
  resend?: number | "throw";
  telegram?: number | "throw";
  resendBody?: unknown;                   // lo que responde Resend cuando falla
  telegramBody?: unknown;                 // lo que responde Telegram cuando falla
  throwMessage?: string;                  // mensaje de la excepción de red (el real puede llevar la dirección con el token)
};

function setup(plan: Plan = {}, env: Record<string, string | undefined> = ENV) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? "GET", headers, body });
    const reply = (status: number, data: unknown = {}) => new Response(JSON.stringify(data), { status });
    if (url.includes("/rest/v1/system_error_logs")) {
      if (plan.countThrows) throw new Error("fallo inesperado de red");
      return reply(plan.countStatus ?? 200, plan.rows ?? []);
    }
    if (url.includes("/rest/v1/dev_alert_state")) {
      if (init?.method === "PATCH" && url.includes("last_alert_at=eq.")) return reply(200, []); // devolver el turno
      return reply(plan.claimStatus ?? 200, plan.claimed ?? [{ id: 1 }]);
    }
    if (url.startsWith("https://api.resend.com")) {
      if (plan.resend === "throw") throw new Error(plan.throwMessage ?? "red caída");
      return reply(plan.resend ?? 200, plan.resendBody ?? { id: "email-1" });
    }
    if (url.startsWith("https://api.telegram.org")) {
      if (plan.telegram === "throw") throw new Error(plan.throwMessage ?? "red caída");
      return reply(plan.telegram ?? 200, plan.telegramBody ?? { ok: true });
    }
    return reply(404);
  }) as typeof fetch;
  const handler = createHandler({ env: (n) => env[n], fetch: fakeFetch, now: () => NOW, log: (m) => logs.push(m) });
  const call = (body: string = payload(), headers: Record<string, string> = { "x-alert-secret": SECRET }, method = "POST") =>
    handler(new Request("https://f.supabase.co/functions/v1/dev-alert", { method, headers, body: method === "POST" ? body : undefined }));
  return { call, calls, logs };
}

const errors = (n: number) => Array.from({ length: n }, () => ({ level: "error" }));
const warnings = (n: number) => Array.from({ length: n }, () => ({ level: "warning" }));
const sent = (calls: Call[], host: string) => calls.filter((c) => c.url.startsWith(host));

describe("acceso: solo el webhook con la clave compartida", () => {
  it("solo acepta POST", async () => {
    const { call, calls } = setup();
    expect((await call("", {}, "GET")).status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it("sin ALERT_WEBHOOK_SECRET configurada nadie entra (ni con una clave vacía)", async () => {
    const { call, calls } = setup({}, { ...ENV, ALERT_WEBHOOK_SECRET: undefined });
    expect((await call(payload(), { "x-alert-secret": "" })).status).toBe(500);
    expect((await call(payload(), {})).status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it("sin la clave, con una clave equivocada o con una casi igual: 401 y no consulta nada", async () => {
    const { call, calls } = setup({ rows: errors(5) });
    const intentos: Record<string, string>[] = [{}, { "x-alert-secret": "otra" }, { "x-alert-secret": SECRET + "x" }, { "x-alert-secret": SECRET.slice(0, -1) }, { authorization: `Bearer ${SECRET}` }];
    for (const headers of intentos) {
      expect((await call(payload(), headers)).status).toBe(401);
    }
    expect(calls).toHaveLength(0);
  });

  it("secretsMatch compara por igual y rechaza vacíos, nulos y largos distintos", () => {
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("abc", "abd")).toBe(false);
    expect(secretsMatch("abc", "abcd")).toBe(false);
    expect(secretsMatch("abcd", "abc")).toBe(false);
    expect(secretsMatch(null, "abc")).toBe(false);
    expect(secretsMatch("abc", undefined)).toBe(false);
    expect(secretsMatch("", "")).toBe(false);
  });

  it("un cuerpo que no es JSON da 400, y un evento de otra tabla o de otro tipo se ignora sin consultar", async () => {
    const { call, calls } = setup({ rows: errors(5) });
    expect((await call("{no es json")).status).toBe(400);
    for (const body of [payload({ table: "otra_tabla" }), payload({ type: "UPDATE" }), payload({ record: null }), payload({ record: { community: 5, message: "x" } })]) {
      const res = await call(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ alerted: false, reason: "evento ignorado" });
    }
    expect(calls).toHaveLength(0);
  });
});

describe("modo prueba (x-alert-test: 1)", () => {
  const TEST = { "x-alert-secret": SECRET, "x-alert-test": "1" };

  it("manda un mensaje de prueba por los dos canales sin contar reportes, sin tomar el turno y sin pedir cuerpo", async () => {
    const { call, calls } = setup({ rows: [] });
    const res = await call("", TEST);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ test: true, email: "ok", telegram: "ok" });
    expect(calls.filter((c) => c.url.includes("/rest/v1/"))).toHaveLength(0);
    expect(sent(calls, "https://api.resend.com")[0].body).toMatchObject({ subject: "Kardex: prueba de alertas" });
    expect((sent(calls, "https://api.telegram.org")[0].body as { text: string }).text).toContain("prueba de alertas");
  });

  it("sin la clave compartida no hay modo prueba: 401 y no manda nada", async () => {
    const { call, calls } = setup();
    expect((await call("", { "x-alert-test": "1" })).status).toBe(401);
    expect((await call("", { "x-alert-secret": "otra", "x-alert-test": "1" })).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("solo el valor 1 activa la prueba; un canal caído no tumba al otro y si fallan los dos responde 502", async () => {
    const normal = setup({ rows: [] });
    expect(await (await normal.call(payload(), { ...TEST, "x-alert-test": "0" })).json()).toMatchObject({ alerted: false, reason: "sin racha" });

    const uno = setup({ resend: 500 });
    const r1 = await uno.call("", TEST);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ email: "error", telegram: "ok" });

    const ninguno = setup({ resend: 500, telegram: "throw" });
    expect((await ninguno.call("", TEST)).status).toBe(502);
  });

  it("tampoco filtra secretos en los logs ni en la respuesta", async () => {
    const { call, logs } = setup({ resend: "throw", telegram: "throw" });
    const res = await call("", TEST);
    const seen = logs.join(" | ") + (await res.text());
    for (const s of [SECRET, ENV.RESEND_API_KEY, ENV.TELEGRAM_BOT_TOKEN, ENV.ALERT_EMAIL_TO]) expect(seen).not.toContain(s as string);
  });
});

describe("cuándo avisa", () => {
  it("sin racha no avisa: 2 errores y 9 advertencias en la ventana", async () => {
    const { call, calls } = setup({ rows: [...errors(2), ...warnings(9)] });
    const res = await call();
    expect(await res.json()).toMatchObject({ alerted: false, reason: "sin racha", counts: { errors: 2, warnings: 9 } });
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    expect(sent(calls, "https://api.")).toHaveLength(0);
  });

  it("3 errores avisan; 10 advertencias también; 9 advertencias no", async () => {
    expect(shouldAlert({ errors: 3, warnings: 0 }, DEFAULTS)).toBe(true);
    expect(shouldAlert({ errors: 2, warnings: 0 }, DEFAULTS)).toBe(false);
    expect(shouldAlert({ errors: 0, warnings: 10 }, DEFAULTS)).toBe(true);
    expect(shouldAlert({ errors: 0, warnings: 9 }, DEFAULTS)).toBe(false);
    const { call } = setup({ rows: errors(3) });
    expect(await (await call()).json()).toMatchObject({ alerted: true });
  });

  it("los umbrales se pueden cambiar con variables de entorno, y los valores inválidos usan los de siempre", async () => {
    expect(readConfig((n) => ({ ALERT_ERRORS: "1", ALERT_WARNINGS: "2", ALERT_WINDOW_MIN: "5", ALERT_COOLDOWN_MIN: "60" })[n])).toEqual({ errors: 1, warnings: 2, windowMin: 5, cooldownMin: 60 });
    expect(readConfig((n) => ({ ALERT_ERRORS: "0", ALERT_WARNINGS: "-4", ALERT_WINDOW_MIN: "abc", ALERT_COOLDOWN_MIN: "" })[n])).toEqual(DEFAULTS);
    const { call } = setup({ rows: errors(1) }, { ...ENV, ALERT_ERRORS: "1" });
    expect(await (await call()).json()).toMatchObject({ alerted: true });
  });

  it("cuenta solo la ventana de 10 minutos y pide máximo 1000 filas", async () => {
    const { call, calls } = setup({ rows: [] });
    await call();
    const count = calls.find((c) => c.url.includes("/rest/v1/system_error_logs"))!;
    expect(decodeURIComponent(count.url)).toContain("created_at=gte.2026-10-02T16:50:00.000Z");
    expect(count.url).toContain("limit=1000");
    expect(count.headers.authorization).toBe("Bearer service-role-de-prueba");
    expect(count.headers.apikey).toBe("service-role-de-prueba");
  });
});

describe("un solo aviso por turno (enfriamiento de 30 minutos)", () => {
  it("toma el turno con una actualización condicional: solo si el último aviso es anterior a hace 30 minutos", async () => {
    const { call, calls } = setup({ rows: errors(3) });
    await call();
    const claim = calls.find((c) => c.method === "PATCH")!;
    expect(decodeURIComponent(claim.url)).toContain("dev_alert_state?id=eq.1&last_alert_at=lt.2026-10-02T16:30:00.000Z");
    expect(claim.body).toEqual({ last_alert_at: "2026-10-02T17:00:00.000Z" });
    expect(claim.headers.prefer).toBe("return=representation");
  });

  it("si otro reporte ya tomó el turno (no se actualizó ninguna fila), no manda nada", async () => {
    const { call, calls } = setup({ rows: errors(5), claimed: [] });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alerted: false, reason: "ya se avisó hace poco" });
    expect(sent(calls, "https://api.")).toHaveLength(0);
  });

  it("si no se puede consultar el conteo o el turno, responde 502 y no avisa", async () => {
    for (const plan of [{ rows: errors(5), countStatus: 500 }, { rows: errors(5), claimStatus: 500 }]) {
      const { call, calls } = setup(plan);
      expect((await call()).status).toBe(502);
      expect(sent(calls, "https://api.")).toHaveLength(0);
    }
  });
});

describe("una excepción inesperada", () => {
  it("queda en el log (nombre y mensaje) y la respuesta es un JSON claro sin la causa, no el «Internal Server Error» en texto plano", async () => {
    const { call, logs } = setup({ rows: errors(3), countThrows: true });
    const res = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Error interno" });
    expect(logs).toEqual(["Error interno: Error: fallo inesperado de red"]);
  });

  it("el log tampoco lleva secretos ni lo que mandó quien llamó", async () => {
    const { call, logs } = setup({ rows: errors(3), countThrows: true });
    await call(payload({ record: { ...record, message: "texto-del-cuerpo" } }));
    const seen = logs.join(" | ");
    for (const s of [SECRET, ENV.SUPABASE_SERVICE_ROLE_KEY, ENV.RESEND_API_KEY, ENV.TELEGRAM_BOT_TOKEN, "texto-del-cuerpo"]) expect(seen).not.toContain(s as string);
  });
});

describe("el aviso", () => {
  it("sale por correo (Resend) y por Telegram, con el último reporte", async () => {
    const { call, calls } = setup({ rows: [...errors(3), ...warnings(1)] });
    const res = await call();
    expect(await res.json()).toMatchObject({ alerted: true, email: "ok", telegram: "ok", counts: { errors: 3, warnings: 1 } });

    const mail = sent(calls, "https://api.resend.com")[0];
    expect(mail.url).toBe("https://api.resend.com/emails");
    expect(mail.headers.authorization).toBe("Bearer re_clave_de_prueba");
    expect(mail.body).toMatchObject({ from: "Kardex Alertas <onboarding@resend.dev>", to: ["yo@ejemplo.com"], subject: "Kardex: alerta de errores (3 errores, 1 advertencia)" });
    const text = (mail.body as { text: string }).text;
    for (const piece of ["3 errores y 1 advertencia en los últimos 10 minutos", "Comunidad: Maná", "kardex_save_product", "Código: P0001", "Mensaje: Datos incompletos", "Versión: abc1234", "2026-10-02 11:59"]) {
      expect(text, piece).toContain(piece);
    }

    const tg = sent(calls, "https://api.telegram.org")[0];
    expect(tg.url).toBe("https://api.telegram.org/bot111:token-de-prueba/sendMessage");
    expect(tg.body).toMatchObject({ chat_id: "987654", text });
    // Texto plano: sin parse_mode, un mensaje con símbolos no puede romper el formato ni inyectar enlaces.
    expect(Object.keys(tg.body as object).sort()).toEqual(["chat_id", "text"]);
  });

  it("el remitente se puede cambiar (para cuando haya dominio verificado en Resend)", async () => {
    const { call, calls } = setup({ rows: errors(3) }, { ...ENV, ALERT_EMAIL_FROM: "Alertas <alertas@midominio.co>" });
    await call();
    expect(sent(calls, "https://api.resend.com")[0].body).toMatchObject({ from: "Alertas <alertas@midominio.co>" });
  });

  it("si un canal falla, el otro sale igual y el turno se queda tomado", async () => {
    for (const plan of [{ resend: 500 }, { resend: "throw" }, { telegram: 400 }, { telegram: "throw" }] as Plan[]) {
      const { call, calls } = setup({ rows: errors(3), ...plan });
      const res = await call();
      const body = await res.json();
      expect(res.status, JSON.stringify(plan)).toBe(200);
      expect(body.alerted).toBe(true);
      expect([body.email, body.telegram].sort()).toEqual(["error", "ok"]);
      expect(calls.filter((c) => c.url.includes("last_alert_at=eq."))).toHaveLength(0); // no se devuelve el turno
    }
  });

  it("un canal sin configurar se omite y el otro avisa", async () => {
    const { call } = setup({ rows: errors(3) }, { ...ENV, TELEGRAM_BOT_TOKEN: undefined });
    expect(await (await call()).json()).toMatchObject({ alerted: true, email: "ok", telegram: "sin configurar" });
  });

  it("si no salió por NINGÚN canal, responde 502 y devuelve el turno (para reintentar con el siguiente reporte)", async () => {
    for (const plan of [{ resend: 500, telegram: 500 }, { resend: "throw", telegram: "throw" }] as Plan[]) {
      const { call, calls } = setup({ rows: errors(3), ...plan });
      const res = await call();
      expect(res.status).toBe(502);
      expect((await res.json()).alerted).toBe(false);
      const revert = calls.find((c) => c.url.includes("last_alert_at=eq."))!;
      expect(decodeURIComponent(revert.url)).toContain("last_alert_at=eq.2026-10-02T17:00:00.000Z");
      expect(revert.body).toEqual({ last_alert_at: "1970-01-01T00:00:00.000Z" });
    }
    const none = setup({ rows: errors(3) }, { ...ENV, RESEND_API_KEY: undefined, TELEGRAM_CHAT_ID: undefined });
    expect((await none.call()).status).toBe(502);
  });
});

describe("diagnóstico de un canal que falla", () => {
  const TEST = { "x-alert-secret": SECRET, "x-alert-test": "1" };

  it("Telegram: dice el código y el motivo que da Telegram (token malo, chat inexistente, bot sin iniciar)", async () => {
    for (const [status, description] of [[401, "Unauthorized"], [400, "Bad Request: chat not found"], [403, "Forbidden: bot can't initiate conversation with a user"]] as const) {
      const { call } = setup({ telegram: status, telegramBody: { ok: false, error_code: status, description } });
      const res = await call("", TEST);
      expect(res.status).toBe(200); // el correo sí salió
      expect(await res.json()).toEqual({ test: true, email: "ok", telegram: "error", telegram_detail: `HTTP ${status}: ${description}` });
    }
  });

  it("Resend: dice el motivo (p. ej. el remitente de pruebas solo envía al correo de la propia cuenta)", async () => {
    const { call, logs } = setup({ resend: 403, resendBody: { name: "validation_error", message: "You can only send testing emails to your own email address" } });
    expect(await (await call("", TEST)).json()).toEqual({
      test: true, email: "error", telegram: "ok", email_detail: "HTTP 403: You can only send testing emails to your own email address",
    });
    expect(logs.join(" | ")).toContain("correo=error (HTTP 403: You can only send testing emails to your own email address)");
  });

  it("si el servicio repite un secreto en su mensaje, no sale (se tapa)", async () => {
    const { call, logs } = setup({ telegram: 401, telegramBody: { ok: false, description: `Unauthorized token ${ENV.TELEGRAM_BOT_TOKEN} chat ${ENV.TELEGRAM_CHAT_ID}` } });
    const res = await call("", TEST);
    const seen = JSON.stringify(await res.json()) + logs.join(" | ");
    expect(seen).toContain("[oculto]");
    for (const secret of [ENV.TELEGRAM_BOT_TOKEN, ENV.TELEGRAM_CHAT_ID]) expect(seen).not.toContain(secret as string);
  });

  it("una respuesta que no es JSON se acota; de una excepción de red NO se toma el mensaje (puede llevar el token en la dirección)", async () => {
    const largo = setup({ telegram: 502, telegramBody: undefined });
    expect(JSON.stringify(await (await largo.call("", TEST)).json())).toContain("telegram_detail");

    const { call, logs } = setup({ telegram: "throw", resend: "throw", throwMessage: "error sending request for url (https://api.telegram.org/bot111:token-de-prueba/sendMessage)" });
    const res = await call("", TEST);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ email_detail: "no se pudo conectar con Resend", telegram_detail: "no se pudo conectar con Telegram" });
    const seen = JSON.stringify(body) + logs.join(" | ");
    expect(seen).not.toContain("token-de-prueba");
    expect(seen).not.toContain("api.telegram.org");
  });

  it("si todo sale bien no hay detalles; el aviso real también los lleva en la respuesta y el log", async () => {
    const ok = setup();
    expect(await (await ok.call("", TEST)).json()).toEqual({ test: true, email: "ok", telegram: "ok" });

    const real = setup({ rows: errors(3), telegram: 400, telegramBody: { description: "Bad Request: chat not found" } });
    const res = await real.call();
    expect(await res.json()).toMatchObject({ alerted: true, email: "ok", telegram: "error", telegram_detail: "HTTP 400: Bad Request: chat not found" });
    expect(real.logs.join(" | ")).toContain("telegram=error (HTTP 400: Bad Request: chat not found)");
  });

  it("scrub tapa todas las apariciones, ignora secretos muy cortos y acota a 160 caracteres", () => {
    expect(scrub("a SECRETO b SECRETO", ["SECRETO"])).toBe("a [oculto] b [oculto]");
    expect(scrub("abc", ["abc"])).toBe("abc"); // menos de 4 caracteres: no se tapa (taparía palabras comunes)
    expect(scrub("x".repeat(300), [])).toHaveLength(160);
    expect(scrub("hola", [undefined])).toBe("hola");
  });
});

describe("secretos", () => {
  it("ningún secreto aparece en los logs ni en las respuestas, ni cuando todo falla", async () => {
    const secrets = [SECRET, ENV.SUPABASE_SERVICE_ROLE_KEY, ENV.RESEND_API_KEY, ENV.TELEGRAM_BOT_TOKEN, ENV.ALERT_EMAIL_TO];
    for (const plan of [{ rows: errors(3) }, { rows: errors(3), resend: "throw", telegram: "throw" }, { rows: errors(3), countStatus: 500 }, { rows: errors(3), claimStatus: 500 }] as Plan[]) {
      const { call, logs } = setup(plan);
      const res = await call();
      const seen = logs.join("\n") + (await res.text());
      for (const s of secrets) expect(seen, `${s} en ${JSON.stringify(plan)}`).not.toContain(s as string);
    }
  });
});

describe("el texto del aviso", () => {
  it("singular y plural", () => {
    expect(buildAlert(record, { errors: 1, warnings: 1 }, DEFAULTS, NOW).subject).toBe("Kardex: alerta de errores (1 error, 1 advertencia)");
    expect(buildAlert(record, { errors: 4, warnings: 0 }, DEFAULTS, NOW).subject).toBe("Kardex: alerta de errores (4 errores, 0 advertencias)");
  });

  it("la hora es la de Colombia (UTC-5), también al cruzar la medianoche, y sin fecha usa la actual", () => {
    expect(colombiaTime("2026-10-02T17:05:00Z", 0)).toBe("2026-10-02 12:05");
    expect(colombiaTime("2026-10-03T03:30:00Z", 0)).toBe("2026-10-02 22:30");
    expect(colombiaTime("2026-01-01T04:59:00Z", 0)).toBe("2025-12-31 23:59");
    expect(colombiaTime(undefined, NOW)).toBe("2026-10-02 12:00");
    expect(colombiaTime("no es una fecha", NOW)).toBe("2026-10-02 12:00");
  });

  it("sin código ni versión no deja huecos feos", () => {
    const { text } = buildAlert({ ...record, code: null, app_version: undefined }, { errors: 3, warnings: 0 }, DEFAULTS, NOW);
    expect(text).toContain("- Función: kardex_save_product\n");
    expect(text).toContain("Versión: desconocida");
    expect(text).not.toContain("Código:");
  });
});
