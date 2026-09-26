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
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div className="card" style={{ maxWidth: "700px", width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h3 style={{ margin: 0, overflowWrap: "break-word", wordBreak: "break-word" }}>Historial — Comunidad {community}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn"
            style={{ border: "2px solid var(--color-border)", padding: "0.4rem 0.8rem" }}
          >
            Cerrar
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${historialTab === "meses" ? "btn-primary" : ""}`}
            style={{ border: historialTab !== "meses" ? "1px solid var(--color-border)" : "none" }}
            onClick={() => onTabChange("meses")}
          >
            Meses registrados
          </button>
          <button
            type="button"
            className={`btn ${historialTab === "ajustes" ? "btn-primary" : ""}`}
            style={{ border: historialTab !== "ajustes" ? "1px solid var(--color-border)" : "none" }}
            onClick={() => onTabChange("ajustes")}
          >
            Ajustes registrados
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {isLoadingHistorial ? (
            <p style={{ color: "var(--color-text-muted)" }}>Cargando...</p>
          ) : historialTab === "meses" ? (
            monthsWithData.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)" }}>Aún no hay meses registrados para esta comunidad.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {monthsWithData.map(({ year, month }) => {
                  const isActive = year === selectedYear && month === selectedMonth;
                  return (
                    <button
                      key={`${year}-${month}`}
                      type="button"
                      className={`btn ${isActive ? "btn-primary" : ""}`}
                      style={{ border: isActive ? "none" : "1px solid var(--color-border)" }}
                      onClick={() => onJumpToMonth(year, month)}
                    >
                      {MONTH_NAMES[month]} {year}
                    </button>
                  );
                })}
              </div>
            )
          ) : ajustesHistory.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>Aún no se han registrado ajustes para esta comunidad.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: "560px", fontSize: "0.9rem" }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Mes</th>
                    <th style={{ textAlign: "center" }}>Sem.</th>
                    <th style={{ textAlign: "center" }}>Saldo ant. → nuevo</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {ajustesHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleDateString("es-CO")}</td>
                      <td>{getProductName(row.product_id)}</td>
                      <td>{MONTH_NAMES[row.month]} {row.year}</td>
                      <td style={{ textAlign: "center" }}>{row.week_index + 1}</td>
                      <td style={{ textAlign: "center" }}>{row.saldo_anterior} → {row.saldo_nuevo}</td>
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
