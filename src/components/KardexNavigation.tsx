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
    <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
      <div className="card" style={{ flex: 1, minWidth: "300px" }}>
        <h3 style={{ fontSize: "1.1rem" }}>Navegación</h3>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5].map(week => (
            <button
              key={week}
              onClick={() => onWeekChange(week)}
              className={`btn ${currentWeek === week ? 'btn-primary' : ''}`}
              style={{ flex: "1 1 60px", padding: "0.5rem", border: currentWeek !== week ? "1px solid var(--color-border)" : "none" }}
            >
              Sem {week}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ flex: 1, minWidth: "300px" }}>
        <h3 style={{ fontSize: "1.1rem" }}>Categorías</h3>
        <div style={{ marginTop: "1rem" }}>
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
