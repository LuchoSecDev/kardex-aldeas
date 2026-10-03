"use client";

import type { SaveStatus as SaveStatusValue } from "@/hooks/useSaveQueue";

// Estado del guardado automático. Siempre visible en el encabezado; si algún
// guardado falla, además aparece un aviso fijo que no se cierra solo hasta que
// el guardado se logra (un dato sin guardar no puede pasar desapercibido).
//
// `recovering`: hubo una falla y todavía no se logró guardar; mantiene el aviso visible mientras se reintenta (sin parpadeo).
// `offline`: el navegador no tiene conexión; el texto explica que los cambios siguen en la página y se guardarán solos.
export default function SaveStatus({
  status,
  onRetry,
  recovering = false,
  offline = false,
}: {
  status: SaveStatusValue;
  onRetry: () => void;
  recovering?: boolean;
  offline?: boolean;
}) {
  const showBanner = status === "error" || (recovering && status === "saving");
  return (
    <>
      <p className={`kardex-save-status kardex-save-status--${status}`} aria-live="polite">
        {status === "saving" && "Guardando…"}
        {status === "saved" && "✓ Todos los cambios guardados"}
        {status === "error" && "No se pudo guardar"}
        {status === "idle" && "Los cambios se guardan automáticamente"}
      </p>

      {showBanner && (
        <div role="alert" className="kardex-save-banner">
          {offline ? (
            <span>
              <strong>Sin conexión a internet.</strong>{" "}
              Tus cambios siguen en esta página y se guardarán solos cuando vuelva la conexión. No cierres ni recargues la página.
            </span>
          ) : (
            <span>
              <strong>No se pudieron guardar los últimos cambios.</strong>{" "}
              Revisa tu conexión a internet y no cierres esta página: se volverá a intentar solo.
            </span>
          )}
          <button type="button" className="btn kardex-save-banner-btn" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      )}
    </>
  );
}
