"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { MARKET_KIND_LABEL } from "@/lib/marketCalendar";
import { LIST_STATE_LABEL, getListState, summarizeByKind, summarizeChangesByKind, type KindDrafts } from "@/lib/marketList";
import { formatDateTime } from "@/lib/weekStatus";
import type { QueueStatus } from "@/lib/saveQueue";
import type { KindChanges, MarketWeek } from "@/types/market";

// "Enviar lista de la semana": envía los 4 tipos juntos, como el libro de Excel
// que se mandaba por correo. Se puede reenviar si se cambia algo.
export default function MarketSubmitBar({
  week,
  drafts,
  changes,
  saveStatus,
  isSubmitting,
  message,
  onSubmit,
}: {
  week: MarketWeek | null;
  drafts: KindDrafts;
  changes: KindChanges;
  saveStatus: QueueStatus;
  isSubmitting: boolean;
  message: { kind: "ok" | "error"; text: string } | null;
  onSubmit: () => void;
}) {
  const summary = summarizeByKind(drafts);
  const changeCounts = summarizeChangesByKind(changes);
  const total = summary.reduce((sum, s) => sum + s.count, 0);
  const totalChanges = changeCounts.reduce((sum, s) => sum + s.count, 0);
  const lists = week?.lists ?? [];
  const everSent = lists.some((l) => l.sent);
  const anyModified = lists.some((l) => l.modified);
  const sentAt = lists.find((l) => l.submitted_at)?.submitted_at ?? null;
  const late = lists.some((l) => l.late);
  const busy = saveStatus === "saving" || saveStatus === "error";

  const [confirming, setConfirming] = useState(false);

  // Una línea por tipo de lista: cuántos productos pidió y cuántos cambios lleva.
  const lines = summary.map((s, i) => {
    const notes = changeCounts[i].count;
    return `${s.label}: ${s.count > 0 ? `${s.count} productos` : "no pedí"}${notes > 0 ? ` · ${notes} ${notes === 1 ? "cambio" : "cambios"}` : ""}`;
  });

  const handleConfirm = () => {
    setConfirming(false);
    onSubmit();
  };

  // Estado de la lista ya enviada (todas se envían juntas: basta mirar la primera enviada).
  const state = getListState(lists.find((l) => l.sent));

  return (
    <section className="card market-submit" aria-label="Enviar la lista">
      {confirming && (
        <ConfirmDialog
          title={everSent ? "¿Volver a enviar la lista de la semana?" : "¿Enviar la lista de la semana a la nutricionista?"}
          confirmLabel={everSent ? "Sí, volver a enviar" : "Sí, enviar"}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        >
          <ul className="market-confirm-list">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{everSent ? "La nutricionista recibirá el aviso otra vez." : "Podrás volver a enviarla si haces cambios."}</p>
        </ConfirmDialog>
      )}
      <div className="market-submit-info">
        <p className="market-submit-total">
          <strong>Esta semana vas a pedir {total} {total === 1 ? "producto" : "productos"}.</strong>
          {totalChanges > 0 && <> Con {totalChanges} {totalChanges === 1 ? "cambio" : "cambios"} para la nutricionista.</>}
        </p>
        {!everSent && <p>Aún no la has enviado a la nutricionista.</p>}
        {everSent && !anyModified && sentAt && (
          <p className="kardex-submit-ok">
            ✓ Enviada el {formatDateTime(sentAt)}{late ? " (después del plazo)" : " (a tiempo)"}.
          </p>
        )}
        {everSent && anyModified && sentAt && (
          <p className="kardex-submit-warn">
            ⚠ {LIST_STATE_LABEL[state === "enviada" ? "modificada" : state]}: la enviaste el {formatDateTime(sentAt)}, pero cambiaste algo después. Vuelve a enviarla para que la nutricionista vea lo último.
          </p>
        )}
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "kardex-submit-error" : "kardex-submit-ok"}>
            {message.text}
          </p>
        )}
        <p className="market-submit-kinds">
          {summary.map((s) => `${MARKET_KIND_LABEL[s.kind]}: ${s.count}`).join(" · ")}
        </p>
      </div>
      <button
        type="button"
        className={`btn ${!everSent || anyModified ? "btn-primary" : "btn-outline"}`}
        onClick={() => setConfirming(true)}
        disabled={isSubmitting || busy || !week}
        title={busy ? "Espera a que termine de guardarse" : undefined}
      >
        {isSubmitting ? "Enviando…" : everSent ? "Volver a enviar la lista" : "Enviar lista de la semana"}
      </button>
    </section>
  );
}
