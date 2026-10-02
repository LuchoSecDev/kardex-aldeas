"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REPLIES_CHANGED_EVENT } from "@/hooks/useMarketReplies";
import { marketService } from "@/lib/marketService";
import { createSaveQueue, type QueueStatus, type SaveQueue } from "@/lib/saveQueue";
import {
  MARKET_KINDS,
  deadlineInstant,
  fridayOfWeekStart,
  upcomingOrderFriday,
  weekStartOfFriday,
} from "@/lib/marketCalendar";
import type { MarketKind } from "@/lib/marketCalendar";
import {
  MAX_CHANGES,
  cleanChanges,
  cleanQuantities,
  draftsFromQuantities,
  emptyKindChanges,
  emptyKindDrafts,
  newChangeId,
  normalizeChangeText,
  parseParticipants,
  resolveKindsDue,
  sanitizeQuantityInput,
  submitErrorMessage,
  type KindDrafts,
} from "@/lib/marketList";
import type { KindChanges, MarketChange, MarketItem, MarketQuantities, MarketReply, MarketWeek } from "@/types/market";

// Lo que viaja por la cola de guardado: las cantidades de un tipo o sus notas de cambio (plan 008).
type SavePayload =
  | { type: "quantities"; weekStart: string; kind: MarketKind; quantities: MarketQuantities }
  | { type: "changes"; weekStart: string; kind: MarketKind; changes: MarketChange[] };
type Message = { kind: "ok" | "error"; text: string };

// Pausa tras la última tecla antes de guardar (evita un guardado por pulsación).
export const SAVE_DEBOUNCE_MS = 700;

const defaultWeekStart = () => weekStartOfFriday(upcomingOrderFriday(new Date()));

// Estado y acciones de la lista de mercado de la comunidad: catálogo, semana
// elegida, cantidades escritas (con guardado automático por tipo), participantes
// y envío. La pantalla solo pinta lo que este hook le da.
export function useMarketList() {
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [items, setItems] = useState<MarketItem[]>([]);
  const [week, setWeek] = useState<MarketWeek | null>(null);
  const [drafts, setDrafts] = useState<KindDrafts>(emptyKindDrafts);
  const [changes, setChanges] = useState<KindChanges>(emptyKindChanges);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [isSavingParticipants, setIsSavingParticipants] = useState(false);

  const draftsRef = useRef(drafts);
  const changesRef = useRef(changes);
  const itemsRef = useRef<MarketItem[]>([]);
  const weekStartRef = useRef(weekStart);
  const timers = useRef<Partial<Record<MarketKind, ReturnType<typeof setTimeout>>>>({});
  const changeTimers = useRef<Partial<Record<MarketKind, ReturnType<typeof setTimeout>>>>({});

  // La cola vive lo que vive la pantalla.
  const [queue] = useState<SaveQueue<SavePayload>>(() =>
    createSaveQueue<SavePayload>({
      send: (p) =>
        p.type === "quantities"
          ? marketService.saveList(p.weekStart, p.kind, p.quantities)
          : marketService.saveChanges(p.weekStart, p.kind, p.changes),
      onStatusChange: setQueueStatus,
    })
  );

  // --- Catálogo (una vez) ---
  useEffect(() => {
    let cancelled = false;
    marketService.loadCatalog().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        console.error("Error cargando el catálogo de la lista de mercado:", error);
        setLoadError(true);
        return;
      }
      itemsRef.current = data;
      setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // --- Guardado por tipo ---
  const enqueueKind = useCallback(
    (kind: MarketKind, forWeek: string) => {
      const quantities = cleanQuantities(draftsRef.current[kind]);
      return queue.enqueue(`${forWeek}|${kind}`, { type: "quantities", weekStart: forWeek, kind, quantities });
    },
    [queue]
  );

  const enqueueChanges = useCallback(
    (kind: MarketKind, forWeek: string) => {
      const known = new Set(itemsRef.current.map((i) => i.id));
      const clean = cleanChanges(changesRef.current[kind], known);
      return queue.enqueue(`c|${forWeek}|${kind}`, { type: "changes", weekStart: forWeek, kind, changes: clean });
    },
    [queue]
  );

  const noTimersPending = () => Object.keys(timers.current).length === 0 && Object.keys(changeTimers.current).length === 0;

  // Manda ya lo que esté esperando la pausa (al enviar, al cambiar de semana, al salir).
  const flushPending = useCallback(() => {
    for (const kind of MARKET_KINDS) {
      const timer = timers.current[kind];
      if (timer === undefined) continue;
      clearTimeout(timer);
      delete timers.current[kind];
      enqueueKind(kind, weekStartRef.current);
    }
    for (const kind of MARKET_KINDS) {
      const timer = changeTimers.current[kind];
      if (timer === undefined) continue;
      clearTimeout(timer);
      delete changeTimers.current[kind];
      enqueueChanges(kind, weekStartRef.current);
    }
    setDirty(false);
  }, [enqueueKind, enqueueChanges]);

  useEffect(() => {
    const pending = timers.current;
    const pendingChanges = changeTimers.current;
    return () => {
      Object.values(pending).forEach((t) => t !== undefined && clearTimeout(t));
      Object.values(pendingChanges).forEach((t) => t !== undefined && clearTimeout(t));
    };
  }, []);

  const setQuantity = useCallback(
    (kind: MarketKind, itemId: string, raw: string) => {
      const value = sanitizeQuantityInput(raw);
      const next = { ...draftsRef.current, [kind]: { ...draftsRef.current[kind], [itemId]: value } };
      draftsRef.current = next;
      setDrafts(next);
      setMessage(null);

      setDirty(true);
      const previous = timers.current[kind];
      if (previous !== undefined) clearTimeout(previous);
      const forWeek = weekStartRef.current;
      timers.current[kind] = setTimeout(() => {
        delete timers.current[kind];
        if (noTimersPending()) setDirty(false);
        enqueueKind(kind, forWeek);
      }, SAVE_DEBOUNCE_MS);
    },
    [enqueueKind]
  );

  // --- Zona de cambios (plan 008): agregar, editar y quitar notas; se guardan solas igual que las cantidades ---
  const applyChanges = useCallback(
    (kind: MarketKind, update: (current: MarketChange[]) => MarketChange[]) => {
      const next = { ...changesRef.current, [kind]: update(changesRef.current[kind]) };
      changesRef.current = next;
      setChanges(next);
      setMessage(null);

      setDirty(true);
      const previous = changeTimers.current[kind];
      if (previous !== undefined) clearTimeout(previous);
      const forWeek = weekStartRef.current;
      changeTimers.current[kind] = setTimeout(() => {
        delete changeTimers.current[kind];
        if (noTimersPending()) setDirty(false);
        enqueueChanges(kind, forWeek);
      }, SAVE_DEBOUNCE_MS);
    },
    [enqueueChanges]
  );

  // Devuelve un aviso si no se pudo agregar (vacía o ya hay 20), o null si quedó agregada.
  const addChange = useCallback(
    (kind: MarketKind, itemId: string | null, raw: string): string | null => {
      const text = normalizeChangeText(raw);
      if (!text) return "Escribe el cambio que quieres pedir.";
      if (changesRef.current[kind].length >= MAX_CHANGES) return `Ya hay ${MAX_CHANGES} cambios en esta lista: quita alguno para agregar otro.`;
      applyChanges(kind, (current) => [...current, { id: newChangeId(), item_id: itemId, text }]);
      return null;
    },
    [applyChanges]
  );

  const updateChange = useCallback(
    (kind: MarketKind, id: string, raw: string): string | null => {
      const text = normalizeChangeText(raw);
      if (!text) return "El cambio no puede quedar vacío: escríbelo o quítalo.";
      applyChanges(kind, (current) => current.map((c) => (c.id === id ? { ...c, text } : c)));
      return null;
    },
    [applyChanges]
  );

  const removeChange = useCallback(
    (kind: MarketKind, id: string) => applyChanges(kind, (current) => current.filter((c) => c.id !== id)),
    [applyChanges]
  );

  // --- Semana: carga completa al cambiar de semana, y solo los datos de envío
  //     (sin tocar lo que se está escribiendo) cada vez que termina un guardado ---
  const fetchWeek = useCallback(async (forWeek: string) => {
    await queue.idle(); // que el servidor ya tenga lo último que se escribió
    return marketService.loadWeek(forWeek);
  }, [queue]);

  useEffect(() => {
    let cancelled = false;
    weekStartRef.current = weekStart;

    (async () => {
      setIsLoading(true);
      const { data, error } = await fetchWeek(weekStart);
      if (cancelled) return;
      if (error || !data) {
        console.error("Error cargando la lista de la semana:", error);
        setLoadError(true);
        setIsLoading(false);
        return;
      }
      const fresh = emptyKindDrafts();
      const freshChanges = emptyKindChanges();
      for (const list of data.lists) {
        fresh[list.kind] = draftsFromQuantities(list.quantities);
        freshChanges[list.kind] = list.changes ?? [];
      }
      draftsRef.current = fresh;
      changesRef.current = freshChanges;
      setDrafts(fresh);
      setChanges(freshChanges);
      setWeek(data);
      setLoadError(false);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [weekStart, fetchWeek, reloadKey]);

  useEffect(() => {
    if (queueStatus !== "saved" || isLoading) return;
    let cancelled = false;
    marketService.loadWeek(weekStartRef.current).then(({ data }) => {
      if (!cancelled && data && data.week_start === weekStartRef.current) setWeek(data);
    });
    return () => {
      cancelled = true;
    };
  }, [queueStatus, isLoading]);

  const changeWeek = useCallback(
    (next: string) => {
      if (next === weekStartRef.current) return;
      flushPending();
      setMessage(null);
      setWeek(null);
      setWeekStart(next);
    },
    [flushPending]
  );

  // --- Participantes ---
  const saveParticipants = useCallback(async (raw: string): Promise<boolean> => {
    const n = parseParticipants(raw);
    if (n === null) {
      setMessage({ kind: "error", text: "Escribe un número de participantes entre 1 y 500." });
      return false;
    }
    setIsSavingParticipants(true);
    const { error } = await marketService.setParticipants(n);
    setIsSavingParticipants(false);
    if (error) {
      if (error.message?.includes("SESION_INVALIDA")) return false;
      console.error("Error guardando los participantes:", error);
      setMessage({ kind: "error", text: "No se pudo guardar el número de participantes. Inténtalo de nuevo." });
      return false;
    }
    setWeek((current) => (current ? { ...current, participants: n } : current));
    setMessage({ kind: "ok", text: `Participantes guardados: ${n}.` });
    return true;
  }, []);

  // --- Enviar ---
  const submit = useCallback(async () => {
    setIsSubmitting(true);
    setMessage(null);
    flushPending();
    await queue.idle();

    // Si algo no se pudo guardar, lo que vería la nutricionista no sería lo escrito.
    if (queue.hasUnsaved()) {
      setIsSubmitting(false);
      setMessage({ kind: "error", text: "No se pudieron guardar los últimos cambios. Revisa tu conexión y pulsa Reintentar antes de enviar." });
      return;
    }

    const { data, error } = await marketService.submitWeek(weekStartRef.current);
    setIsSubmitting(false);
    if (error || !data) {
      if (error?.message?.includes("SESION_INVALIDA")) return;
      // PARTICIPANTES_REQUERIDOS y LISTA_VACIA son reglas esperadas, no fallas: no ensucian la consola.
      if (!/PARTICIPANTES_REQUERIDOS|LISTA_VACIA/.test(error?.message ?? "")) console.error("Error enviando la lista de mercado:", error);
      setMessage({ kind: "error", text: submitErrorMessage(error?.message) });
      return;
    }

    setMessage({
      kind: "ok",
      text: data.late
        ? "Lista enviada a la nutricionista. Llegó después del plazo, así que quedó marcada como tardía."
        : "Lista enviada a la nutricionista.",
    });
    const refreshed = await marketService.loadWeek(weekStartRef.current);
    if (refreshed.data) setWeek(refreshed.data);
  }, [flushPending, queue]);

  // --- Respuestas de la nutricionista a las notas (plan 008, Fase D) ---
  const replies = useMemo(() => {
    const grouped: Record<MarketKind, MarketReply[]> = { fruver: [], carnes: [], abarrotes: [], aseo: [] };
    for (const list of week?.lists ?? []) grouped[list.kind] = list.replies ?? [];
    return grouped;
  }, [week]);

  // La persona está viendo las respuestas de un tipo: se marcan como leídas, se refresca la semana y se avisa a la campanita.
  const markRepliesSeen = useCallback(async (kind: MarketKind) => {
    const forWeek = weekStartRef.current;
    const { error } = await marketService.markRepliesSeen(forWeek, kind);
    if (error) {
      if (!error.message?.includes("SESION_INVALIDA")) console.error("Error marcando las respuestas como leídas:", error);
      return;
    }
    const refreshed = await marketService.loadWeek(forWeek);
    if (refreshed.data && refreshed.data.week_start === weekStartRef.current) setWeek(refreshed.data);
    window.dispatchEvent(new Event(REPLIES_CHANGED_EVENT));
  }, []);

  // --- Derivados ---
  const itemsByKind = useMemo(() => {
    const grouped: Record<MarketKind, MarketItem[]> = { fruver: [], carnes: [], abarrotes: [], aseo: [] };
    for (const item of items) grouped[item.kind].push(item);
    return grouped;
  }, [items]);

  const friday = fridayOfWeekStart(weekStart);
  const kindsDue = resolveKindsDue(week?.kinds_due ?? null, friday);
  const deadlineAt = week?.deadline_at ?? deadlineInstant(friday).toISOString();
  const saveStatus: QueueStatus = dirty ? "saving" : queueStatus;
  const hasUnsaved = dirty || queueStatus === "saving" || queueStatus === "error";

  return {
    weekStart,
    friday,
    changeWeek,
    goToUpcoming: () => changeWeek(defaultWeekStart()),
    itemsByKind,
    catalogReady: items.length > 0,
    week,
    kindsDue,
    deadlineAt,
    drafts,
    setQuantity,
    changes,
    addChange,
    updateChange,
    removeChange,
    replies,
    markRepliesSeen,
    isLoading,
    loadError,
    reload: () => {
      setLoadError(false);
      setReloadKey((k) => k + 1);
    },
    saveStatus,
    retrySave: () => queue.retryFailed(),
    hasUnsaved,
    saveParticipants,
    isSavingParticipants,
    submit,
    isSubmitting,
    message,
  };
}
