import { useEffect, useRef } from "react";
import { useToast } from "@/components/toast/ToastProvider";

// Si un guardado automático falló y luego se logró (por ejemplo, volvió el internet y se pulsó «Reintentar»), avisa con
// un toast: la persona vio el aviso rojo de «No se pudo guardar» y necesita saber que ya quedó bien.
// Entre el error y el éxito el estado pasa por «guardando», por eso se recuerda que hubo una falla desde el último
// «guardado». Guardar normalmente no avisa (para eso está el indicador fijo «✓ Todos los cambios guardados»).
export function useSaveRecoveryToast(status: "idle" | "saving" | "saved" | "error") {
  const toast = useToast();
  const hadFailure = useRef(false);

  useEffect(() => {
    if (status === "error") {
      hadFailure.current = true;
    } else if (status === "saved" && hadFailure.current) {
      hadFailure.current = false;
      toast.success("Listo: tus cambios se guardaron.");
    }
  }, [status, toast]);
}
