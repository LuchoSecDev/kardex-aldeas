"use client";

import DevProblemCard from "@/components/dev/DevProblemCard";
import { PERIODS, useDevProblems } from "@/hooks/useDevProblems";
import { ago, colombiaTime } from "@/lib/devFormat";

// La pantalla principal de /dev: lo que se rompió, agrupado y explicado.
export default function DevPanel({
  notice,
  onChangePassword,
  onLogout,
}: {
  notice: string | null;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const p = useDevProblems();
  const nowMs = p.loadedAt ?? 0;
  const last = p.summary?.last_report_at ?? null;

  return (
    <main className="dev-page">
      <header className="dev-header">
        <div>
          <h1 className="dev-title">Panel del desarrollador</h1>
          <p className="dev-lead">Kardex Digital · lo que se rompió, explicado</p>
        </div>
        <div className="dev-header-actions">
          <button type="button" className="btn btn-outline" onClick={onChangePassword}>
            Cambiar contraseña
          </button>
          <button type="button" className="btn btn-outline" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}

      <section className="dev-cards" aria-label="Resumen">
        <div className="dev-card">
          <span className="dev-card-n">{p.summary?.open_errors ?? "—"}</span>
          <span>Errores sin resolver</span>
        </div>
        <div className="dev-card">
          <span className="dev-card-n">{p.summary?.open_warnings ?? "—"}</span>
          <span>Advertencias sin resolver</span>
        </div>
        <div className="dev-card">
          <span className="dev-card-n">{p.summary?.communities ?? "—"}</span>
          <span>Comunidades afectadas</span>
        </div>
        <div className="dev-card">
          <span className="dev-card-n dev-card-n--small">{colombiaTime(last)}</span>
          <span>Último reporte{last && p.loadedAt ? ` (${ago(last, p.loadedAt)})` : ""}</span>
        </div>
      </section>

      <section className="dev-filters" aria-label="Filtros">
        <label htmlFor="dev-period">Periodo</label>
        <select id="dev-period" className="input-field" value={p.days} onChange={(e) => p.setDays(Number(e.target.value))}>
          {PERIODS.map((o) => (
            <option key={o.days} value={o.days}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="admin-check">
          <input type="checkbox" checked={p.onlyOpen} onChange={(e) => p.setOnlyOpen(e.target.checked)} />
          Solo sin resolver
        </label>
        <button type="button" className="btn btn-outline" onClick={p.refresh} disabled={p.loading}>
          {p.loading ? "Cargando..." : "Actualizar"}
        </button>
        {p.loadedAt && <span className="dev-updated">Actualizado a las {colombiaTime(new Date(p.loadedAt).toISOString()).slice(11)}</span>}
      </section>

      {p.error && (
        <p role="alert" className="dev-error">
          {p.error}
        </p>
      )}

      {!p.error && !p.loading && p.groups.length === 0 && (
        <p className="dev-empty">{p.onlyOpen ? "No hay problemas sin resolver en este periodo." : "No hay reportes en este periodo."}</p>
      )}

      <ul className="dev-list" aria-label="Problemas">
        {p.groups.map((g) => (
          <DevProblemCard
            key={`${g.community}|${g.fn}|${g.source}|${g.level}|${g.code ?? ""}`}
            group={g}
            nowMs={nowMs}
            onResolve={p.resolve}
          />
        ))}
      </ul>
    </main>
  );
}
