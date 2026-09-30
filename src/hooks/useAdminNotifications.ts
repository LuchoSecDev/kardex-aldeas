import { useCallback, useEffect, useRef, useState } from "react";
import { adminService } from "@/lib/adminService";
import type { AdminNotification } from "@/types/submissions";

const POLL_INTERVAL_MS = 60_000;
const BASE_TITLE = "Panel administrativo - Kardex Digital";

// Lee las notificaciones. Devuelve null si falló (o si la sesión venció: en ese
// caso el listener de la página ya volvió al inicio y no hay nada que mostrar).
async function fetchNotifications(): Promise<{ data: AdminNotification[] } | { failed: true } | null> {
  const { data, error } = await adminService.listNotifications();
  if (error) {
    if (error.message?.includes("SESION_ADMIN_INVALIDA")) return null;
    console.error("Error cargando las notificaciones:", error);
    return { failed: true };
  }
  return { data: data ?? [] };
}

// La campanita de la nutricionista: envíos sin revisar o modificados después.
// No hay Realtime (las tablas están cerradas al acceso directo), así que se
// consulta cada 60 s mientras el panel está abierto, y al volver a la pestaña.
// El número también se muestra en el título de la pestaña.
export function useAdminNotifications(onChanged?: () => void) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
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
    if ("failed" in result) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setNotifications(result.data);
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

  useEffect(() => {
    document.title = notifications.length > 0 ? `(${notifications.length}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [notifications.length]);

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
    onChangedRef.current?.();
  }, [refresh]);

  return { notifications, loadFailed, reviewingId, reviewError, refresh, markReviewed };
}
