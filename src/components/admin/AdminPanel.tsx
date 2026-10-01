"use client";

import "@/app/kardex.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import AdminBell from "@/components/admin/AdminBell";
import AdminMarketLists from "@/components/admin/AdminMarketLists";
import AdminWeeklySummary from "@/components/admin/AdminWeeklySummary";
import CustomSelect from "@/components/CustomSelect";
import KardexDashboard from "@/components/KardexDashboard";
import { useToast } from "@/components/toast/ToastProvider";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useProducts } from "@/hooks/useProducts";
import { adminService, type CommunityOverview } from "@/lib/adminService";
import { WEEKS_MAX, buildCalendarWeeks, weekCountOf } from "@/lib/calendar";
import { exportKardexToExcel } from "@/lib/exporters/excelExporter";
import { loadMonthState } from "@/lib/monthState";
import { formatDateTime, getWeekState, MONTH_NAMES, WEEK_STATE_LABEL } from "@/lib/weekStatus";
import type { AdminMarketNotification } from "@/types/market";
import type { MarketFocus } from "@/hooks/useAdminMarket";
import type { AdminNotification, AdminWeekStatus, WeekState } from "@/types/submissions";

const formatLastUpdate = (iso: string | null) => (iso ? formatDateTime(iso) : "Sin actividad");

export default function AdminPanel({
  notice,
  onChangePassword,
  onLogout,
}: {
  notice: string | null;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexado

  const [communities, setCommunities] = useState<CommunityOverview[]>([]);
  const [statuses, setStatuses] = useState<AdminWeekStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Sección visible: comunidades, resumen semanal (plan 002) o listas de mercado (plan 003).
  const [view, setView] = useState<"comunidades" | "resumen" | "mercado">("comunidades");
  // Lista de mercado que se abre desde la campanita. El número cambia en cada clic para que
  // la pantalla se vuelva a montar aunque sea la misma comunidad y semana.
  const [marketFocus, setMarketFocus] = useState<{ focus: MarketFocus; n: number } | null>(null);

  // Kardex abierto en solo lectura (desde la tabla o desde la campanita).
  const [selected, setSelected] = useState<{ community: string; week?: number } | null>(null);
  const toast = useToast();
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { products, isLoadingProducts } = useProducts();

  // Al marcar una semana como revisada, la tabla también se actualiza.
  const bell = useAdminNotifications(() => setReloadKey((k) => k + 1));

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const [overview, weekStatuses] = await Promise.all([
        adminService.listCommunities(year, month),
        adminService.listWeekStatuses(year, month),
      ]);
      if (cancelled) return;

      if (overview.error) {
        console.error("Error cargando las comunidades:", overview.error);
        setLoadFailed(true);
        setCommunities([]);
      } else {
        setLoadFailed(false);
        setCommunities(overview.data ?? []);
      }
      // Si fallan solo los estados, la tabla se muestra sin ellos (se registra).
      if (weekStatuses.error) console.error("Error cargando el estado de las semanas:", weekStatuses.error);
      setStatuses(weekStatuses.data ?? []);
      setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [year, month, reloadKey]);

  // Estado de cada semana por comunidad: community -> [estado de la semana 1..6]
  const weekStatesByCommunity = useMemo(() => {
    const map = new Map<string, WeekState[]>();
    statuses.forEach((s) => {
      const states = map.get(s.community) ?? Array<WeekState>(WEEKS_MAX).fill("pendiente");
      states[s.week_index] = getWeekState({ modified: s.modified, reviewed: s.reviewed_at !== null });
      map.set(s.community, states);
    });
    return map;
  }, [statuses]);

  // La fuente de datos se memoriza: si cambiara en cada render, el kardex se
  // recargaría sin parar.
  const detailDataSource = useMemo(() => (selected ? adminService.dataSourceFor(selected.community) : null), [selected]);

  const openMarketFromNotification = (n: AdminMarketNotification) => {
    setView("mercado");
    setMarketFocus((prev) => ({ focus: { community: n.community, weekStart: n.week_start }, n: (prev?.n ?? 0) + 1 }));
  };

  const openFromNotification = (n: AdminNotification) => {
    setYear(n.year);
    setMonth(n.month);
    setSelected({ community: n.community, week: n.week_index + 1 });
  };

  const handleExcel = useCallback(async (community: string) => {
    setExporting(community);
    setExportError(null);
    try {
      const { state, hasError } = await loadMonthState(adminService.dataSourceFor(community), products, year, month);
      // Un Excel armado con una lectura fallida saldría en ceros sin avisar:
      // mejor no descargar nada.
      if (hasError) {
        setExportError(`No se pudo leer el kardex de ${community}. Revisa tu conexión e inténtalo de nuevo.`);
        return;
      }
      await exportKardexToExcel({
        community,
        selectedMonth: month,
        selectedYear: year,
        calendarWeeks: buildCalendarWeeks(year, month),
        products,
        exits: state.exits,
        entries: state.entries,
        prevBalances: state.prevBalances,
      });
      toast.success(`Excel de ${community} descargado.`);
    } catch (e) {
      console.error("Error exportando a Excel:", e);
      setExportError(`No se pudo generar el Excel de ${community}.`);
      toast.error(`No se pudo generar el Excel de ${community}.`);
    } finally {
      setExporting(null);
    }
  }, [products, year, month, toast]);

  // La campanita vive en la barra azul de arriba (junto a "Accesibilidad
  // visual"), a la izquierda, y se ve tanto en la tabla como dentro del kardex
  // de una comunidad. Este componente solo se muestra en el navegador, después
  // de iniciar sesión, así que `document` existe.
  const bellSlot = typeof document === "undefined" ? null : document.getElementById("a11y-bar-slot");
  const bellPortal = bellSlot
    ? createPortal(
        <AdminBell
          notifications={bell.notifications}
          marketNotifications={bell.marketNotifications}
          onOpenMarket={openMarketFromNotification}
          onReviewMarket={bell.markMarketReviewed}
          loadFailed={bell.loadFailed}
          reviewingId={bell.reviewingId}
          reviewError={bell.reviewError}
          onOpen={openFromNotification}
          onReview={bell.markReviewed}
        />,
        bellSlot
      )
    : null;

  if (selected && detailDataSource) {
    return (
      <>
        {bellPortal}
        <KardexDashboard
          community={selected.community}
          dataSource={detailDataSource}
          readOnly
          logoutLabel="← Volver al panel"
          initialYear={year}
          initialMonth={month}
          initialWeek={selected.week}
          onLogout={() => {
            setSelected(null);
            // Al volver, la campanita y la tabla se actualizan (pudo cambiar algo).
            void bell.refresh();
            setReloadKey((k) => k + 1);
          }}
        />
      </>
    );
  }

  const currentYear = now.getFullYear();
  const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }));
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i).map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="admin-panel">
      {bellPortal}
      <div className="card admin-panel-header">
        <div>
          <h1 className="admin-title" style={{ textAlign: "left" }}>Panel de la nutricionista</h1>
          {notice && <p role="status" className="admin-notice" style={{ margin: "0.25rem 0 0" }}>{notice}</p>}
          <p className="admin-lead" style={{ margin: "0.25rem 0 0", textAlign: "left" }}>
            Consulta en solo lectura de todas las comunidades.
          </p>
        </div>
        <div className="admin-actions">
          <button type="button" className="btn btn-outline" onClick={onChangePassword}>Cambiar contraseña</button>
          <button type="button" className="btn btn-primary" onClick={onLogout}>Cerrar sesión</button>
        </div>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Secciones del panel">
        <button
          type="button"
          role="tab"
          aria-selected={view === "comunidades"}
          className={`btn btn-toggle ${view === "comunidades" ? "btn-primary" : ""}`}
          onClick={() => setView("comunidades")}
        >
          Comunidades
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "resumen"}
          className={`btn btn-toggle ${view === "resumen" ? "btn-primary" : ""}`}
          onClick={() => setView("resumen")}
        >
          Resumen semanal
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "mercado"}
          className={`btn btn-toggle ${view === "mercado" ? "btn-primary" : ""}`}
          onClick={() => setView("mercado")}
        >
          Listas de mercado
        </button>
      </div>

      {view !== "mercado" && (
      <div className="card admin-toolbar">
        <div className="admin-toolbar-selects">
          <CustomSelect options={monthOptions} value={String(month)} onChange={(v) => setMonth(parseInt(v))} className="kardex-select-month" />
          <CustomSelect options={yearOptions} value={String(year)} onChange={(v) => setYear(parseInt(v))} className="kardex-select-year" />
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => { setReloadKey((k) => k + 1); void bell.refresh(); }}
          disabled={isLoading}
        >
          {isLoading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
      )}

      {exportError && <p role="alert" className="admin-error admin-panel-error">{exportError}</p>}

      {view === "mercado" ? (
        <AdminMarketLists
          key={marketFocus ? `focus-${marketFocus.n}` : "base"}
          focus={marketFocus?.focus ?? null}
          onChanged={() => void bell.refresh()}
          externalReloadKey={reloadKey}
        />
      ) : view === "resumen" ? (
        <AdminWeeklySummary
          year={year}
          month={month}
          communities={communities}
          statuses={statuses}
          products={products}
          isLoadingProducts={isLoadingProducts}
        />
      ) : (
      <div className="card admin-table-card">
        {loadFailed ? (
          <p role="alert" className="admin-error admin-panel-error">
            No se pudo cargar la lista de comunidades. Revisa tu conexión y pulsa «Actualizar».
          </p>
        ) : isLoading ? (
          <p className="admin-lead admin-panel-empty">Cargando comunidades…</p>
        ) : communities.length === 0 ? (
          <p className="admin-lead admin-panel-empty">Todavía no hay comunidades registradas.</p>
        ) : (
          <>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Comunidad</th>
                    <th scope="col">Última actividad</th>
                    <th scope="col" className="admin-col-center">Productos con datos ({MONTH_NAMES[month]})</th>
                    <th scope="col" className="admin-col-center">Semanas</th>
                    <th scope="col" className="admin-col-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {communities.map((c) => {
                    const states = weekStatesByCommunity.get(c.name);
                    return (
                      <tr key={c.name}>
                        <th scope="row" className="admin-cell-name">{c.name}</th>
                        <td>{formatLastUpdate(c.last_update)}</td>
                        <td className="admin-col-center">{c.products_count}</td>
                        <td className="admin-col-center">
                          <div className="admin-weeks">
                            {/* Las 5 semanas de siempre, y la 6 (de cierre) solo si el mes la tiene. */}
                            {c.weeks_active.slice(0, weekCountOf(year, month)).map((active, i) => {
                              const state = states?.[i] ?? "pendiente";
                              // Pendiente pero con registros = se está llenando, sin enviar.
                              const cls = state === "pendiente" ? (active ? "filling" : "pending") : state;
                              const label = state === "pendiente" ? (active ? "Con registros, sin enviar" : "Sin registros") : WEEK_STATE_LABEL[state];
                              return (
                                <span key={i} className={`admin-week-chip admin-week-chip--${cls}`} title={`Semana ${i + 1}: ${label}`}>
                                  S{i + 1}
                                  <span className="sr-only"> {label}</span>
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="admin-col-center">
                          <div className="admin-row-actions">
                            <button type="button" className="btn btn-primary" onClick={() => setSelected({ community: c.name })}>
                              Ver kardex
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => handleExcel(c.name)}
                              disabled={exporting !== null || isLoadingProducts}
                            >
                              {exporting === c.name ? "Generando…" : "Excel"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="admin-legend" aria-label="Significado de los colores de las semanas">
              <li><span className="admin-week-chip admin-week-chip--pending">S</span> Sin registros</li>
              <li><span className="admin-week-chip admin-week-chip--filling">S</span> Llenando (sin enviar)</li>
              <li><span className="admin-week-chip admin-week-chip--enviada">S</span> Enviada, por revisar</li>
              <li><span className="admin-week-chip admin-week-chip--revisada">S</span> Revisada</li>
              <li><span className="admin-week-chip admin-week-chip--modificada">S</span> Modificada tras el envío</li>
            </ul>
          </>
        )}
      </div>
      )}
    </div>
  );
}
