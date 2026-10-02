"use client";

import "@/app/kardex.css";
import "@/app/market.css";
import { useState } from "react";
import AdminChangeReply from "@/components/admin/AdminChangeReply";
import AdminMarketConsolidated from "@/components/admin/AdminMarketConsolidated";
import { useToast } from "@/components/toast/ToastProvider";
import { useNow } from "@/hooks/useNow";
import { useAdminMarket, type MarketFocus } from "@/hooks/useAdminMarket";
import { MARKET_KINDS, MARKET_KIND_LABEL, weekLabel, type MarketKind } from "@/lib/marketCalendar";
import {
  ADMIN_STATE_LABEL,
  adminListState,
  kindCell,
  punctualityLabel,
  summarizeOverview,
} from "@/lib/marketAdmin";
import { adminService } from "@/lib/adminService";
import { exportCommunityListToExcel } from "@/lib/exporters/marketExporter";
import { formatDeadline, resolveKindsDue } from "@/lib/marketList";
import type { AdminMarketChange, MarketItem, MarketQuantities } from "@/types/market";
import { formatDateTime } from "@/lib/weekStatus";

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });

// Listas de mercado que envían las comunidades (plan 003, Fase C): qué semana, quién envió,
// a tiempo o tarde, qué pidió cada una, y marcar revisada. Solo lectura de lo que enviaron.
export default function AdminMarketLists({
  focus,
  onChanged,
  externalReloadKey = 0,
}: {
  focus: MarketFocus | null;
  onChanged?: () => void;
  // Cambia cuando la campanita modifica algo (p. ej. marca una lista como revisada).
  externalReloadKey?: number;
}) {
  const market = useAdminMarket(focus, onChanged, externalReloadKey);
  const toast = useToast();
  const now = useNow();
  // "Por comunidad" (la tabla de la semana) o "Consolidado" (suma entre comunidades).
  const [section, setSection] = useState<"comunidades" | "consolidado">("comunidades");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Excel de UNA comunidad con el formato que se usaba: todos los productos, lo pedido y 0 en el resto.
  const exportCommunity = async (list: NonNullable<typeof market.detail>, community: string) => {
    setExporting(true);
    setExportError(null);
    try {
      const { data: catalog, error } = await adminService.marketCatalog();
      if (error || !catalog) throw error ?? new Error("Sin catálogo");
      const quantities: Record<MarketKind, MarketQuantities> = { fruver: {}, carnes: {}, abarrotes: {}, aseo: {} };
      const extraItems: Record<MarketKind, MarketItem[]> = { fruver: [], carnes: [], abarrotes: [], aseo: [] };
      const known = new Set(catalog.map((i) => i.id));
      for (const l of list.lists) {
        for (const item of l.items) {
          quantities[l.kind][item.id] = item.quantity;
          // Un producto pedido que ya no está en el catálogo activo no se pierde: se agrega al final.
          if (!known.has(item.id)) {
            extraItems[l.kind].push({ id: item.id, kind: l.kind, name: item.name, unit: item.unit, is_event: item.is_event, sort_order: 100000 });
          }
        }
      }
      const changes: Partial<Record<MarketKind, AdminMarketChange[]>> = {};
      for (const l of list.lists) changes[l.kind] = l.changes ?? [];
      await exportCommunityListToExcel({
        community, weekStart: list.week_start, participants: list.participants, catalog, quantities, extraItems, changes,
      });
      toast.success(`Excel de ${community} descargado.`);
    } catch (e) {
      console.error("Error exportando la lista de la comunidad:", e);
      setExportError(`No se pudo generar el Excel de ${community}. Revisa tu conexión e inténtalo de nuevo.`);
      toast.error(`No se pudo generar el Excel de ${community}.`);
    } finally {
      setExporting(false);
    }
  };

  const overview = market.overview;
  const friday = overview?.friday ?? null;
  const kindsDue = overview && friday ? resolveKindsDue(overview.kinds_due, friday) : [];
  const deadlineAt = overview?.deadline_at ?? null;

  // --- Detalle de una comunidad ---
  if (market.openCommunity) {
    const d = market.detail;
    const due = d ? resolveKindsDue(d.kinds_due, d.friday) : [];
    const state = d ? adminListState(d, d.deadline_at, now) : null;
    const totalChanges = d ? d.lists.reduce((sum, l) => sum + (l.changes?.length ?? 0), 0) : 0;
    return (
      <div className="card admin-market-detail">
        <div className="admin-market-detail-head">
          <div>
            <h2 className="admin-summary-title">Lista de {market.openCommunity}</h2>
            <p className="admin-lead admin-market-sub">{weekLabel(market.weekStart)}</p>
          </div>
          <button type="button" className="btn btn-outline" onClick={market.closeDetail}>← Volver a las comunidades</button>
        </div>

        {market.isLoadingDetail && <p className="admin-lead">Cargando la lista…</p>}
        {market.detailFailed && (
          <p role="alert" className="admin-error">No se pudo cargar la lista de esta comunidad. Revisa tu conexión e inténtalo de nuevo.</p>
        )}

        {d && (
          <>
            {!d.sent ? (
              <p className="admin-lead admin-market-empty">
                {market.openCommunity} todavía no ha enviado la lista de esta semana.
              </p>
            ) : (
              <>
                <ul className="admin-market-facts">
                  <li>
                    <span className={`admin-market-badge admin-market-badge--${state}`}>{state ? ADMIN_STATE_LABEL[state] : ""}</span>
                  </li>
                  <li>Enviada el {d.submitted_at ? formatDateTime(d.submitted_at) : "—"}</li>
                  <li className={d.late ? "admin-market-late" : ""}>{punctualityLabel(d)}</li>
                  {d.submit_count > 1 && <li>Enviada {d.submit_count} veces</li>}
                  {d.participants !== null && <li>{d.participants} participantes</li>}
                  {totalChanges > 0 && (
                    <li className="admin-market-notes-flag">📝 {totalChanges} {totalChanges === 1 ? "cambio solicitado" : "cambios solicitados"}</li>
                  )}
                </ul>

                {d.has_unsent_changes && (
                  <p role="status" className="admin-market-warn">
                    ✎ La comunidad hizo cambios después de enviar y aún no los ha enviado. Aquí ves lo último que envió.
                  </p>
                )}

                {d.lists.map((list) => (
                  <section key={list.kind} className="admin-market-kind" aria-label={MARKET_KIND_LABEL[list.kind]}>
                    <h3 className="admin-market-kind-title">
                      {MARKET_KIND_LABEL[list.kind]}
                      <span className="admin-market-kind-count">
                        {list.items.length === 0 ? "No pidió" : `${list.items.length} ${list.items.length === 1 ? "producto" : "productos"}`}
                      </span>
                      {list.items.length === 0 && !due.includes(list.kind) && (
                        <span className="admin-market-kind-note"> (ese viernes no tocaba)</span>
                      )}
                    </h3>
                    {(list.changes?.length ?? 0) > 0 && (
                      <div className="admin-market-notes" role="group" aria-label={`Cambios solicitados de ${MARKET_KIND_LABEL[list.kind]}`}>
                        <p className="admin-market-notes-title">📝 Cambios solicitados</p>
                        {market.replyError && <p role="alert" className="admin-error">{market.replyError}</p>}
                        <ul className="admin-market-notes-list">
                          {(list.changes ?? []).map((change) => (
                            <li key={change.id}>
                              <span className="market-change-chip">{change.item_name ?? "General"}</span>{" "}
                              <span className="admin-market-note-text">{change.text}</span>
                              <AdminChangeReply
                                reply={change.reply ?? null}
                                busy={market.replying}
                                onSave={(text) => market.reply(market.openCommunity as string, list.kind, change.id, text)}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {list.items.length > 0 && (
                      <table className="admin-subtable admin-market-items">
                        <thead>
                          <tr>
                            <th scope="col">Producto</th>
                            <th scope="col">Unidad</th>
                            <th scope="col" className="admin-col-center">Cantidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.items.map((item) => (
                            <tr key={item.id}>
                              <th scope="row">
                                {item.name}
                                {item.is_event && <span className="market-item-tag">evento</span>}
                              </th>
                              <td>{item.unit}</td>
                              <td className="admin-col-center admin-num">{fmt(item.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                ))}

                <div className="admin-market-review">
                  {market.reviewError && <p role="alert" className="admin-error">{market.reviewError}</p>}
                  {exportError && <p role="alert" className="admin-error">{exportError}</p>}
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => exportCommunity(d, market.openCommunity as string)}
                    disabled={exporting}
                  >
                    {exporting ? "Generando…" : "Descargar Excel (formato actual)"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => market.markReviewed(market.openCommunity as string)}
                    disabled={market.reviewing || d.reviewed}
                  >
                    {d.reviewed ? "✓ Ya está revisada" : market.reviewing ? "Marcando…" : "Marcar revisada"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // --- Resumen de la semana ---
  const summary = overview && deadlineAt ? summarizeOverview(overview.communities, deadlineAt, now) : null;

  return (
    <div className="admin-summary">
      <div className="card admin-market-week">
        <div className="admin-market-week-row">
          <button type="button" className="btn btn-outline market-week-arrow" onClick={market.previousWeek} aria-label="Semana anterior">←</button>
          <div className="market-week-label">
            <h2 className="admin-summary-title admin-market-week-title">{weekLabel(market.weekStart)}</h2>
            {friday && deadlineAt && (
              <p className="admin-lead admin-market-sub">
                Plazo de envío: {formatDeadline(deadlineAt)}
              </p>
            )}
          </div>
          <button type="button" className="btn btn-outline market-week-arrow" onClick={market.nextWeek} aria-label="Semana siguiente">→</button>
        </div>
        <div className="admin-market-week-actions">
          {!market.isDefaultWeek && (
            <button type="button" className="btn btn-toggle" onClick={market.goToDefault}>Ir a la semana más reciente</button>
          )}
          <button type="button" className="btn btn-outline" onClick={market.reload} disabled={market.isLoading}>
            {market.isLoading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        {kindsDue.length > 0 && (
          <p className="admin-market-due">
            <strong>Ese viernes se pide:</strong> {kindsDue.map((k) => MARKET_KIND_LABEL[k]).join(", ")}.
          </p>
        )}
      </div>

      {market.loadFailed && (
        <p role="alert" className="admin-error admin-panel-error">
          No se pudieron cargar las listas de esta semana. Revisa tu conexión y pulsa «Actualizar».
        </p>
      )}

      <div className="admin-tabs" role="tablist" aria-label="Vista de las listas">
        <button type="button" role="tab" aria-selected={section === "comunidades"} className={`btn btn-toggle ${section === "comunidades" ? "btn-primary" : ""}`} onClick={() => setSection("comunidades")}>
          Por comunidad
        </button>
        <button type="button" role="tab" aria-selected={section === "consolidado"} className={`btn btn-toggle ${section === "consolidado" ? "btn-primary" : ""}`} onClick={() => setSection("consolidado")}>
          Consolidado
        </button>
      </div>

      {section === "consolidado" && overview && !market.isLoading ? (
        <AdminMarketConsolidated weekStart={market.weekStart} overview={overview} now={now} reloadKey={market.reloadCount} />
      ) : section === "consolidado" ? (
        <div className="card"><p className="admin-lead admin-panel-empty">Cargando las listas…</p></div>
      ) : (
      <div className="card admin-table-card">
        {market.isLoading ? (
          <p className="admin-lead admin-panel-empty">Cargando las listas…</p>
        ) : !overview || overview.communities.length === 0 ? (
          <p className="admin-lead admin-panel-empty">Todavía no hay comunidades registradas.</p>
        ) : (
          <>
            {summary && (
              <p className="admin-market-summary" role="status">
                Enviaron <strong>{summary.sent}</strong> de {summary.total}
                {summary.toReview > 0 && <> · <strong>{summary.toReview}</strong> por revisar</>}
                {summary.reviewed > 0 && <> · {summary.reviewed} revisadas</>}
                {summary.late > 0 && <> · <span className="admin-market-late">{summary.late} tarde</span></>}
                {summary.missing > 0 && <> · <span className="admin-market-missing">faltan {summary.missing} (plazo vencido)</span></>}
                {summary.pending > 0 && <> · {summary.pending} aún con tiempo</>}
              </p>
            )}

            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Comunidad</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Enviada</th>
                    <th scope="col" className="admin-col-center">Participantes</th>
                    {MARKET_KINDS.map((k) => (
                      <th key={k} scope="col" className="admin-col-center">{MARKET_KIND_LABEL[k]}</th>
                    ))}
                    <th scope="col" className="admin-col-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.communities.map((row) => {
                    const state = adminListState(row, overview.deadline_at, now);
                    return (
                      <tr key={row.community}>
                        <th scope="row" className="admin-cell-name">{row.community}</th>
                        <td>
                          <span className={`admin-market-badge admin-market-badge--${state}`}>{ADMIN_STATE_LABEL[state]}</span>
                          {row.sent && row.late && <span className="admin-market-flag admin-market-late"> Tarde</span>}
                          {row.sent && row.changed_after_deadline && (
                            <span className="admin-market-flag" title="Reenviada con cambios después del plazo"> ⚠ cambió tras el plazo</span>
                          )}
                          {row.has_unsent_changes && (
                            <span className="admin-market-flag" title="La comunidad editó después de enviar"> ✎ cambios sin enviar</span>
                          )}
                          {row.sent && (row.changes_count ?? 0) > 0 && (
                            <span className="admin-market-flag admin-market-notes-flag" title="Cambios solicitados en el pedido">
                              {" "}📝 {row.changes_count} {row.changes_count === 1 ? "cambio" : "cambios"}
                            </span>
                          )}
                          {!row.sent && row.has_draft && <span className="admin-market-flag"> Llenando</span>}
                        </td>
                        <td>{row.submitted_at ? formatDateTime(row.submitted_at) : "—"}</td>
                        <td className="admin-col-center">{row.participants ?? "—"}</td>
                        {MARKET_KINDS.map((k) => (
                          <td key={k} className="admin-col-center admin-num">{kindCell(row, k, kindsDue.includes(k))}</td>
                        ))}
                        <td className="admin-col-center">
                          <div className="admin-row-actions">
                            <button type="button" className="btn btn-primary" onClick={() => market.openDetail(row.community)} disabled={!row.sent}
                              title={row.sent ? undefined : "Todavía no ha enviado la lista"}>
                              Ver lista
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="admin-legend" aria-label="Significado de los estados">
              <li><span className="admin-market-badge admin-market-badge--pendiente">Aún sin enviar</span> todavía hay tiempo</li>
              <li><span className="admin-market-badge admin-market-badge--falta">Falta por enviar</span> venció el plazo</li>
              <li><span className="admin-market-badge admin-market-badge--enviada">Por revisar</span></li>
              <li><span className="admin-market-badge admin-market-badge--revisada">Revisada</span></li>
            </ul>
          </>
        )}
      </div>
      )}
    </div>
  );
}
