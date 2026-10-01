import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast/ToastProvider";
import { adminService } from "@/lib/adminService";
import type { AdminNotification } from "@/types/submissions";
import { marketKey } from "@/lib/marketAdmin";
import type { AdminMarketNotification } from "@/types/market";

const POLL_INTERVAL_MS = 60_000;
const BASE_TITLE = "Panel administrativo - Kardex Digital";

type Fetched = { data: AdminNotification[]; market: AdminMarketNotification[]; failed: boolean };

// Lee las notificaciones del kardex y de las listas de mercado. Si una de las dos falla, la
// otra se sigue mostrando (y se avisa). Devuelve null si la sesión venció: en ese caso el
// listener de la página ya volvió al inicio y no hay nada que mostrar.
async function fetchNotifications(): Promise<Fetched | null> {
  const [kardex, market] = await Promise.all([adminService.listNotifications(), adminService.listMarketNotifications()]);
  if (kardex.error?.message?.includes("SESION_ADMIN_INVALIDA") || market.error?.message?.includes("SESION_ADMIN_INVALIDA")) return null;
  if (kardex.error) console.error("Error cargando las notificaciones:", kardex.error);
  if (market.error) console.error("Error cargando las notificaciones de las listas de mercado:", market.error);
  return { data: kardex.data ?? [], market: market.data ?? [], failed: Boolean(kardex.error || market.error) };
}


// La campanita de la nutricionista: semanas del kardex y listas de mercado sin revisar.
// No hay Realtime (las tablas están cerradas al acceso directo), así que se
// consulta cada 60 s mientras el panel está abierto, y al volver a la pestaña.
// El número también se muestra en el título de la pestaña.
export function useAdminNotifications(onChanged?: () => void) {
  const toast = useToast();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [marketNotifications, setMarketNotifications] = useState<AdminMarketNotification[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Siempre apunta al callback más reciente (se actualiza fuera del render).
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchNotifications>>) => {
    if (!result) return;
    setLoadFailed(result.failed);
    setNotifications(result.data);
    setMarketNotifications(result.market);
  }, []);

  // Para usos puntuales (botón Actualizar, volver del detalle, tras revisar).
  const refresh = useCallback(async () => {
    apply(await fetchNotifications());
  }, [apply]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const result = await fetchNotifications();
      if (!cancelled) apply(result);
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [apply]);

  const total = notifications.length + marketNotifications.length;
  useEffect(() => {
    document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [total]);

  const markReviewed = useCallback(async (id: string) => {
    setReviewingId(id);
    setReviewError(null);
    const { error } = await adminService.markReviewed(id);
    setReviewingId(null);

    if (error) {
      if (!error.message?.includes("SESION_ADMIN_INVALIDA")) {
        console.error("Error marcando como revisada:", error);
        setReviewError("No se pudo marcar como revisada. Inténtalo de nuevo.");
      }
      return;
    }
    await refresh();
    toast.success("Semana marcada como revisada.");
    onChangedRef.current?.();
  }, [refresh, toast]);

  // Marcar revisada una lista de mercado (las 4 a la vez).
  const markMarketReviewed = useCallback(async (n: AdminMarketNotification) => {
    setReviewingId(marketKey(n));
    setReviewError(null);
    const { error } = await adminService.markMarketReviewed(n.community, n.week_start);
    setReviewingId(null);

    if (error) {
      if (!error.message?.includes("SESION_ADMIN_INVALIDA")) {
        console.error("Error marcando la lista como revisada:", error);
        setReviewError("No se pudo marcar como revisada. Inténtalo de nuevo.");
      }
      return;
    }
    await refresh();
    toast.success(`La lista de ${n.community} quedó marcada como revisada.`);
    onChangedRef.current?.();
  }, [refresh, toast]);

  return { notifications, marketNotifications, loadFailed, reviewingId, reviewError, refresh, markReviewed, markMarketReviewed };
}
