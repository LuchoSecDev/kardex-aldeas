"use client";

import CustomSelect from "@/components/CustomSelect";
import { WEEK_STATE_LABEL } from "@/lib/weekStatus";
import { isExtraWeek } from "@/lib/calendar";
import type { WeekState } from "@/types/submissions";

type Option = { value: string; label: string };

export default function KardexNavigation({
  currentWeek,
  onWeekChange,
  weekCount = 5,
  categoryOptions,
  activeCategory,
  onCategoryChange,
  weekStates,
}: {
  // Estado de envío de cada semana (índice 0..4); opcional (no se muestra en solo lectura).
  weekStates?: WeekState[];
  currentWeek: number;
  onWeekChange: (week: number) => void;
  // Semanas del mes: 5, o 6 si tiene semana de cierre (días que no caben en 5 semanas).
  weekCount?: number;
  categoryOptions: Option[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}) {
  return (
    <div className="kardex-nav-row">
      <div className="card kardex-nav-card">
        <h3 className="kardex-nav-card-title">Navegación</h3>
        <div className="kardex-week-list">
          {Array.from({ length: weekCount }, (_, i) => i + 1).map(week => {
            const state = weekStates?.[week - 1];
            const closing = isExtraWeek(week - 1);
            return (
              <button
                key={week}
                onClick={() => onWeekChange(week)}
                className={`btn btn-toggle kardex-week-btn ${closing ? 'kardex-week-btn--closing' : ''} ${currentWeek === week ? 'btn-primary' : ''}`}
                title={closing ? "Cierre del mes: los últimos días que no caben en 5 semanas" : undefined}
                aria-current={currentWeek === week ? "true" : undefined}
              >
                Sem {week}{closing && <span className="kardex-week-closing">(cierre)</span>}
                {(state === "enviada" || state === "revisada") && (
                  <span className="kardex-week-mark" title={WEEK_STATE_LABEL[state]}>✓<span className="sr-only"> {WEEK_STATE_LABEL[state]}</span></span>
                )}
                {state === "modificada" && (
                  <span className="kardex-week-mark" title={WEEK_STATE_LABEL[state]}>⚠<span className="sr-only"> {WEEK_STATE_LABEL[state]}</span></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card kardex-nav-card">
        <h3 className="kardex-nav-card-title">Categorías</h3>
        <div className="kardex-category-wrap">
          <CustomSelect
            options={categoryOptions}
            value={activeCategory}
            onChange={onCategoryChange}
          />
        </div>
      </div>
    </div>
  );
}
