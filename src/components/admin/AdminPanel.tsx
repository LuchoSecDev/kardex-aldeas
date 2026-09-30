"use client";

import "@/app/kardex.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import CustomSelect from "@/components/CustomSelect";
import KardexDashboard from "@/components/KardexDashboard";
import { useProducts } from "@/hooks/useProducts";
import { adminService, type CommunityOverview } from "@/lib/adminService";
import { buildCalendarWeeks } from "@/lib/calendar";
import { exportKardexToExcel } from "@/lib/exporters/excelExporter";
import { loadMonthState } from "@/lib/monthState";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const formatDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "Sin actividad";

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
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { products, isLoadingProducts } = useProducts();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const { data, error } = await adminService.listCommunities(year, month);
      if (cancelled) return;

      if (error) {
        console.error("Error cargando las comunidades:", error);
        setLoadFailed(true);
        setCommunities([]);
      } else {
        setLoadFailed(false);
        setCommunities(data ?? []);
      }
      setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [year, month, reloadKey]);

  // La fuente de datos se memoriza: si cambiara en cada render, el kardex se
  // recargaría sin parar.
  const detailDataSource = useMemo(() => (selected ? adminService.dataSourceFor(selected) : null), [selected]);

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
    } catch (e) {
      console.error("Error exportando a Excel:", e);
      setExportError(`No se pudo generar el Excel de ${community}.`);
    } finally {
      setExporting(null);
    }
  }, [products, year, month]);

  if (selected && detailDataSource) {
    return (
      <KardexDashboard
        community={selected}
        dataSource={detailDataSource}
        readOnly
        logoutLabel="← Volver al panel"
        initialYear={year}
        initialMonth={month}
        onLogout={() => setSelected(null)}
      />
    );
  }

  const currentYear = now.getFullYear();
  const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }));
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i).map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="admin-panel">
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

      <div className="card admin-toolbar">
        <div className="admin-toolbar-selects">
          <CustomSelect options={monthOptions} value={String(month)} onChange={(v) => setMonth(parseInt(v))} className="kardex-select-month" />
          <CustomSelect options={yearOptions} value={String(year)} onChange={(v) => setYear(parseInt(v))} className="kardex-select-year" />
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setReloadKey((k) => k + 1)} disabled={isLoading}>
          {isLoading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {exportError && <p role="alert" className="admin-error admin-panel-error">{exportError}</p>}

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
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Comunidad</th>
                  <th scope="col">Última actividad</th>
                  <th scope="col" className="admin-col-center">Productos con datos ({MONTH_NAMES[month]})</th>
                  <th scope="col" className="admin-col-center">Semanas con registros</th>
                  <th scope="col" className="admin-col-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {communities.map((c) => (
                  <tr key={c.name}>
                    <th scope="row" className="admin-cell-name">{c.name}</th>
                    <td>{formatDateTime(c.last_update)}</td>
                    <td className="admin-col-center">{c.products_count}</td>
                    <td className="admin-col-center">
                      <div className="admin-weeks">
                        {c.weeks_active.map((active, i) => (
                          <span
                            key={i}
                            className={`admin-week-chip ${active ? "admin-week-chip--on" : ""}`}
                            title={`Semana ${i + 1}: ${active ? "con registros" : "sin registros"}`}
                          >
                            S{i + 1}
                            <span className="sr-only">{active ? " con registros" : " sin registros"}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="admin-col-center">
                      <div className="admin-row-actions">
                        <button type="button" className="btn btn-primary" onClick={() => setSelected(c.name)}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
