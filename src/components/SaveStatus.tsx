"use client";

import type { SaveStatus as SaveStatusValue } from "@/hooks/useSaveQueue";

// Estado del guardado automático. Siempre visible en el encabezado; si algún
// guardado falla, además aparece un aviso fijo que no se cierra solo hasta que
// el guardado se logra (un dato sin guardar no puede pasar desapercibido).
export default function SaveStatus({
  status,
  onRetry,
}: {
  status: SaveStatusValue;
  onRetry: () => void;
}) {
  return (
    <>
      <p className={`kardex-save-status kardex-save-status--${status}`} aria-live="polite">
        {status === "saving" && "Guardando…"}
        {status === "saved" && "✓ Todos los cambios guardados"}
        {status === "error" && "No se pudo guardar"}
        {status === "idle" && "Los cambios se guardan automáticamente"}
      </p>

      {status === "error" && (
        <div role="alert" className="kardex-save-banner">
          <span>
            <strong>No se pudieron guardar los últimos cambios.</strong>{" "}
            Revisa tu conexión a internet y no cierres esta página.
          </span>
          <button type="button" className="btn kardex-save-banner-btn" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      )}
    </>
  );
}
