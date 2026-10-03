// Alertas al desarrollador (plan 007, Fase A2). Edge Function de Supabase: un trigger de la base (supabase/dev_alerts_2.sql; o un Database Webhook del panel) la llama cada vez que se guarda
// una fila en `system_error_logs` (ver supabase/dev_errors_1.sql). Si hay una racha de errores, avisa por correo (Resend) y por
// Telegram; si no, no hace nada.
//
// ES UN SOLO ARCHIVO a propósito: se pega tal cual en el editor del panel de Supabase (Edge Functions → Deploy a new function →
// Via Editor), que no deja usar otros archivos del repositorio. El editor no tiene control de versiones: ESTE archivo es la
// fuente de verdad; el panel solo recibe una copia. Los pasos de despliegue están en planes/007-panel-dev.md.
//
// SECRETOS (se cargan en el panel: Edge Functions → Secrets; NUNCA en el código ni en el repositorio):
//   ALERT_WEBHOOK_SECRET  clave compartida con el webhook (cabecera `x-alert-secret`); sin ella la función rechaza todo
//   RESEND_API_KEY        clave de Resend
//   ALERT_EMAIL_TO        correo que recibe la alerta
//   TELEGRAM_BOT_TOKEN    token del bot
//   TELEGRAM_CHAT_ID      chat al que escribe el bot
// OPCIONALES: ALERT_EMAIL_FROM (por defecto el remitente de pruebas de Resend), ALERT_ERRORS (3), ALERT_WARNINGS (10),
//   ALERT_WINDOW_MIN (10), ALERT_COOLDOWN_MIN (30).
// Ya vienen puestos por Supabase: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
//
// PRUEBA DE CANALES: una llamada con la clave compartida y la cabecera `x-alert-test: 1` manda un mensaje de prueba por correo y
// Telegram, sin contar reportes ni tomar el turno.
//
// Qué avisa: cuando en los últimos 10 minutos hay 3 o más errores (o 10 o más advertencias) de cualquier comunidad, y como
// máximo UN aviso cada 30 minutos (el turno se toma con una actualización condicional en `dev_alert_state`, así dos reportes
// simultáneos no mandan dos avisos). Lleva el último reporte, que ya viene limpio del servidor: sin argumentos de llamadas ni
// cantidades del kardex.

// Lo mínimo de Deno que se usa, declarado para que `tsc` del proyecto compile este archivo (en Deno existe de verdad).
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): unknown };

export type LogRow = {
  id?: number;
  created_at?: string;
  community: string;
  source: string;
  level: "warning" | "error";
  fn: string;
  code?: string | null;
  message: string;
  app_version?: string;
};

export type Config = { errors: number; warnings: number; windowMin: number; cooldownMin: number };

export const DEFAULTS: Config = { errors: 3, warnings: 10, windowMin: 10, cooldownMin: 30 };
const EPOCH = "1970-01-01T00:00:00.000Z";

const asInt = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const readConfig = (get: (name: string) => string | undefined): Config => ({
  errors: asInt(get("ALERT_ERRORS"), DEFAULTS.errors),
  warnings: asInt(get("ALERT_WARNINGS"), DEFAULTS.warnings),
  windowMin: asInt(get("ALERT_WINDOW_MIN"), DEFAULTS.windowMin),
  cooldownMin: asInt(get("ALERT_COOLDOWN_MIN"), DEFAULTS.cooldownMin),
});

// ¿Hay racha? Cuenta lo que ya está guardado (incluye el reporte que disparó el webhook).
export const shouldAlert = (counts: { errors: number; warnings: number }, config: Config) =>
  counts.errors >= config.errors || counts.warnings >= config.warnings;

// Comparación en tiempo constante: no revela por el tiempo de respuesta cuántos caracteres de la clave acertó quien prueba.
export function secretsMatch(received: string | null, expected: string | undefined): boolean {
  if (!expected || received === null) return false;
  const a = new TextEncoder().encode(received);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// Hora de Colombia (UTC-5, sin horario de verano), formateada a mano para que no dependa de la configuración regional.
export function colombiaTime(iso: string | undefined, fallbackMs: number): string {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  const d = new Date((Number.isFinite(ms) ? ms : fallbackMs) - 5 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildAlert(record: LogRow, counts: { errors: number; warnings: number }, config: Config, nowMs: number) {
  const resumen = `${plural(counts.errors, "error", "errores")} y ${plural(counts.warnings, "advertencia", "advertencias")} en los últimos ${config.windowMin} minutos`;
  const subject = `Kardex: alerta de errores (${plural(counts.errors, "error", "errores")}, ${plural(counts.warnings, "advertencia", "advertencias")})`;
  const text = [
    "Kardex Digital — alerta de errores",
    `${resumen}.`,
    "",
    "Último reporte:",
    `- Comunidad: ${record.community}`,
    `- Nivel: ${record.level} · Origen: ${record.source}`,
    `- Función: ${record.fn}${record.code ? ` · Código: ${record.code}` : ""}`,
    `- Mensaje: ${record.message}`,
    `- Versión: ${record.app_version ?? "desconocida"} · Hora de Colombia: ${colombiaTime(record.created_at, nowMs)}`,
    "",
    "Detalle completo: tabla system_error_logs en Supabase (Editor de tablas).",
  ].join("\n");
  return { subject, text };
}

type Deps = {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  now: () => number;
  log: (message: string) => void;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function createHandler(deps: Deps) {
  const { env, now, log } = deps;
  const doFetch = deps.fetch;

  const supabaseHeaders = (key: string, extra: Record<string, string> = {}) => ({
    apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...extra,
  });

  // Cualquier excepción inesperada queda escrita en el log (solo el nombre y el mensaje, nunca la petición ni las variables) y la
  // respuesta es un JSON claro en vez del «Internal Server Error» en texto plano de Supabase.
  return async function handle(req: Request): Promise<Response> {
    try {
      return await handleRequest(req);
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      log(`Error interno: ${detail.slice(0, 300)}`);
      return json(500, { error: "Error interno" });
    }
  };

  async function handleRequest(req: Request): Promise<Response> {
    if (req.method !== "POST") return json(405, { error: "Método no permitido" });

    // Sin la clave compartida configurada, NADIE entra (nunca se acepta una llamada sin autenticar).
    const expected = env("ALERT_WEBHOOK_SECRET");
    if (!expected) return json(500, { error: "ALERT_WEBHOOK_SECRET no está configurada" });
    if (!secretsMatch(req.headers.get("x-alert-secret"), expected)) return json(401, { error: "No autorizado" });

    // Modo prueba (para comprobar los dos canales desde el probador del panel sin esperar una falla real): ya autenticado, manda
    // un mensaje de prueba por correo y Telegram. No cuenta reportes, no toma el turno ni toca la base.
    if (req.headers.get("x-alert-test") === "1") {
      const text = ["Kardex Digital — prueba de alertas", "Si lees esto, este canal funciona.", `Hora de Colombia: ${colombiaTime(undefined, now())}`].join("\n");
      const [mail, tg] = await Promise.all([sendEmail(doFetch, env, "Kardex: prueba de alertas", text), sendTelegram(doFetch, env, text)]);
      log(`Prueba: ${describeOutcomes(mail, tg)}`);
      return json(mail.channel === "ok" || tg.channel === "ok" ? 200 : 502, { test: true, ...outcomesBody(mail, tg) });
    }

    let payload: { type?: string; table?: string; record?: LogRow };
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: "JSON inválido" });
    }
    const record = payload.record;
    if (payload.type !== "INSERT" || payload.table !== "system_error_logs" || !record || typeof record.community !== "string" || typeof record.message !== "string") {
      return json(200, { alerted: false, reason: "evento ignorado" });
    }

    const url = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json(500, { error: "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" });

    const config = readConfig(env);
    const nowMs = now();
    const since = new Date(nowMs - config.windowMin * 60_000).toISOString();

    // 1) ¿Hay racha en la ventana?
    const countRes = await doFetch(`${url}/rest/v1/system_error_logs?select=level&created_at=gte.${encodeURIComponent(since)}&limit=1000`, {
      headers: supabaseHeaders(key),
    });
    if (!countRes.ok) {
      log(`No se pudo contar los reportes (HTTP ${countRes.status})`);
      return json(502, { error: "No se pudo consultar system_error_logs" });
    }
    const rows = (await countRes.json()) as { level: string }[];
    const counts = { errors: rows.filter((r) => r.level === "error").length, warnings: rows.filter((r) => r.level === "warning").length };
    if (!shouldAlert(counts, config)) return json(200, { alerted: false, reason: "sin racha", counts });

    // 2) Tomar el turno: solo avisa quien logra actualizar `last_alert_at` (si el último aviso fue hace más del enfriamiento).
    const nowIso = new Date(nowMs).toISOString();
    const cutoff = new Date(nowMs - config.cooldownMin * 60_000).toISOString();
    const claim = await doFetch(`${url}/rest/v1/dev_alert_state?id=eq.1&last_alert_at=lt.${encodeURIComponent(cutoff)}`, {
      method: "PATCH",
      headers: supabaseHeaders(key, { prefer: "return=representation" }),
      body: JSON.stringify({ last_alert_at: nowIso }),
    });
    if (!claim.ok) {
      log(`No se pudo tomar el turno del aviso (HTTP ${claim.status})`);
      return json(502, { error: "No se pudo consultar dev_alert_state" });
    }
    const claimed = (await claim.json()) as unknown[];
    if (claimed.length === 0) return json(200, { alerted: false, reason: "ya se avisó hace poco", counts });

    // 3) Avisar por los dos canales; si uno falla, el otro sale igual.
    const { subject, text } = buildAlert(record, counts, config, nowMs);
    const [mail, tg] = await Promise.all([sendEmail(doFetch, env, subject, text), sendTelegram(doFetch, env, text)]);
    log(`Aviso: ${describeOutcomes(mail, tg)}`);

    // Si no salió por NINGÚN canal, se devuelve el turno para que el siguiente reporte lo intente de nuevo.
    if (mail.channel !== "ok" && tg.channel !== "ok") {
      await doFetch(`${url}/rest/v1/dev_alert_state?id=eq.1&last_alert_at=eq.${encodeURIComponent(nowIso)}`, {
        method: "PATCH", headers: supabaseHeaders(key), body: JSON.stringify({ last_alert_at: EPOCH }),
      }).catch(() => undefined);
      return json(502, { alerted: false, ...outcomesBody(mail, tg) });
    }
    return json(200, { alerted: true, ...outcomesBody(mail, tg), counts });
  }
}

type Channel = "ok" | "sin configurar" | "error";
type Outcome = { channel: Channel; detail?: string };

// Texto de diagnóstico de un canal que falló: el código HTTP y el motivo que da el servicio (p. ej. Telegram: «chat not found»).
// Se limpia de cualquier secreto por si el servicio lo repitiera y se acota. De una excepción de red NO se toma el mensaje (puede
// llevar la dirección completa, que en Telegram incluye el token del bot).
export const scrub = (text: string, secrets: (string | undefined)[]) =>
  secrets.reduce<string>((t, secret) => (secret && secret.length >= 4 ? t.split(secret).join("[oculto]") : t), text).slice(0, 160);

async function failure(res: Response, secrets: (string | undefined)[]): Promise<Outcome> {
  let reason = "";
  try {
    const raw = await res.text();
    try {
      const body = JSON.parse(raw) as { description?: unknown; message?: unknown; error?: unknown };
      const found = body.description ?? body.message ?? body.error;
      reason = typeof found === "string" ? found : "";
    } catch {
      reason = raw;
    }
  } catch {
    reason = "";
  }
  return { channel: "error", detail: scrub(`HTTP ${res.status}${reason ? `: ${reason.replace(/\s+/g, " ").trim()}` : ""}`, secrets) };
}

const describeOutcomes = (mail: Outcome, tg: Outcome) =>
  `correo=${mail.channel}${mail.detail ? ` (${mail.detail})` : ""} telegram=${tg.channel}${tg.detail ? ` (${tg.detail})` : ""}`;

const outcomesBody = (mail: Outcome, tg: Outcome) => ({
  email: mail.channel,
  telegram: tg.channel,
  ...(mail.detail ? { email_detail: mail.detail } : {}),
  ...(tg.detail ? { telegram_detail: tg.detail } : {}),
});

async function sendEmail(doFetch: typeof fetch, env: Deps["env"], subject: string, text: string): Promise<Outcome> {
  const apiKey = env("RESEND_API_KEY");
  const to = env("ALERT_EMAIL_TO");
  if (!apiKey || !to) return { channel: "sin configurar" };
  try {
    const res = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env("ALERT_EMAIL_FROM") || "Kardex Alertas <onboarding@resend.dev>", to: [to], subject, text }),
    });
    return res.ok ? { channel: "ok" } : await failure(res, [apiKey, to]);
  } catch {
    return { channel: "error", detail: "no se pudo conectar con Resend" };
  }
}

async function sendTelegram(doFetch: typeof fetch, env: Deps["env"], text: string): Promise<Outcome> {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chatId = env("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return { channel: "sin configurar" };
  try {
    // Texto plano (sin parse_mode): un mensaje de error con símbolos no puede romper el formato ni inyectar enlaces.
    const res = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
    });
    return res.ok ? { channel: "ok" } : await failure(res, [token, chatId]);
  } catch {
    return { channel: "error", detail: "no se pudo conectar con Telegram" };
  }
}

// En Deno arranca el servidor; al importar este archivo desde las pruebas (Node) no hay `Deno` y no pasa nada.
if (typeof Deno !== "undefined") {
  Deno.serve(createHandler({ env: (name) => Deno.env.get(name), fetch: (input, init) => fetch(input, init), now: () => Date.now(), log: (m) => console.log(m) }));
}
