import { useCallback, useEffect, useRef, useState } from "react";
import { kardexService } from "@/lib/kardexService";
import type { SaveStatus } from "@/hooks/useSaveQueue";
import type { WeekSubmission } from "@/types/submissions";

type SubmitMessage = { year: number; month: number; kind: "ok" | "error"; text: string };

// Envíos de semana de la comunidad para el mes visible, y la acción de enviar.
// Se recargan al cambiar de mes y cada vez que termina un guardado: así el
// aviso "modificada tras el envío" aparece en cuanto se edita la semana. Si el mes
// todavía no tiene ninguna semana enviada, guardar no puede cambiar nada aquí y se
// omite la consulta (la mayor parte del mes, y una llamada menos por cada guardado).
export function useWeekSubmissions(year: number, month: number, saveStatus: SaveStatus, enabled: boolean) {
  const [submissions, setSubmissions] = useState<WeekSubmission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastMessage, setLastMessage] = useState<SubmitMessage | null>(null);
  // Último mes consultado y si tenía semanas enviadas.
  const known = useRef<{ key: string; hasSent: boolean } | null>(null);

  useEffect(() => {
    // Mientras se está guardando, el estado de envío aún no es confiable.
    if (!enabled) {
      known.current = null; // otra comunidad puede entrar: que no herede lo aprendido
      return;
    }
    if (saveStatus === "saving") return;
    const key = `${year}-${month}`;
    if (known.current?.key === key && !known.current.hasSent) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await kardexService.loadWeekSubmissions(year, month);
      if (cancelled) return;
      if (error) {
        console.error("Error cargando los envíos de semana:", error);
        return;
      }
      known.current = { key, hasSent: (data ?? []).length > 0 };
      setSubmissions(data ?? []);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [enabled, year, month, saveStatus]);

  const submit = useCallback(async (weekIndex: number) => {
    setIsSubmitting(true);
    setLastMessage(null);
    const { error } = await kardexService.submitWeek(year, month, weekIndex);
    setIsSubmitting(false);

    if (error) {
      // Si la sesión venció, la pantalla ya volvió a la entrada.
      if (error.message?.includes("SESION_INVALIDA")) return;
      console.error("Error enviando la semana:", error);
      setLastMessage({
        year,
        month,
        kind: "error",
        text: error.message?.includes("SEMANA_VACIA")
          ? "Esta semana todavía no tiene entradas ni salidas registradas."
          : "No se pudo enviar la semana. Revisa tu conexión e inténtalo de nuevo.",
      });
      return;
    }

    setLastMessage({ year, month, kind: "ok", text: `Semana ${weekIndex + 1} enviada a la nutricionista.` });

    const { data } = await kardexService.loadWeekSubmissions(year, month);
    if (data) {
      known.current = { key: `${year}-${month}`, hasSent: data.length > 0 };
      setSubmissions(data);
    }
  }, [year, month]);

  // El aviso solo se muestra en el mes donde ocurrió (al cambiar de mes desaparece).
  const message = lastMessage && lastMessage.year === year && lastMessage.month === month
    ? { kind: lastMessage.kind, text: lastMessage.text }
    : null;

  return { submissions, isSubmitting, message, submit };
}
