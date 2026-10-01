"use client";

import "@/app/kardex.css";
import "@/app/market.css";
import { Fragment, useEffect, useMemo, useState } from "react";
import { adminService } from "@/lib/adminService";
import { exportConsolidatedToExcel } from "@/lib/exporters/marketExporter";
import { MARKET_KINDS, MARKET_KIND_LABEL, type MarketKind } from "@/lib/marketCalendar";
import {
  aggregateConsolidated,
  collectChanges,
  communitiesIn,
  countsByKind,
  filterConsolidated,
  groupChangesByCommunity,
  type ConsolidatedChange,
} from "@/lib/marketConsolidated";
import type { AdminMarketConsolidatedRow, AdminMarketOverview } from "@/types/market";

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });

type Loaded = { key: string; rows: AdminMarketConsolidatedRow[]; failed: boolean };
type LoadedNotes = { key: string; items: ConsolidatedChange[]; failed: boolean };

// Consolidado de la semana: por producto, el total de lo que ENVIARON las comunidades y el detalle
// por comunidad, para hacer el pedido a los proveedores. Con descarga a Excel. Sin precios.
export default function AdminMarketConsolidated({
  weekStart,
  overview,
  now,
  reloadKey,
}: {
  weekStart: string;
  overview: AdminMarketOverview;
  now: number;
  // Cambia cuando algo modificó los datos (se recarga el consolidado).
  reloadKey: number;
}) {
  const requestKey = `${weekStart}|${reloadKey}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [kind, setKind] = useState<MarketKind>("fruver");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminService.marketConsolidated(weekStart).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error("Error cargando el consolidado:", error);
      setLoaded({ key: requestKey, rows: data ?? [], failed: Boolean(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [weekStart, requestKey]);

  // Cambios solicitados (plan 008): salen del detalle de cada comunidad que envió notas. Se piden solo si hay.
  const withNotes = useMemo(
    () => overview.communities.filter((c) => c.sent && (c.changes_count ?? 0) > 0).map((c) => c.community),
    [overview]
  );
  const notesKey = `${requestKey}|${withNotes.join(",")}`;
  const [loadedNotes, setLoadedNotes] = useState<LoadedNotes | null>(null);

  useEffect(() => {
    if (withNotes.length === 0) return;
    let cancelled = false;
    Promise.all(withNotes.map((community) => adminService.marketList(community, weekStart))).then((results) => {
      if (cancelled) return;
      const failed = results.some((r) => r.error || !r.data);
      if (failed) console.error("Error cargando los cambios solicitados:", results.find((r) => r.error)?.error);
      setLoadedNotes({ key: notesKey, items: failed ? [] : collectChanges(results.map((r) => r.data!)), failed });
    });
    return () => {
      cancelled = true;
    };
  }, [withNotes, weekStart, notesKey]);

  const notesReady = withNotes.length === 0 || (loadedNotes !== null && loadedNotes.key === notesKey);
  const notesFailed = withNotes.length > 0 && notesReady && Boolean(loadedNotes?.failed);
  const changes = useMemo(() => (withNotes.length > 0 && notesReady ? loadedNotes?.items ?? [] : []), [withNotes, notesReady, loadedNotes]);
  const changeGroups = useMemo(() => groupChangesByCommunity(changes), [changes]);

  const current = loaded && loaded.key === requestKey ? loaded : null;
  const rows = useMemo(() => current?.rows ?? [], [current]);
  const byKind = useMemo(() => aggregateConsolidated(rows), [rows]);
  const counts = countsByKind(byKind);
  const included = useMemo(() => communitiesIn(rows), [rows]);
  const notSent = overview.communities.filter((c) => !c.sent).map((c) => c.community);
  const withUnsent = overview.communities.filter((c) => c.sent && c.has_unsent_changes).map((c) => c.community);
  const pastDeadline = now > new Date(overview.deadline_at).getTime();

  const visible = useMemo(() => filterConsolidated(byKind[kind], query), [byKind, kind, query]);

  const handleExcel = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      await exportConsolidatedToExcel({ weekStart, byKind, included, missing: notSent, changes });
    } catch (e) {
      console.error("Error exportando el consolidado:", e);
      setExportError("No se pudo generar el Excel. Inténtalo de nuevo.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!current) return <div className="card"><p className="admin-lead admin-panel-empty">Cargando el consolidado…</p></div>;
  if (current.failed) {
    return (
      <div className="card">
        <p role="alert" className="admin-error admin-panel-error">
          No se pudo cargar el consolidado. Revisa tu conexión y pulsa «Actualizar».
        </p>
      </div>
    );
  }

  return (
    <div className="card admin-market-consolidated">
      <div className="admin-market-consolidated-head">
        <p className="admin-market-included" role="status">
          {included.length === 0 ? (
            <>Ninguna comunidad ha enviado la lista de esta semana.</>
          ) : (
            <>Suma lo que <strong>enviaron {included.length}</strong> de {overview.communities.length} comunidades: {included.join(", ")}.</>
          )}
          {notSent.length > 0 && (
            <>
              {" "}<span className={pastDeadline ? "admin-market-missing" : ""}>
                {pastDeadline ? "Faltan por enviar" : "Aún sin enviar"}: {notSent.join(", ")}.
              </span>
            </>
          )}
          {withUnsent.length > 0 && <> ✎ Con cambios sin enviar (no incluidos): {withUnsent.join(", ")}.</>}
        </p>
        <button type="button" className="btn btn-primary" onClick={handleExcel} disabled={isExporting || included.length === 0 || !notesReady || notesFailed}>
          {isExporting ? "Generando…" : "Descargar Excel consolidado"}
        </button>
      </div>
      {exportError && <p role="alert" className="admin-error">{exportError}</p>}

      {withNotes.length > 0 && !notesReady && <p className="admin-lead">Cargando los cambios solicitados…</p>}
      {notesFailed && (
        <p role="alert" className="admin-error">
          No se pudieron cargar los cambios solicitados por las comunidades. Pulsa «Actualizar» (el Excel se bloquea hasta entonces para que no salga sin ellos).
        </p>
      )}
      {changeGroups.length > 0 && (
        <section className="admin-market-notes admin-market-notes--week" aria-label="Cambios solicitados por las comunidades">
          <p className="admin-market-notes-title">📝 Cambios solicitados ({changes.length})</p>
          {changeGroups.map((group) => (
            <div key={group.community} className="admin-market-notes-group">
              <strong>{group.community}</strong>
              <ul className="admin-market-notes-list">
                {group.changes.map((c, i) => (
                  <li key={`${group.community}-${i}`}>
                    <span className="admin-market-note-kind">{MARKET_KIND_LABEL[c.kind]}</span>{" "}
                    <span className="market-change-chip">{c.itemName ?? "General"}</span>{" "}
                    <span className="admin-market-note-text">{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <div className="market-tabs" role="tablist" aria-label="Tipo de lista">
        {MARKET_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={`btn btn-toggle market-tab ${kind === k ? "btn-primary" : ""}`}
            onClick={() => { setKind(k); setQuery(""); }}
          >
            {MARKET_KIND_LABEL[k]}
            {counts[k] > 0 && <span className="market-tab-count" aria-label={`${counts[k]} productos`}>{counts[k]}</span>}
          </button>
        ))}
      </div>

      <input
        type="search"
        className="input-field market-search"
        placeholder={`Buscar en ${MARKET_KIND_LABEL[kind].toLowerCase()}…`}
        aria-label="Buscar producto"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {byKind[kind].length === 0 ? (
        <p className="admin-lead admin-market-empty">Ninguna comunidad pidió {MARKET_KIND_LABEL[kind].toLowerCase()} esta semana.</p>
      ) : visible.length === 0 ? (
        <p className="admin-lead admin-market-empty">Ningún producto coincide con «{query}».</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table admin-market-consolidated-table">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Unidad</th>
                <th scope="col" className="admin-col-center">Total</th>
                <th scope="col" className="admin-col-center">Comunidades</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const key = `${kind}-${item.id}`;
                const isOpen = Boolean(expanded[key]);
                return (
                  <Fragment key={key}>
                    <tr>
                      <th scope="row" className="admin-cell-name">
                        {item.name}
                        {item.isEvent && <span className="market-item-tag">evento</span>}
                      </th>
                      <td>{item.unit}</td>
                      <td className="admin-col-center admin-num"><strong>{fmt(item.total)}</strong></td>
                      <td className="admin-col-center">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          aria-expanded={isOpen}
                          onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                        >
                          {isOpen ? "Ocultar" : `Ver (${item.byCommunity.length})`}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="admin-summary-detail-row">
                        <td colSpan={4}>
                          <table className="admin-subtable">
                            <thead>
                              <tr><th scope="col">Comunidad</th><th scope="col" className="admin-col-center">Cantidad</th></tr>
                            </thead>
                            <tbody>
                              {item.byCommunity.map((c) => (
                                <tr key={c.community}>
                                  <th scope="row">{c.community}</th>
                                  <td className="admin-col-center admin-num">{fmt(c.quantity)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

