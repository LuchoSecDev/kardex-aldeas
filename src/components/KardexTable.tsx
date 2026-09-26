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
    <div className="card table-container kardex-table-card">

      {isLoading && (
        <div className="kardex-loading-overlay">
          <div className="kardex-loading-box">
            Cargando datos desde la nube...
          </div>
        </div>
      )}

      <div className="kardex-table-banner">
        <h3>SEMANA {currentWeek} - Registro Diario</h3>
      </div>

      <div className="kardex-table-scroll">
        <table className="kardex-table">
          <thead>
            <tr>
              <th className="kardex-sticky-th">ALIMENTO</th>
              <th>UNIDAD</th>
              <th className="kardex-col-center">SALDO ANT.</th>
              <th className="kardex-col-center">ENTRADA</th>
              {DAYS.map((d, idx) => (
                <th key={d} className="kardex-day-th">
                  <div>{d}</div>
                  <div className="kardex-day-date-badge">
                    {currentWeekDates[idx] ? currentWeekDates[idx] : "-"}
                  </div>
                </th>
              ))}
              <th className="kardex-col-center">SALDO FINAL</th>
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

              const entradaClasses = ["input-field", "kardex-day-input", "kardex-entrada-input", "kardex-input-center"];
              if (isRowInError) entradaClasses.push("kardex-input-error");

              return (
                <tr key={product.id}>
                  <td className="kardex-sticky-td">{product.name}</td>
                  <td className="kardex-unit-cell">{product.unit}</td>

                  {/* Saldo Anterior: calculado automáticamente. Solo se corrige
                      con un ajuste auditado (motivo + registro), nunca editando
                      el número directamente. */}
                  <td className="kardex-balance-cell">
                    <div className="kardex-balance-edit-row">
                      <span className="kardex-balance-value">{(prevBalances[product.id] || [])[weekIndex] ?? 0}</span>
                      <button
                        type="button"
                        onClick={() => onOpenAjuste(product)}
                        title="Corregir saldo (ajuste auditado)"
                        aria-label={`Corregir saldo anterior de ${product.name}`}
                        className="kardex-edit-btn"
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
                      className={entradaClasses.join(" ")}
                      value={(entries[product.id] || [])[weekIndex] || ""}
                      onChange={(e) => onEntryChange(product.id, e.target.value)}
                    />
                  </td>

                  {/* Salidas diarias */}
                  {DAYS.map((day, idx) => {
                    const isInvalidDay = currentWeekDates[idx] === null;
                    const hasExit = ((exits[product.id] || [])[absoluteDayStart + idx] || 0) > 0;

                    const dayClasses = ["input-field", "kardex-day-input", "kardex-input-center"];
                    if (isInvalidDay) dayClasses.push("kardex-input-invalid-day");
                    else if (hasExit) dayClasses.push("kardex-input-has-exit");
                    if (isRowInError) dayClasses.push("kardex-input-error");

                    return (
                      <td key={day} className="kardex-day-cell">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          className={dayClasses.join(" ")}
                          disabled={isInvalidDay}
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
                  <td className={`kardex-final-balance-cell ${isRowInError ? "kardex-final-balance-error" : ""}`}>
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
