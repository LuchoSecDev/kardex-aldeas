"use client";

import { Product } from "@/types/kardex";
import { calculateBalance, getStockStatus, STOCK_STATUS_META } from "@/lib/balanceEngine";

const DAYS = ["L", "M", "MC", "J", "V", "S", "D"];

export default function KardexTable({
  isLoading,
  currentWeek,
  currentWeekDates,
  filteredProducts,
  exits,
  entries,
  prevBalances,
  onExitChange,
  onEntryChange,
  onOpenAjuste,
}: {
  isLoading: boolean;
  currentWeek: number;
  currentWeekDates: (number | null)[];
  filteredProducts: Product[];
  exits: Record<string, number[]>;
  entries: Record<string, number[]>;
  prevBalances: Record<string, number[]>;
  onExitChange: (productId: string, dayIndex: number, value: string) => void;
  onEntryChange: (productId: string, value: string) => void;
  onOpenAjuste: (product: Product) => void;
}) {
  return (
    <div className="card table-container" style={{ padding: 0, overflow: "hidden", position: "relative" }}>

      {isLoading && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.7)", zIndex: 10, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ padding: "1rem 2rem", backgroundColor: "white", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontWeight: "bold", color: "var(--color-primary-dark)" }}>
            Cargando datos desde la nube...
          </div>
        </div>
      )}

      <div style={{ padding: "1rem", backgroundColor: "var(--color-primary-dark)", color: "white" }}>
        <h3 style={{ margin: 0, color: "white" }}>SEMANA {currentWeek} - Registro Diario</h3>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: "1000px" }}>
          <thead>
            <tr>
              <th className="kardex-sticky-th" style={{ position: "sticky", left: 0, zIndex: 2, backgroundColor: "var(--color-primary-dark)" }}>ALIMENTO</th>
              <th>UNIDAD</th>
              <th style={{ textAlign: "center" }}>SALDO ANT.</th>
              <th style={{ textAlign: "center" }}>ENTRADA</th>
              {DAYS.map((d, idx) => (
                <th key={d} style={{ textAlign: "center", width: "70px", padding: "0.4rem" }}>
                  <div>{d}</div>
                  <div style={{
                    fontSize: "0.85em",
                    color: "var(--color-primary-dark)",
                    backgroundColor: "white",
                    borderRadius: "12px",
                    padding: "2px 6px",
                    marginTop: "6px",
                    display: "inline-block",
                    fontWeight: "bold",
                    minWidth: "24px"
                  }}>
                    {currentWeekDates[idx] ? currentWeekDates[idx] : "-"}
                  </div>
                </th>
              ))}
              <th style={{ textAlign: "center" }}>SALDO FINAL</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(product => {
              const balance = calculateBalance(product.id, currentWeek, exits, entries, prevBalances);
              const stockStatus = getStockStatus(balance, product.minStock);
              const statusMeta = STOCK_STATUS_META[stockStatus];
              const isRowInError = stockStatus === "rojo";
              const weekIndex = currentWeek - 1;
              const absoluteDayStart = weekIndex * 7;

              return (
                <tr key={product.id}>
                  <td className="kardex-sticky-td" style={{ fontWeight: "500", position: "sticky", left: 0, zIndex: 1, backgroundColor: "var(--color-bg-card)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" }}>{product.name}</td>
                  <td style={{ color: "var(--color-text-muted)", fontSize: "0.9em" }}>{product.unit}</td>

                  {/* Saldo Anterior: calculado automáticamente. Solo se corrige
                      con un ajuste auditado (motivo + registro), nunca editando
                      el número directamente. */}
                  <td style={{ padding: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                      <span style={{ fontWeight: 600 }}>{(prevBalances[product.id] || [])[weekIndex] ?? 0}</span>
                      <button
                        type="button"
                        onClick={() => onOpenAjuste(product)}
                        title="Corregir saldo (ajuste auditado)"
                        aria-label={`Corregir saldo anterior de ${product.name}`}
                        style={{
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg-card)",
                          borderRadius: "6px",
                          width: "28px",
                          height: "28px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        ✏️
                      </button>
                    </div>
                  </td>

                  {/* Editable Entrada */}
                  <td className="kardex-day-cell">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="input-field kardex-day-input kardex-entrada-input"
                      style={{
                        textAlign: "center",
                        width: "100%",
                        borderColor: isRowInError ? "var(--color-accent-red)" : undefined,
                        boxShadow: isRowInError ? "0 0 0 2px rgba(230, 51, 69, 0.15)" : undefined,
                      }}
                      value={(entries[product.id] || [])[weekIndex] || ""}
                      onChange={(e) => onEntryChange(product.id, e.target.value)}
                    />
                  </td>

                  {/* Salidas diarias */}
                  {DAYS.map((day, idx) => {
                    const isInvalidDay = currentWeekDates[idx] === null;
                    return (
                      <td key={day} className="kardex-day-cell">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          className="input-field kardex-day-input"
                          disabled={isInvalidDay}
                          style={{
                            textAlign: "center",
                            width: "100%",
                            backgroundColor: isInvalidDay ? "#E2E8F0" : (((exits[product.id] || [])[absoluteDayStart + idx] || 0) > 0 ? "rgba(16, 185, 129, 0.1)" : "var(--color-bg-card)"),
                            borderColor: isRowInError ? "var(--color-accent-red)" : (((exits[product.id] || [])[absoluteDayStart + idx] || 0) > 0 ? "var(--color-success)" : "var(--color-border)"),
                            boxShadow: isRowInError ? "0 0 0 2px rgba(230, 51, 69, 0.15)" : undefined,
                            opacity: isInvalidDay ? 0.5 : 1
                          }}
                          value={(exits[product.id] || [])[absoluteDayStart + idx] || ""}
                          onChange={(e) => onExitChange(product.id, idx, e.target.value)}
                          title={isInvalidDay ? "Día fuera del mes" : ""}
                        />
                      </td>
                    );
                  })}

                  {/* Saldo Final: rojo si quedó negativo (error de digitación).
                      El amarillo/verde del semáforo está oculto por ahora, ver
                      el comentario de STOCK_STATUS_META en balanceEngine.ts. */}
                  <td style={{
                    textAlign: "center",
                    fontWeight: "bold",
                    fontSize: "1.2em",
                    color: isRowInError ? statusMeta.color : "inherit",
                    borderLeft: "2px solid var(--color-border)"
                  }}>
                    {balance}
                    {isRowInError && <span className="sr-only">{` (${statusMeta.label})`}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
