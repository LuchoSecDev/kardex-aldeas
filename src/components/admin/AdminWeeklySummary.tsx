"use client";

import "@/app/kardex.css";
import { Fragment, useEffect, useMemo, useState } from "react";
import CustomSelect from "@/components/CustomSelect";
import { adminService, type CommunityOverview } from "@/lib/adminService";
import { EXTRA_WEEK_INDEX, weekCountOf } from "@/lib/calendar";
import { exportWeeklySummaryToExcel } from "@/lib/exporters/weeklySummaryExporter";
import { aggregateWeekly, defaultWeekIndex, weekRangeLabel, type WeeklyRow } from "@/lib/weeklySummary";
import { MONTH_NAMES } from "@/lib/weekStatus";
import type { Product } from "@/types/kardex";
import type { AdminWeekStatus } from "@/types/submissions";

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const numClass = (n: number) => (n < 0 ? "admin-num admin-num--negative" : "admin-num");

type WeekChoice = { key: string; week: number };
type Loaded = { key: string; rows: WeeklyRow[]; failed: boolean };

// Resumen semanal para el pedido a proveedores: por producto, el total entre
// comunidades de saldo anterior, entradas, salidas (consumo) y saldo final de
// UNA semana, con el detalle por comunidad y descarga a Excel. No calcula una
// cantidad a pedir: esa regla la define la nutricionista.
export default function AdminWeeklySummary({
  year,
  month,
  communities,
  statuses,
  products,
  isLoadingProducts,
}: {
  year: number;
  month: number;
  communities: CommunityOverview[];
  statuses: AdminWeekStatus[];
  products: Product[];
  isLoadingProducts: boolean;
}) {
  const monthKey = `${year}-${month}`;

  // La semana elegida solo vale para el mes en que se eligió: al cambiar de mes
  // vuelve a la semana por defecto (sin necesidad de un efecto).
  const [choice, setChoice] = useState<WeekChoice | null>(null);
  const weekCount = weekCountOf(year, month); // 5, o 6 si el mes tiene semana de cierre
  const week = choice && choice.key === monthKey ? Math.min(choice.week, weekCount - 1) : defaultWeekIndex(year, month);

  const [onlySent, setOnlySent] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("TODAS");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Carga: el resultado lleva la "llave" de la petición; si no coincide con la
  // actual, todavía se está cargando (o se cambió de semana/mes/filtro).
  const requestKey = `${year}-${month}-${week}-${onlySent}-${reloadKey}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error } = await adminService.weeklyTotals(year, month, week, onlySent);
      if (cancelled) return;
      if (error) console.error("Error cargando el resumen semanal:", error);
      setLoaded({ key: requestKey, rows: data ?? [], failed: Boolean(error) });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [year, month, week, onlySent, requestKey]);

  const isLoading = !loaded || loaded.key !== requestKey;
  const rows = useMemo(() => (loaded && loaded.key === requestKey ? loaded.rows : []), [loaded, requestKey]);
  const failed = Boolean(loaded && loaded.key === requestKey && loaded.failed);

  const totals = useMemo(() => aggregateWeekly(rows, products), [rows, products]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return totals.filter(
      (t) => (category === "TODAS" || t.product.category === category) && (!term || t.product.name.toLowerCase().includes(term))
    );
  }, [totals, search, category]);

  const categoryOptions = useMemo(
    () => [
      { value: "TODAS", label: "Todas las categorías" },
      ...Array.from(new Set(products.map((p) => p.category))).map((c) => ({ value: c, label: c })),
    ],
    [products]
  );

  // Qué comunidades entran en el resumen y cuáles faltan por enviar esta semana.
  const sentNames = useMemo(
    () => Array.from(new Set(statuses.filter((s) => s.week_index === week).map((s) => s.community))).sort((a, b) => a.localeCompare(b, "es")),
    [statuses, week]
  );
  const includedNames = useMemo(
    () => Array.from(new Set(rows.map((r) => r.community))).sort((a, b) => a.localeCompare(b, "es")),
    [rows]
  );
  const missingNames = useMemo(
    () => communities.map((c) => c.name).filter((name) => !sentNames.includes(name)),
    [communities, sentNames]
  );

  const range = weekRangeLabel(year, month, week);

  const handleExcel = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      await exportWeeklySummaryToExcel({
        year,
        month,
        weekIndex: week,
        rangeLabel: range,
        totals,
        includedCommunities: includedNames,
        onlySent,
      });
    } catch (e) {
      console.error("Error exportando el resumen semanal:", e);
      setExportError("No se pudo generar el Excel del resumen.");
    } finally {
      setIsExporting(false);
    }
  };

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="admin-summary">
      <div className="card admin-summary-controls">
        <div>
          <h2 className="admin-summary-title">
            Semana {week + 1} · {range} · {MONTH_NAMES[month]} {year}
          </h2>
          <div className="kardex-week-list" role="group" aria-label="Semana del resumen">
            {Array.from({ length: weekCount }, (_, w) => w).map((w) => (
              <button
                key={w}
                type="button"
                className={`btn btn-toggle kardex-week-btn ${week === w ? "btn-primary" : ""}`}
                onClick={() => setChoice({ key: monthKey, week: w })}
                aria-pressed={week === w}
              >
                Sem {w + 1}{w === EXTRA_WEEK_INDEX ? " (cierre)" : ""}
              </button>
            ))}
          </div>
        </div>

        <label className="admin-check admin-summary-toggle">
          <input type="checkbox" checked={onlySent} onChange={(e) => setOnlySent(e.target.checked)} />
          Solo las comunidades que ya enviaron esta semana
        </label>
      </div>

      <div className="card admin-summary-info" role="status">
        {isLoading ? (
          <span>Calculando el resumen…</span>
        ) : onlySent ? (
          <>
            <strong>Incluye {includedNames.length} de {communities.length} comunidades:</strong>{" "}
            {includedNames.length > 0 ? includedNames.join(", ") : "ninguna todavía"}.
            {missingNames.length > 0 && (
              <>
                {" "}<span className="admin-summary-missing"><strong>Sin enviar:</strong> {missingNames.join(", ")}.</span>
              </>
            )}
          </>
        ) : (
          <>
            <strong>Incluye todas las comunidades con datos ({includedNames.length}):</strong>{" "}
            {includedNames.length > 0 ? includedNames.join(", ") : "ninguna"}. Ojo: puede haber semanas todavía incompletas.
          </>
        )}
      </div>

      <div className="card admin-summary-filters">
        <input
          type="search"
          className="input-field admin-summary-search"
          placeholder="Buscar producto…"
          aria-label="Buscar producto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <CustomSelect options={categoryOptions} value={category} onChange={setCategory} />
        <button type="button" className="btn btn-outline" onClick={() => setReloadKey((k) => k + 1)} disabled={isLoading}>
          {isLoading ? "Actualizando…" : "Actualizar"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleExcel}
          disabled={isExporting || isLoading || isLoadingProducts || totals.length === 0}
        >
          {isExporting ? "Generando…" : "Descargar Excel"}
        </button>
      </div>

      {exportError && <p role="alert" className="admin-error admin-panel-error">{exportError}</p>}

      <div className="card admin-table-card">
        {failed ? (
          <p role="alert" className="admin-error admin-panel-error">
            No se pudo cargar el resumen. Revisa tu conexión y pulsa «Actualizar».
          </p>
        ) : isLoading ? (
          <p className="admin-lead admin-panel-empty">Cargando…</p>
        ) : totals.length === 0 ? (
          <div className="admin-panel-empty">
            <p className="admin-lead" style={{ margin: 0 }}>
              {onlySent
                ? `Ninguna comunidad ha enviado la semana ${week + 1} (${range}) todavía.`
                : `No hay movimientos registrados en la semana ${week + 1} (${range}).`}
            </p>
            {onlySent && (
              <button type="button" className="btn btn-outline" style={{ marginTop: "1rem" }} onClick={() => setOnlySent(false)}>
                Ver también las comunidades que no han enviado
              </button>
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="admin-lead admin-panel-empty">Ningún producto coincide con la búsqueda o la categoría.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table admin-summary-table">
              <thead>
                <tr>
                  <th scope="col">Alimento</th>
                  <th scope="col">Unidad</th>
                  <th scope="col" className="admin-col-center">Saldo anterior</th>
                  <th scope="col" className="admin-col-center">Entradas</th>
                  <th scope="col" className="admin-col-center">Salidas (consumo)</th>
                  <th scope="col" className="admin-col-center">Saldo final</th>
                  <th scope="col" className="admin-col-center">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t, index) => {
                  const isOpen = Boolean(expanded[t.product.id]);
                  const showCategory = index === 0 || visible[index - 1].product.category !== t.product.category;
                  return (
                    <Fragment key={t.product.id}>
                      {showCategory && (
                        <tr className="kardex-category-row">
                          <td colSpan={7}>{t.product.category}</td>
                        </tr>
                      )}
                      <tr>
                        <th scope="row" className="admin-cell-name">{t.product.name}</th>
                        <td>{t.product.unit}</td>
                        <td className={`admin-col-center ${numClass(t.prev)}`}>{fmt(t.prev)}</td>
                        <td className="admin-col-center admin-num">{fmt(t.entries)}</td>
                        <td className="admin-col-center admin-num">{fmt(t.exits)}</td>
                        <td className={`admin-col-center ${numClass(t.final)}`}><strong>{fmt(t.final)}</strong></td>
                        <td className="admin-col-center">
                          <button
                            type="button"
                            className="admin-link"
                            onClick={() => toggle(t.product.id)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Ocultar" : "Ver"} el detalle por comunidad de ${t.product.name}`}
                          >
                            {isOpen ? "Ocultar" : `Ver (${t.byCommunity.length})`}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="admin-summary-detail-row">
                          <td colSpan={7}>
                            <table className="admin-subtable">
                              <thead>
                                <tr>
                                  <th scope="col">Comunidad</th>
                                  <th scope="col">Saldo anterior</th>
                                  <th scope="col">Entradas</th>
                                  <th scope="col">Salidas</th>
                                  <th scope="col">Saldo final</th>
                                </tr>
                              </thead>
                              <tbody>
                                {t.byCommunity.map((c) => (
                                  <tr key={c.community}>
                                    <th scope="row">{c.community}</th>
                                    <td className={numClass(c.prev)}>{fmt(c.prev)}</td>
                                    <td className="admin-num">{fmt(c.entries)}</td>
                                    <td className="admin-num">{fmt(c.exits)}</td>
                                    <td className={numClass(c.final)}>{fmt(c.final)}</td>
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
    </div>
  );
}
