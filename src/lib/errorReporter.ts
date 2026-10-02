// Aviso de errores del navegador al desarrollador (plan 007, Fase A). Cuando algo falla en una comunidad (un guardado que
// no se pudo, un error de la página) manda un reporte corto a `dev_report_client_error` (supabase/dev_errors_1.sql).
//
// Reglas de diseño:
// - NUNCA estorba: no lanza, no espera a nadie y un fallo del propio reporte se traga en silencio (no se reporta a sí mismo).
// - NUNCA manda argumentos de las llamadas (llevan el token de sesión y cantidades): solo función, código, mensaje y versión.
// - Sin sesión no se reporta (la comunidad la deduce el servidor del token). Los errores de /admin no pasan por aquí.
// - Sin red, los reportes esperan EN MEMORIA y salen al volver la conexión. No se guardan en localStorage a propósito: el token
//   de sesión también vive solo en memoria, así que tras recargar la página un reporte guardado no podría atribuirse a su
//   comunidad con seguridad.
// - Si la función aún no existe en la base (el SQL no se ha corrido), se apaga hasta recargar: la app sigue como si nada.

export type ErrorReport = {
  source: "rpc" | "window";
  level: "warning" | "error";
  fn: string;
  code?: string | null;
  message: string;
};

type SendError = { code?: string; message?: string } | null;
export type ErrorSender = (token: string, report: ErrorReport & { version: string }) => Promise<{ error: SendError }>;

export const DEDUP_WINDOW_MS = 60_000;
export const MAX_QUEUED = 20;
const MAX_TRACKED_KEYS = 50;
const MESSAGE_MAX = 300;

// Por convención del proyecto, las condiciones esperadas (LISTA_VACIA, PIN_DEBIL, SESION_INVALIDA…) se lanzan en MAYÚSCULAS:
// son flujos normales, no fallos. Un error de validación con frase («Cambios inválidos») sí es un fallo del cliente.
export const isExpectedCondition = (message: string | undefined | null) => /^[A-Z][A-Z_]+$/.test((message ?? "").trim());

// Un error sin código de base de datos es un fallo de red (fetch no llegó); con código, el servidor sí respondió.
export const levelForRpcError = (error: { code?: string | null }): ErrorReport["level"] => (error.code ? "error" : "warning");

// Benignos del navegador que no sirven de nada reportar.
const IGNORED_WINDOW_MESSAGES = [/ResizeObserver loop/i];

type Deps = {
  send: ErrorSender;
  getToken: () => string | null;
  version: string;
  now?: () => number;
};

export function createErrorReporter({ send, getToken, version, now = Date.now }: Deps) {
  const seen = new Map<string, number>();
  const queue: { token: string; report: ErrorReport }[] = [];
  let disabled = false;
  let flushing: Promise<void> | null = null;
  let flushAgain = false;

  const clean = (r: ErrorReport): ErrorReport => ({
    source: r.source,
    level: r.level,
    fn: /^[A-Za-z0-9_.]{1,60}$/.test(r.fn) ? r.fn : "desconocida",
    code: r.code && /^[A-Za-z0-9_.-]{1,40}$/.test(r.code) ? r.code : null,
    message: (r.message || "sin mensaje").replace(/\s+/g, " ").trim().slice(0, MESSAGE_MAX) || "sin mensaje",
  });

  // El mismo error repetido (un guardado que falla cada segundo) se manda una vez por minuto.
  const isDuplicate = (r: ErrorReport) => {
    const key = `${r.source}|${r.fn}|${r.code ?? ""}|${r.message.slice(0, 80)}`;
    const t = now();
    const last = seen.get(key);
    if (last !== undefined && t - last < DEDUP_WINDOW_MS) return true;
    if (seen.size >= MAX_TRACKED_KEYS) seen.delete(seen.keys().next().value as string);
    seen.set(key, t);
    return false;
  };

  // Devuelve "sent" (llegó o ya no vale la pena reintentar) o "retry" (fue la red).
  async function deliver(token: string, report: ErrorReport): Promise<"sent" | "retry"> {
    try {
      const { error } = await send(token, { ...report, version });
      if (!error) return "sent";
      const text = `${error.code ?? ""} ${error.message ?? ""}`;
      // La función no existe todavía (SQL sin correr): se apaga hasta recargar.
      if (error.code === "PGRST202" || error.code === "42883" || /Could not find the function/i.test(text)) {
        disabled = true;
        return "sent";
      }
      // Sin código = no hubo respuesta del servidor (red caída): se reintenta al volver. Con código, no se insiste.
      return error.code ? "sent" : "retry";
    } catch {
      return "retry";
    }
  }

  // Un flush pedido mientras otro sigue en vuelo (p. ej. «online» llega durante un reintento hecho sin red) no se pierde:
  // se repite al terminar, y quien lo espera recibe el resultado completo.
  function flush(): Promise<void> {
    if (disabled) return Promise.resolve();
    if (flushing) {
      flushAgain = true;
      return flushing;
    }
    flushing = (async () => {
      try {
        do {
          flushAgain = false;
          while (queue.length > 0 && !disabled) {
            const item = queue[0];
            if ((await deliver(item.token, item.report)) === "retry") break;
            queue.shift();
          }
        } while (flushAgain && queue.length > 0 && !disabled);
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  }

  async function report(input: ErrorReport): Promise<void> {
    try {
      if (disabled) return;
      const token = getToken();
      if (!token) return;
      const r = clean(input);
      if (isDuplicate(r)) return;
      if (queue.length > 0) {
        // Hay reportes esperando la red: este va detrás para conservar el orden.
        queue.push({ token, report: r });
        if (queue.length > MAX_QUEUED) queue.shift();
        void flush();
        return;
      }
      if ((await deliver(token, r)) === "retry") {
        queue.push({ token, report: r });
        if (queue.length > MAX_QUEUED) queue.shift();
      } else {
        void flush();
      }
    } catch {
      // Un reporte nunca debe causar un error.
    }
  }

  const reportRpcError = (fn: string, error: { code?: string | null; message?: string | null }) => {
    if (isExpectedCondition(error.message)) return Promise.resolve();
    return report({ source: "rpc", level: levelForRpcError(error), fn, code: error.code, message: error.message || "sin mensaje" });
  };

  // Errores no capturados de la página (window.onerror y promesas rechazadas). Devuelve cómo quitarlos.
  function installGlobalHandlers(target: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
    const onError = (e: Event) => {
      const ev = e as ErrorEvent;
      // Un recurso que no cargó (img, script) llega como Event sin mensaje: no es un error de la app.
      if (typeof ev.message !== "string" || ev.message === "") return;
      if (IGNORED_WINDOW_MESSAGES.some((re) => re.test(ev.message))) return;
      void report({ source: "window", level: "error", fn: "window.onerror", message: ev.message });
    };
    const onRejection = (e: Event) => {
      const reason = (e as PromiseRejectionEvent).reason;
      const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Promesa rechazada";
      if (isExpectedCondition(message) || IGNORED_WINDOW_MESSAGES.some((re) => re.test(message))) return;
      void report({ source: "window", level: "error", fn: "window.unhandledrejection", message });
    };
    const onOnline = () => void flush();
    target.addEventListener("error", onError);
    target.addEventListener("unhandledrejection", onRejection);
    target.addEventListener("online", onOnline);
    return () => {
      target.removeEventListener("error", onError);
      target.removeEventListener("unhandledrejection", onRejection);
      target.removeEventListener("online", onOnline);
    };
  }

  return { report, reportRpcError, installGlobalHandlers, flush, pending: () => queue.length, isDisabled: () => disabled };
}
