import { useState, useRef, useCallback } from "react";
import { kardexService } from "@/lib/kardexService";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type SavePayload = {
  year: number;
  month: number;
  productId: string;
  exits: number[];
  entries: number[];
  prevBalances: number[];
};

// Pausas antes de reintentar un guardado que falló por red/servidor. Los
// errores de validación (P0001) no se reintentan: repetirlos no los arregla.
const RETRY_DELAYS_MS = [1000, 3000];
const VALIDATION_ERROR_CODE = "P0001";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function sendWithRetry(payload: SavePayload): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const { error } = await kardexService.saveProductData(
      payload.year,
      payload.month,
      payload.productId,
      payload.exits,
      payload.entries,
      payload.prevBalances
    );
    if (!error) return true;

    console.error("Error guardando en Supabase:", error);
    const isRetryable = error.code !== VALIDATION_ERROR_CODE && !error.message?.includes("SESION_INVALIDA");
    if (!isRetryable || attempt >= RETRY_DELAYS_MS.length) return false;
    await wait(RETRY_DELAYS_MS[attempt]);
  }
}

// Cola de guardado automático, con un guardado a la vez por producto y mes.
//
// Antes cada tecla lanzaba su propio guardado sin esperar al anterior: si dos
// llegaban desordenados a Supabase, el valor viejo podía pisar al nuevo. Aquí,
// mientras hay un guardado en vuelo, solo se recuerda el ÚLTIMO valor
// pendiente (cada guardado reescribe la fila completa, así que los
// intermedios sobran) y se envía cuando termina el anterior.
export function useSaveQueue() {
  const [status, setStatus] = useState<SaveStatus>("idle");

  const pending = useRef(new Map<string, SavePayload>());
  const runners = useRef(new Map<string, Promise<void>>());
  const failed = useRef(new Map<string, SavePayload>());

  const refreshStatus = useCallback(() => {
    if (pending.current.size > 0 || runners.current.size > 0) setStatus("saving");
    else if (failed.current.size > 0) setStatus("error");
    else setStatus("saved");
  }, []);

  const drain = useCallback((key: string): Promise<void> => {
    const existing = runners.current.get(key);
    if (existing) return existing;

    const runner = (async () => {
      try {
        while (pending.current.has(key)) {
          const payload = pending.current.get(key)!;
          pending.current.delete(key);

          const ok = await sendWithRetry(payload);
          if (ok) failed.current.delete(key);
          // Si falló pero ya hay un valor más nuevo esperando, ese lo reemplaza.
          else if (!pending.current.has(key)) failed.current.set(key, payload);
        }
      } finally {
        runners.current.delete(key);
        refreshStatus();
      }
    })();

    runners.current.set(key, runner);
    return runner;
  }, [refreshStatus]);

  // Devuelve una promesa que se resuelve cuando la cola de ese producto quedó
  // vacía (haya salido bien o no: el resultado se ve en `status`).
  const enqueue = useCallback((payload: SavePayload): Promise<void> => {
    const key = `${payload.year}-${payload.month}-${payload.productId}`;
    pending.current.set(key, payload);
    failed.current.delete(key);
    setStatus("saving");
    return drain(key);
  }, [drain]);

  const retryFailed = useCallback(() => {
    const toRetry = Array.from(failed.current.entries());
    if (toRetry.length === 0) return;

    setStatus("saving");
    toRetry.forEach(([key, payload]) => {
      failed.current.delete(key);
      if (!pending.current.has(key)) pending.current.set(key, payload);
      drain(key);
    });
  }, [drain]);

  return { status, enqueue, retryFailed };
}
