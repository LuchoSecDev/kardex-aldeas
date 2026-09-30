import { describe, expect, it, vi } from "vitest";
import { createSaveQueue, defaultIsRetryable, type QueueStatus, type SendResult } from "@/lib/saveQueue";

// Un `send` controlable: cada llamada queda esperando hasta que la prueba la resuelva.
function controlledSend() {
  const calls: { payload: string; resolve: (r: SendResult) => void }[] = [];
  const send = vi.fn(
    (payload: string) => new Promise<SendResult>((resolve) => calls.push({ payload, resolve }))
  );
  return { send, calls };
}

const ok: SendResult = { error: null };
const networkError: SendResult = { error: { message: "Failed to fetch" } };
const validationError: SendResult = { error: { code: "P0001", message: "Cantidades inválidas" } };
const noWait = () => Promise.resolve();
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe("createSaveQueue", () => {
  it("empieza en idle y termina en saved cuando el guardado sale bien", async () => {
    const statuses: QueueStatus[] = [];
    const queue = createSaveQueue<string>({ send: async () => ok, onStatusChange: (s) => statuses.push(s) });
    expect(queue.getStatus()).toBe("idle");
    await queue.enqueue("a", "1");
    expect(statuses).toEqual(["saving", "saved"]);
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("mientras hay un guardado en vuelo solo se recuerda el ÚLTIMO pendiente", async () => {
    const { send, calls } = controlledSend();
    const queue = createSaveQueue<string>({ send, wait: noWait });

    const done = queue.enqueue("a", "v1");
    queue.enqueue("a", "v2");
    queue.enqueue("a", "v3");
    expect(send).toHaveBeenCalledTimes(1);
    expect(calls[0].payload).toBe("v1");

    calls[0].resolve(ok);
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(2);
    expect(calls[1].payload).toBe("v3"); // v2 se descartó
    calls[1].resolve(ok);
    await done;
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("nunca hay dos guardados en vuelo de la misma clave (no se pisan)", async () => {
    const { send, calls } = controlledSend();
    const queue = createSaveQueue<string>({ send, wait: noWait });
    queue.enqueue("a", "v1");
    queue.enqueue("a", "v2");
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(1);
    calls[0].resolve(ok);
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(2);
    calls[1].resolve(ok);
    await queue.idle();
  });

  it("claves distintas se guardan en paralelo", async () => {
    const { send, calls } = controlledSend();
    const queue = createSaveQueue<string>({ send, wait: noWait });
    queue.enqueue("a", "A");
    queue.enqueue("b", "B");
    expect(send).toHaveBeenCalledTimes(2);
    calls.forEach((c) => c.resolve(ok));
    await queue.idle();
    expect(queue.getStatus()).toBe("saved");
  });

  it("reintenta ante una falla de red y sale bien al segundo intento", async () => {
    const results = [networkError, ok];
    const send = vi.fn(async () => results.shift()!);
    const waits: number[] = [];
    const queue = createSaveQueue<string>({ send, wait: async (ms) => void waits.push(ms) });
    await queue.enqueue("a", "x");
    expect(send).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([1000]);
    expect(queue.getStatus()).toBe("saved");
  });

  it("agota los reintentos (1 s y 3 s) y queda en error", async () => {
    const send = vi.fn(async () => networkError);
    const waits: number[] = [];
    const queue = createSaveQueue<string>({ send, wait: async (ms) => void waits.push(ms) });
    await queue.enqueue("a", "x");
    expect(send).toHaveBeenCalledTimes(3); // intento + 2 reintentos
    expect(waits).toEqual([1000, 3000]);
    expect(queue.getStatus()).toBe("error");
    expect(queue.hasUnsaved()).toBe(true);
  });

  it("un error de validación (P0001) no se reintenta", async () => {
    const send = vi.fn(async () => validationError);
    const queue = createSaveQueue<string>({ send, wait: noWait });
    await queue.enqueue("a", "x");
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.getStatus()).toBe("error");
  });

  it("una sesión vencida tampoco se reintenta", async () => {
    const send = vi.fn(async () => ({ error: { message: "SESION_INVALIDA" } }));
    const queue = createSaveQueue<string>({ send, wait: noWait });
    await queue.enqueue("a", "x");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retryFailed reenvía lo que falló y limpia el error", async () => {
    const results = [validationError, ok];
    const send = vi.fn(async () => results.shift()!);
    const queue = createSaveQueue<string>({ send, wait: noWait });
    await queue.enqueue("a", "x");
    expect(queue.getStatus()).toBe("error");

    queue.retryFailed();
    expect(queue.getStatus()).toBe("saving");
    await queue.idle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith("x");
    expect(queue.getStatus()).toBe("saved");
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("un valor nuevo reemplaza al que había fallado (no se reenvía el viejo)", async () => {
    const results = [validationError, ok];
    const send = vi.fn(async () => results.shift()!);
    const queue = createSaveQueue<string>({ send, wait: noWait });
    await queue.enqueue("a", "viejo");
    await queue.enqueue("a", "nuevo");
    queue.retryFailed(); // ya no hay nada que reintentar
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith("nuevo");
    expect(queue.getStatus()).toBe("saved");
  });

  it("si falla pero ya hay un valor más nuevo esperando, el error no se queda con el viejo", async () => {
    const { send, calls } = controlledSend();
    const queue = createSaveQueue<string>({ send, wait: noWait });
    queue.enqueue("a", "v1");
    queue.enqueue("a", "v2");
    calls[0].resolve(validationError);
    await flushMicrotasks();
    calls[1].resolve(ok);
    await queue.idle();
    expect(queue.getStatus()).toBe("saved");
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("idle() se resuelve cuando no queda nada pendiente", async () => {
    const { send, calls } = controlledSend();
    const queue = createSaveQueue<string>({ send, wait: noWait });
    queue.enqueue("a", "x");
    let resolved = false;
    const idle = queue.idle().then(() => { resolved = true; });
    await flushMicrotasks();
    expect(resolved).toBe(false);
    calls[0].resolve(ok);
    await idle;
    expect(resolved).toBe(true);
  });

  it("idle() sin nada pendiente se resuelve de inmediato", async () => {
    const queue = createSaveQueue<string>({ send: async () => ok });
    await expect(queue.idle()).resolves.toBeUndefined();
  });
});

describe("defaultIsRetryable", () => {
  it("reintenta fallas de red y de servidor, no validaciones ni sesión vencida", () => {
    expect(defaultIsRetryable({ message: "Failed to fetch" })).toBe(true);
    expect(defaultIsRetryable({ code: "500", message: "boom" })).toBe(true);
    expect(defaultIsRetryable({ code: "P0001", message: "Cantidades inválidas" })).toBe(false);
    expect(defaultIsRetryable({ message: "SESION_INVALIDA" })).toBe(false);
  });
});
