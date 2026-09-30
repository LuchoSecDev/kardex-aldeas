"use client";

import { formatDateTime, getWeekState } from "@/lib/weekStatus";
import type { SaveStatus } from "@/hooks/useSaveQueue";
import type { WeekSubmission } from "@/types/submissions";

// "Enviar semana": la comunidad avisa a la nutricionista que terminó de llenar
// esa semana (equivale a entregar el papel). Se puede reenviar si se cambia algo.
export default function WeekSubmitBar({
  currentWeek,
  submission,
  saveStatus,
  isSubmitting,
  message,
  onSubmit,
}: {
  currentWeek: number;
  submission: WeekSubmission | undefined;
  saveStatus: SaveStatus;
  isSubmitting: boolean;
  message: { kind: "ok" | "error"; text: string } | null;
  onSubmit: () => void;
}) {
  const state = getWeekState(submission);
  const isSaving = saveStatus === "saving" || saveStatus === "error";

  const handleClick = () => {
    const question =
      state === "pendiente"
        ? `¿Enviar la semana ${currentWeek} a la nutricionista? Podrás volver a enviarla si haces cambios.`
        : `¿Volver a enviar la semana ${currentWeek}? La nutricionista recibirá el aviso otra vez.`;
    if (window.confirm(question)) onSubmit();
  };

  return (
    <div className="card kardex-submit-bar">
      <div className="kardex-submit-info">
        <strong>Semana {currentWeek}:</strong>{" "}
        {state === "pendiente" && <span>aún no la has enviado a la nutricionista.</span>}
        {/* La fecha ya termina en "a. m."/"p. m.": por eso no se le agrega otro punto. */}
        {state === "enviada" && submission && <span className="kardex-submit-ok">✓ enviada el {formatDateTime(submission.submitted_at)}</span>}
        {state === "revisada" && submission && (
          <span className="kardex-submit-ok">✓ enviada el {formatDateTime(submission.submitted_at)} y revisada por la nutricionista</span>
        )}
        {state === "modificada" && submission && (
          <span className="kardex-submit-warn">
            ⚠ enviada el {formatDateTime(submission.submitted_at)}, pero cambió después. Vuelve a enviarla para que la nutricionista vea lo último.
          </span>
        )}
        {/* La confirmación de un envío anterior ya no aplica si la semana volvió a cambiar. */}
        {message && !(message.kind === "ok" && state === "modificada") && (
          <span role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "kardex-submit-error" : "kardex-submit-ok"}>
            {" "}{message.text}
          </span>
        )}
      </div>

      <button
        type="button"
        className={`btn ${state === "pendiente" || state === "modificada" ? "btn-primary" : "btn-outline"}`}
        onClick={handleClick}
        disabled={isSubmitting || isSaving}
        title={isSaving ? "Espera a que termine de guardarse" : undefined}
      >
        {isSubmitting ? "Enviando…" : state === "pendiente" ? `Enviar semana ${currentWeek}` : `Volver a enviar semana ${currentWeek}`}
      </button>
    </div>
  );
}
