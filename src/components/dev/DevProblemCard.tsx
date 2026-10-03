"use client";

import { useState } from "react";
import { explain } from "@/lib/errorExplanations";
import { devService } from "@/lib/devService";
import { ago, colombiaTime, plural } from "@/lib/devFormat";
import type { DevErrorGroup, DevErrorReport } from "@/types/dev";

// Un problema (un grupo de reportes iguales) explicado en lenguaje natural, con su detalle técnico y el botón de «resuelto».
export default function DevProblemCard({
  group,
  nowMs,
  onResolve,
}: {
  group: DevErrorGroup;
  nowMs: number;
  onResolve: (group: DevErrorGroup) => Promise<number | null>;
}) {
  const e = explain(group);
  const isError = group.level === "error";
  const resolved = group.open_count === 0;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DevErrorReport[] | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggleDetail = async () => {
    const next = !detailOpen;
    setDetailOpen(next);
    if (next && detail === null) {
      setDetailError(false);
      const { data, error } = await devService.detail(group);
      if (error) setDetailError(true);
      else setDetail(data ?? []);
    }
  };

  const resolve = async () => {
    setBusy(true);
    setFailed(false);
    const closed = await onResolve(group);
    setBusy(false);
    if (closed === null) setFailed(true);
    else setConfirming(false);
  };

  const times =
    group.total === group.open_count
      ? plural(group.total, "vez", "veces")
      : `${plural(group.total, "vez", "veces")} (${group.open_count} sin resolver)`;

  return (
    <li className={`dev-problem ${isError ? "dev-problem--error" : "dev-problem--warning"} ${resolved ? "dev-problem--resolved" : ""}`}>
      <div className="dev-problem-head">
        <span className={`dev-chip ${isError ? "dev-chip--error" : "dev-chip--warning"}`}>
          <span aria-hidden="true">{isError ? "⛔" : "⚠"}</span> {isError ? "Error" : "Advertencia"}
        </span>
        {resolved && (
          <span className="dev-chip dev-chip--ok">
            <span aria-hidden="true">✓</span> Resuelto
          </span>
        )}
        <h3 className="dev-problem-title">{e.title}</h3>
      </div>

      <p className="dev-problem-meta">
        {times} · primera {colombiaTime(group.first_seen)} · última {colombiaTime(group.last_seen)} ({ago(group.last_seen, nowMs)}) · versión{" "}
        {group.last_version}
      </p>

      <dl className="dev-problem-explain">
        <div>
          <dt>Qué pasó</dt>
          <dd>{e.cause}</dd>
        </div>
        <div>
          <dt>Riesgo</dt>
          <dd>{e.risk}</dd>
        </div>
        <div>
          <dt>Qué hacer</dt>
          <dd>{e.action}</dd>
        </div>
      </dl>

      <div className="dev-problem-actions">
        <button type="button" className="btn btn-outline" aria-expanded={detailOpen} onClick={toggleDetail}>
          {detailOpen ? "Ocultar detalle técnico" : "Ver detalle técnico"}
        </button>
        {!resolved && !confirming && (
          <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
            Marcar como resuelto
          </button>
        )}
      </div>

      {confirming && (
        <div className="dev-confirm" role="group" aria-label="Confirmar">
          <p>
            ¿Marcar como resuelto? Se cierran {plural(group.open_count, "reporte abierto", "reportes abiertos")}. Si vuelve a fallar, el problema
            reaparece solo.
          </p>
          <button type="button" className="btn btn-primary" onClick={resolve} disabled={busy}>
            {busy ? "Resolviendo..." : "Sí, marcar como resuelto"}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)} disabled={busy}>
            Cancelar
          </button>
          {failed && (
            <p role="alert" className="dev-error">
              No se pudo marcar como resuelto. Inténtalo de nuevo.
            </p>
          )}
        </div>
      )}

      {detailOpen && (
        <div className="dev-detail">
          <p className="dev-detail-tech">
            <code>{group.fn}</code> · origen {group.source === "rpc" ? "llamada a la base" : "pantalla"}
            {group.code ? (
              <>
                {" "}
                · código <code>{group.code}</code>
              </>
            ) : null}
          </p>
          {detailError && (
            <p role="alert" className="dev-error">
              No se pudo cargar el detalle.
            </p>
          )}
          {detail === null && !detailError && <p>Cargando…</p>}
          {detail && detail.length === 0 && <p>Sin reportes.</p>}
          {detail && detail.length > 0 && (
            <ul className="dev-detail-list" aria-label="Últimos reportes">
              {detail.map((r) => (
                <li key={r.id}>
                  <span className="dev-detail-time">{colombiaTime(r.created_at)}</span>
                  <span>{r.message}</span>
                  <span className="dev-detail-version">
                    v{r.app_version}
                    {r.resolved ? " · resuelto" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
