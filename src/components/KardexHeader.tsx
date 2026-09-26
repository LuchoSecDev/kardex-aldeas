"use client";

import CustomSelect from "@/components/CustomSelect";

type Option = { value: string; label: string };

export default function KardexHeader({
  community,
  selectedMonth,
  selectedYear,
  monthOptions,
  yearOptions,
  onMonthChange,
  onYearChange,
  onExportExcel,
  onExportPDF,
  onOpenHistorial,
  onLogout,
}: {
  community: string;
  selectedMonth: number;
  selectedYear: number;
  monthOptions: Option[];
  yearOptions: Option[];
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
  onOpenHistorial: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="card" style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <div>
          <h2 style={{ marginBottom: "0.2rem", overflowWrap: "break-word", wordBreak: "break-word" }}>Comunidad {community}</h2>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <CustomSelect
              options={monthOptions}
              value={String(selectedMonth)}
              onChange={(v) => onMonthChange(parseInt(v))}
              style={{ minWidth: "170px" }}
            />
            <CustomSelect
              options={yearOptions}
              value={String(selectedYear)}
              onChange={(v) => onYearChange(parseInt(v))}
              style={{ minWidth: "110px" }}
            />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={onExportExcel}>
          <svg style={{ width: "20px", height: "20px", marginRight: "8px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Descargar Excel
        </button>
        <button className="btn" style={{ border: "2px solid var(--color-border)" }} onClick={onExportPDF}>
          <svg style={{ width: "20px", height: "20px", marginRight: "8px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Descargar PDF
        </button>
        <button className="btn" style={{ border: "2px solid var(--color-border)" }} onClick={onOpenHistorial}>Historial</button>
        <button className="btn" style={{ border: "2px solid var(--color-border)" }} onClick={onLogout}>Cambiar Comunidad</button>
      </div>
    </div>
  );
}
