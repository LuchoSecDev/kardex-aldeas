"use client";

import { AjusteRow } from "@/types/kardex";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function HistorialModal({
  community,
  historialTab,
  isLoadingHistorial,
  monthsWithData,
  ajustesHistory,
  selectedYear,
  selectedMonth,
  onTabChange,
  onClose,
  onJumpToMonth,
  getProductName,
}: {
  community: string;
  historialTab: "meses" | "ajustes";
  isLoadingHistorial: boolean;
  monthsWithData: { year: number; month: number }[];
  ajustesHistory: AjusteRow[];
  selectedYear: number;
  selectedMonth: number;
  onTabChange: (tab: "meses" | "ajustes") => void;
  onClose: () => void;
  onJumpToMonth: (year: number, month: number) => void;
  getProductName: (productId: string) => string;
}) {
  return (
    <div className="kardex-modal-overlay">
      <div className="card kardex-modal-card-lg">
        <div className="kardex-modal-header">
          <h3 className="kardex-modal-title-wrap">Historial — Comunidad {community}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline btn-sm"
          >
            Cerrar
          </button>
        </div>

        <div className="kardex-tabs-row">
          <button
            type="button"
            className={`btn btn-toggle ${historialTab === "meses" ? "btn-primary" : ""}`}
            onClick={() => onTabChange("meses")}
          >
            Meses registrados
          </button>
          <button
            type="button"
            className={`btn btn-toggle ${historialTab === "ajustes" ? "btn-primary" : ""}`}
            onClick={() => onTabChange("ajustes")}
          >
            Ajustes registrados
          </button>
        </div>

        <div className="kardex-modal-scroll">
          {isLoadingHistorial ? (
            <p className="text-muted">Cargando...</p>
          ) : historialTab === "meses" ? (
            monthsWithData.length === 0 ? (
              <p className="text-muted">Aún no hay meses registrados para esta comunidad.</p>
            ) : (
              <div className="kardex-months-wrap">
                {monthsWithData.map(({ year, month }) => {
                  const isActive = year === selectedYear && month === selectedMonth;
                  return (
                    <button
                      key={`${year}-${month}`}
                      type="button"
                      className={`btn btn-toggle ${isActive ? "btn-primary" : ""}`}
                      onClick={() => onJumpToMonth(year, month)}
                    >
                      {MONTH_NAMES[month]} {year}
                    </button>
                  );
                })}
              </div>
            )
          ) : ajustesHistory.length === 0 ? (
            <p className="text-muted">Aún no se han registrado ajustes para esta comunidad.</p>
          ) : (
            <div className="kardex-ajustes-table-wrap">
              <table className="kardex-ajustes-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Mes</th>
                    <th className="kardex-col-center">Sem.</th>
                    <th className="kardex-col-center">Saldo ant. → nuevo</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {ajustesHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleDateString("es-CO")}</td>
                      <td>{getProductName(row.product_id)}</td>
                      <td>{MONTH_NAMES[row.month]} {row.year}</td>
                      <td className="kardex-col-center">{row.week_index + 1}</td>
                      <td className="kardex-col-center">{row.saldo_anterior} → {row.saldo_nuevo}</td>
                      <td>{row.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
