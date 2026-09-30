// Cola de guardado automático genérica: un guardado a la vez por clave, el
// último valor gana, reintentos ante fallas de red. Es lógica pura (sin React),
// así que se prueba con un `send` falso. La usa la lista de mercado; la del
// kardex (hooks/useSaveQueue.ts) tiene la misma semántica y puede migrar a esta.
//
// Si dos guardados de la misma clave llegaran desordenados al servidor, el valor
// viejo podría pisar al nuevo. Por eso, mientras hay uno en vuelo, solo se
// recuerda el ÚLTIMO pendiente (cada guardado reescribe todo, los intermedios
// sobran) y se envía cuando termina el anterior.

export type QueueStatus = "idle" | "saving" | "saved" | "error";

export type SendError = { code?: string; message?: string };
export type SendResult = { error: SendError | null };

// Errores de validación del servidor (RAISE EXCEPTION = P0001): repetirlos no los arregla.
const VALIDATION_ERROR_CODE = "P0001";

export const defaultIsRetryable = (error: SendError) =>
  error.code !== VALIDATION_ERROR_CODE && !error.message?.includes("SESION_INVALIDA");

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SaveQueueOptions<P> {
  send: (payload: P) => Promise<SendResult>;
  onStatusChange?: (status: QueueStatus) => void;
  // Pausas antes de cada reintento (por defecto 1 s y 3 s).
  retryDelaysMs?: number[];
  wait?: (ms: number) => Promise<void>;
  isRetryable?: (error: SendError) => boolean;
}

export function createSaveQueue<P>(options: SaveQueueOptions<P>) {
  const { send, onStatusChange, retryDelaysMs = [1000, 3000], wait = sleep, isRetryable = defaultIsRetryable } = options;

  const pending = new Map<string, P>();
  const runners = new Map<string, Promise<void>>();
  const failed = new Map<string, P>();
  let status: QueueStatus = "idle";

  const setStatus = (next: QueueStatus) => {
    if (next === status) return;
    status = next;
    onStatusChange?.(next);
  };

  const refreshStatus = () => {
    if (pending.size > 0 || runners.size > 0) setStatus("saving");
    else if (failed.size > 0) setStatus("error");
    else setStatus("saved");
  };

  async function sendWithRetry(payload: P): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      const { error } = await send(payload);
      if (!error) return true;
      if (!isRetryable(error) || attempt >= retryDelaysMs.length) return false;
      await wait(retryDelaysMs[attempt]);
    }
  }

  function drain(key: string): Promise<void> {
    const existing = runners.get(key);
    if (existing) return existing;

    const runner = (async () => {
      try {
        while (pending.has(key)) {
          const payload = pending.get(key)!;
          pending.delete(key);
          const ok = await sendWithRetry(payload);
          if (ok) failed.delete(key);
          // Si falló pero ya hay un valor más nuevo esperando, ese lo reemplaza.
          else if (!pending.has(key)) failed.set(key, payload);
        }
      } finally {
        runners.delete(key);
        refreshStatus();
      }
    })();

    runners.set(key, runner);
    return runner;
  }

  return {
    getStatus: () => status,

    // Devuelve una promesa que se resuelve cuando la cola de esa clave quedó vacía
    // (haya salido bien o no: el resultado se ve en el estado).
    enqueue(key: string, payload: P): Promise<void> {
      pending.set(key, payload);
      failed.delete(key);
      setStatus("saving");
      return drain(key);
    },

    // Reenvía lo que falló (sin pisar valores más nuevos ya pendientes).
    retryFailed() {
      const toRetry = Array.from(failed.entries());
      if (toRetry.length === 0) return;
      setStatus("saving");
      toRetry.forEach(([key, payload]) => {
        failed.delete(key);
        if (!pending.has(key)) pending.set(key, payload);
        drain(key);
      });
    },

    // Se resuelve cuando no queda nada en vuelo ni pendiente.
    async idle(): Promise<void> {
      while (runners.size > 0) await Promise.all(Array.from(runners.values()));
    },

    hasUnsaved: () => pending.size > 0 || runners.size > 0 || failed.size > 0,
  };
}

export type SaveQueue<P> = ReturnType<typeof createSaveQueue<P>>;
