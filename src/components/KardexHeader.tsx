"use client";

import CustomSelect from "@/components/CustomSelect";
import SaveStatus from "@/components/SaveStatus";
import type { SaveStatus as SaveStatusValue } from "@/hooks/useSaveQueue";

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
  saveStatus,
  onRetrySave,
  saveRecovering,
  saveOffline,
  readOnly = false,
  logoutLabel = "Cambiar Comunidad",
}: {
  readOnly?: boolean;
  logoutLabel?: string;
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
  saveStatus: SaveStatusValue;
  onRetrySave: () => void;
  // Ver SaveStatus: aviso sin parpadeo mientras se reintenta, y texto de «sin conexión».
  saveRecovering?: boolean;
  saveOffline?: boolean;
}) {
  return (
    <div className="card kardex-header-card">
      <div className="kardex-header-title-wrap">
        <div>
          <h2 className="kardex-header-title">Comunidad {community}</h2>
          <div className="kardex-header-selects">
            <CustomSelect
              options={monthOptions}
              value={String(selectedMonth)}
              onChange={(v) => onMonthChange(parseInt(v))}
              className="kardex-select-month"
            />
            <CustomSelect
              options={yearOptions}
              value={String(selectedYear)}
              onChange={(v) => onYearChange(parseInt(v))}
              className="kardex-select-year"
            />
          </div>
          {readOnly ? (
            <p className="kardex-save-status">Solo lectura: no se puede modificar el kardex desde este panel.</p>
          ) : (
            <SaveStatus status={saveStatus} onRetry={onRetrySave} recovering={saveRecovering} offline={saveOffline} />
          )}
        </div>
      </div>
      <div className="kardex-header-actions">
        <button className="btn btn-primary" onClick={onExportExcel}>
          <svg className="kardex-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Descargar Excel
        </button>
        <button className="btn btn-outline" onClick={onExportPDF}>
          <svg className="kardex-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Descargar PDF
        </button>
        <button className="btn btn-outline" onClick={onOpenHistorial}>Historial</button>
        <button className="btn btn-outline" onClick={onLogout}>{logoutLabel}</button>
      </div>
    </div>
  );
}
