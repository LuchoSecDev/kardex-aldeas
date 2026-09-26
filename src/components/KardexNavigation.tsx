"use client";

import CustomSelect from "@/components/CustomSelect";

type Option = { value: string; label: string };

export default function KardexNavigation({
  currentWeek,
  onWeekChange,
  categoryOptions,
  activeCategory,
  onCategoryChange,
}: {
  currentWeek: number;
  onWeekChange: (week: number) => void;
  categoryOptions: Option[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}) {
  return (
    <div className="kardex-nav-row">
      <div className="card kardex-nav-card">
        <h3 className="kardex-nav-card-title">Navegación</h3>
        <div className="kardex-week-list">
          {[1, 2, 3, 4, 5].map(week => (
            <button
              key={week}
              onClick={() => onWeekChange(week)}
              className={`btn btn-toggle kardex-week-btn ${currentWeek === week ? 'btn-primary' : ''}`}
            >
              Sem {week}
            </button>
          ))}
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
