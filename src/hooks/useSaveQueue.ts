import { useState, useRef, useCallback, useEffect } from "react";
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

// Control de versión (plan 012): de dónde saca la cola la versión que la pantalla conoce de cada producto y qué hace con la respuesta.
export interface SaveVersioning {
  // La versión (updated_at) conocida del producto, o null si no había fila. Se pregunta AL ENVIAR, no al escribir: los guardados de
  // un producto salen de uno en uno y el segundo debe usar la versión que devolvió el primero.
  getExpected: (year: number, month: number, productId: string) => string | null;
  onSaved: (year: number, month: number, productId: string, newVersion: string | null) => void;
  // Otra persona cambió ese producto: el guardado se rechazó y NO se reintenta (repetirlo no lo arregla).
  onConflict: (year: number, month: number, productId: string) => void;
  // La cola quedó sin nada en curso: `saved` (todo guardado o rechazado) o `error` (quedó algo sin poder guardarse por red/servidor).
  onSettled?: (status: "saved" | "error") => void;
}

type SendOutcome = "ok" | "conflict" | "failed";

async function sendWithRetry(payload: SavePayload, versioning?: SaveVersioning): Promise<SendOutcome> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await kardexService.saveProductData(
      payload.year,
      payload.month,
      payload.productId,
      payload.exits,
      payload.entries,
      payload.prevBalances,
      versioning?.getExpected(payload.year, payload.month, payload.productId)
    );
    if (!error) {
      versioning?.onSaved(payload.year, payload.month, payload.productId, typeof data === "string" ? data : null);
      return "ok";
    }

    if (error.message?.includes("CONFLICTO_VERSION")) {
      versioning?.onConflict(payload.year, payload.month, payload.productId);
      return "conflict";
    }

    console.error("Error guardando en Supabase:", error);
    const isRetryable = error.code !== VALIDATION_ERROR_CODE && !error.message?.includes("SESION_INVALIDA");
    if (!isRetryable || attempt >= RETRY_DELAYS_MS.length) return "failed";
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
export function useSaveQueue(versioning?: SaveVersioning) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Siempre la última (la cola vive entre pintados y no debe quedarse con funciones viejas).
  const versioningRef = useRef(versioning);
  useEffect(() => {
    versioningRef.current = versioning;
  });

  const pending = useRef(new Map<string, SavePayload>());
  const runners = useRef(new Map<string, Promise<void>>());
  const failed = useRef(new Map<string, SavePayload>());

  const refreshStatus = useCallback(() => {
    if (pending.current.size > 0 || runners.current.size > 0) {
      setStatus("saving");
    } else {
      const settled = failed.current.size > 0 ? "error" : "saved";
      setStatus(settled);
      versioningRef.current?.onSettled?.(settled);
    }
  }, []);

  const drain = useCallback((key: string): Promise<void> => {
    const existing = runners.current.get(key);
    if (existing) return existing;

    const runner = (async () => {
      try {
        while (pending.current.has(key)) {
          const payload = pending.current.get(key)!;
          pending.current.delete(key);

          const outcome = await sendWithRetry(payload, versioningRef.current);
          if (outcome === "ok") failed.current.delete(key);
          else if (outcome === "conflict") {
            // Lo rechazado no se guarda ni se reintenta; lo que se escribió encima de esa vista vieja tampoco.
            failed.current.delete(key);
            pending.current.delete(key);
          }
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
