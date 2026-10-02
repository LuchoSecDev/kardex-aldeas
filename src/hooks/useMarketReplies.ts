import { useEffect, useState } from "react";
import { marketService } from "@/lib/marketService";
import type { MarketReplyNotification } from "@/types/market";

// Cuando algo cambia las respuestas sin leer (p. ej. la persona las acaba de ver), se avisa con este evento y la
// campanita se actualiza al instante, sin esperar al siguiente turno de consulta.
export const REPLIES_CHANGED_EVENT = "kardex:market-replies-changed";

const POLL_INTERVAL_MS = 60_000;

// La campanita de la comunidad: respuestas de la nutricionista a sus notas de cambio, sin leer. No hay Realtime (las
// tablas están cerradas al acceso directo), así que se consulta cada 60 s mientras la pantalla está abierta, al volver a la
// pestaña y cuando otra parte de la pantalla avisa que algo cambió. Si falla (por ejemplo, el servidor aún no tiene esta
// función) simplemente no se muestra nada: la campanita nunca estorba al resto de la pantalla.
export function useMarketReplies() {
  const [replies, setReplies] = useState<MarketReplyNotification[]>([]);

  useEffect(() => {
    let cancelled = false;
    let reportedError = false;

    const poll = async () => {
      const { data, error } = await marketService.loadUnseenReplies();
      if (cancelled) return;
      if (error) {
        if (!reportedError && !error.message?.includes("SESION_INVALIDA")) {
          console.error("Error cargando las respuestas de la nutricionista:", error);
          reportedError = true;
        }
        return;
      }
      reportedError = false;
      setReplies(data ?? []);
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(REPLIES_CHANGED_EVENT, poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(REPLIES_CHANGED_EVENT, poll);
    };
  }, []);

  return { replies };
}
