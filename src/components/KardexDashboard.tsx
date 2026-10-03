"use client";

import "@/app/kardex.css";
import { useEffect, useState } from "react";
import { AjusteRow, Product } from "@/types/kardex";
import KardexHeader from "@/components/KardexHeader";
import KardexNavigation from "@/components/KardexNavigation";
import KardexTable from "@/components/KardexTable";
import AjusteModal from "@/components/AjusteModal";
import HistorialModal from "@/components/HistorialModal";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";
import { useToast } from "@/components/toast/ToastProvider";
import { useSaveRecoveryToast } from "@/hooks/useSaveRecoveryToast";
import { useCalendar } from "@/hooks/useCalendar";
import { DAYS_PER_WEEK, isExtraWeek, weekCountOf } from "@/lib/calendar";
import { useErrorAlert } from "@/hooks/useErrorAlert";
import { useKardexData } from "@/hooks/useKardexData";
import { useProducts } from "@/hooks/useProducts";
import { sumRange } from "@/lib/balanceEngine";
import { kardexService } from "@/lib/kardexService";
import type { KardexDataSource } from "@/lib/kardexDataSource";
import WeekSubmitBar from "@/components/WeekSubmitBar";
import { useWeekSubmissions } from "@/hooks/useWeekSubmissions";
import { getWeekState } from "@/lib/weekStatus";
import { exportKardexToExcel } from "@/lib/exporters/excelExporter";
import { exportKardexToPDF } from "@/lib/exporters/pdfExporter";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function KardexDashboard({
  community,
  onLogout,
  dataSource = kardexService,
  readOnly = false,
  logoutLabel,
  initialYear,
  initialMonth,
  initialWeek,
}: {
  initialWeek?: number;
  community: string;
  onLogout: () => void;
  // De dónde se leen los datos (por defecto, los de la propia comunidad).
  dataSource?: KardexDataSource;
  // Solo lectura: sin edición, sin ajustes y sin guardado (panel de la nutricionista).
  readOnly?: boolean;
  logoutLabel?: string;
  initialYear?: number;
  initialMonth?: number;
}) {
  // La semana elegida; si se cambia a un mes con menos semanas (p. ej. de la semana 6 de marzo a
  // abril), se usa la última que tenga ese mes.
  const [weekChoice, setCurrentWeek] = useState(initialWeek ?? 1);
  const [activeCategory, setActiveCategory] = useState("TODAS");
  const [selectedMonth, setSelectedMonth] = useState(initialMonth ?? new Date().getMonth()); // 0-indexado
  const [selectedYear, setSelectedYear] = useState(initialYear ?? new Date().getFullYear());

  const weekCount = weekCountOf(selectedYear, selectedMonth); // 5, o 6 con semana de cierre
  const currentWeek = Math.min(weekChoice, weekCount);
  const { calendarWeeks, currentWeekDates } = useCalendar(selectedYear, selectedMonth, currentWeek);
  const { errorToast, scheduleErrorCheck } = useErrorAlert();
  const toast = useToast();
  const { products, isLoadingProducts } = useProducts();

  const {
    isLoading,
    loadError,
    reload,
    exits,
    entries,
    prevBalances,
    ajustesByProduct,
    inheritedBase,
    saveStatus,
    retrySave,
    saveProductData,
    updateLocalState,
    applyAjuste
  } = useKardexData(community, selectedYear, selectedMonth, products, dataSource);

  // El aviso de «saldo negativo» (error de digitación) y el de «ya se guardó» tras una falla salen como toast.
  useEffect(() => {
    if (errorToast) toast.warning(errorToast);
  }, [errorToast, toast]);
  useSaveRecoveryToast(saveStatus);

  // Envío de semana a la nutricionista (solo en el modo de la comunidad).
  const weekSubmissions = useWeekSubmissions(selectedYear, selectedMonth, saveStatus, !readOnly);
  const weekStates = Array.from({ length: weekCount }, (_, i) => getWeekState(weekSubmissions.submissions.find((s) => s.week_index === i)));

  // Bloqueado para editar: modo solo lectura, o la carga de datos falló (lo
  // que se vería en pantalla no serían los datos reales).
  const locked = readOnly || loadError;

  // Con cambios sin guardar (guardando o con error), el navegador pregunta
  // antes de cerrar o recargar la página.
  const hasUnsavedChanges = saveStatus === "saving" || saveStatus === "error";
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const handleLogout = () => {
    if (hasUnsavedChanges) setConfirmingLogout(true);
    else onLogout();
  };

  const handleExitChange = (productId: string, dayIndex: number, value: string) => {
    if (locked) return;
    const numValue = value === "" ? 0 : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    const absoluteDayIndex = ((currentWeek - 1) * DAYS_PER_WEEK) + dayIndex;
    const newProductExits = [...(exits[productId] || [])];
    newProductExits[absoluteDayIndex] = numValue;

    const newProductPrev = updateLocalState(productId, newProductExits, entries[productId] || []);

    const weekIndex = currentWeek - 1;
    const weekExits = sumRange(newProductExits, weekIndex * DAYS_PER_WEEK, DAYS_PER_WEEK);
    const weekBalance = (newProductPrev[weekIndex] ?? 0) + ((entries[productId] || [])[weekIndex] ?? 0) - weekExits;
    scheduleErrorCheck(productId, products.find(p => p.id === productId)?.name || productId, weekIndex, weekBalance);

    saveProductData(productId, newProductExits, entries[productId] || [], newProductPrev);
  };

  const handleEntryChange = (productId: string, value: string) => {
    if (locked) return;
    const numValue = value === "" ? 0 : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    const newProductEntries = [...(entries[productId] || [])];
    newProductEntries[currentWeek - 1] = numValue;

    const newProductPrev = updateLocalState(productId, exits[productId] || [], newProductEntries);

    const weekIndex = currentWeek - 1;
    const weekExits = sumRange(exits[productId] || [], weekIndex * DAYS_PER_WEEK, DAYS_PER_WEEK);
    const weekBalance = (newProductPrev[weekIndex] ?? 0) + (newProductEntries[weekIndex] ?? 0) - weekExits;
    scheduleErrorCheck(productId, products.find(p => p.id === productId)?.name || productId, weekIndex, weekBalance);

    saveProductData(productId, exits[productId] || [], newProductEntries, newProductPrev);
  };

  // --- Ajuste auditado: la única forma de corregir un saldo anterior ---
  const [ajusteProduct, setAjusteProduct] = useState<Product | null>(null);
  const [ajusteValue, setAjusteValue] = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [isSubmittingAjuste, setIsSubmittingAjuste] = useState(false);
  // true si es el primer registro real de este producto (no hay mes anterior del
  // cual heredar ni ajustes previos): no es una "corrección", es el arranque.
  const [isBootstrapAjuste, setIsBootstrapAjuste] = useState(false);

  const openAjuste = (product: Product) => {
    if (locked) return;
    const weekIndex = currentWeek - 1;
    const bootstrap =
      weekIndex === 0 &&
      inheritedBase[product.id] === undefined &&
      ajustesByProduct[product.id]?.[0] === undefined;

    setAjusteProduct(product);
    setAjusteValue(String((prevBalances[product.id] || [])[weekIndex] ?? 0));
    setAjusteMotivo(bootstrap ? "Saldo inicial (primer registro)" : "");
    setIsBootstrapAjuste(bootstrap);
  };

  const closeAjuste = () => {
    setAjusteProduct(null);
    setAjusteMotivo("");
  };

  const submitAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ajusteProduct) return;

    const numValue = ajusteValue === "" ? NaN : parseFloat(ajusteValue);
    if (isNaN(numValue) || numValue < 0 || !ajusteMotivo.trim()) return;

    const productId = ajusteProduct.id;
    const weekIndex = currentWeek - 1;
    const saldoAnterior = (prevBalances[productId] || [])[weekIndex] ?? 0;

    setIsSubmittingAjuste(true);

    const { error } = await kardexService.insertAjuste({
      product_id: productId,
      year: selectedYear,
      month: selectedMonth,
      week_index: weekIndex,
      saldo_anterior: saldoAnterior,
      saldo_nuevo: numValue,
      motivo: ajusteMotivo.trim(),
    });

    if (error) {
      console.error("Error guardando el ajuste:", error);
      setIsSubmittingAjuste(false);
      toast.error("No se pudo guardar la corrección del saldo. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }

    // Actualiza el saldo en pantalla al instante (sin recargar la página):
    // registra el override localmente y guarda el encadenado recalculado.
    const newProductPrev = applyAjuste(productId, weekIndex, numValue);
    await saveProductData(productId, exits[productId] || [], entries[productId] || [], newProductPrev);

    setIsSubmittingAjuste(false);
    setAjusteProduct(null);
    setAjusteMotivo("");
    toast.success(`Saldo corregido: ${ajusteProduct.name} quedó en ${numValue}.`);
  };

  // --- Historial: meses con datos registrados + registro de ajustes ---
  const [showHistorial, setShowHistorial] = useState(false);
  const [historialTab, setHistorialTab] = useState<"meses" | "ajustes">("meses");
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [monthsWithData, setMonthsWithData] = useState<{ year: number; month: number }[]>([]);
  const [ajustesHistory, setAjustesHistory] = useState<AjusteRow[]>([]);

  const openHistorial = async () => {
    setShowHistorial(true);
    setIsLoadingHistorial(true);

    const [monthsResult, ajustesResult] = await Promise.all([
      dataSource.loadMonthsWithData(),
      dataSource.loadAjustesHistory(),
    ]);

    if (monthsResult.error) console.error("Error cargando meses con historial:", monthsResult.error);
    if (ajustesResult.error) console.error("Error cargando el historial de ajustes:", ajustesResult.error);

    const uniqueMonths = new Map<string, { year: number; month: number }>();
    (monthsResult.data || []).forEach((row) => {
      uniqueMonths.set(`${row.year}-${row.month}`, { year: row.year, month: row.month });
    });
    const sortedMonths = Array.from(uniqueMonths.values()).sort((a, b) => b.year - a.year || b.month - a.month);

    setMonthsWithData(sortedMonths);
    setAjustesHistory((ajustesResult.data as AjusteRow[]) || []);
    setIsLoadingHistorial(false);
  };

  const closeHistorial = () => setShowHistorial(false);

  const jumpToMonth = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    setCurrentWeek(1);
    setShowHistorial(false);
  };

  const getProductName = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? productId;

  const handleExportExcel = async () => {
    try {
      await exportKardexToExcel({
        community,
        selectedMonth,
        selectedYear,
        calendarWeeks,
        products,
        exits,
        entries,
        prevBalances,
      });
      toast.success(`Excel descargado: ${MONTH_NAMES[selectedMonth]} ${selectedYear}.`);
    } catch (e) {
      console.error("Error exportando a Excel:", e);
      toast.error("No se pudo descargar el Excel. Inténtalo de nuevo.");
    }
  };

  const handleExportPDF = async () => {
    try {
      await exportKardexToPDF({
        community,
        selectedMonth,
        selectedYear,
        calendarWeeks,
        products,
        exits,
        entries,
        prevBalances,
      });
      toast.success(`PDF descargado: ${MONTH_NAMES[selectedMonth]} ${selectedYear}.`);
    } catch (e) {
      console.error("Error exportando a PDF:", e);
      toast.error("No se pudo descargar el PDF. Inténtalo de nuevo.");
    }
  };

  const categories = ["TODAS", ...Array.from(new Set(products.map(p => p.category)))];

  const filteredProducts = activeCategory === "TODAS"
    ? products
    : products.filter(p => p.category === activeCategory);

  // Options for custom selects
  const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }));
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i)
    .map(y => ({ value: String(y), label: String(y) }));
  const categoryOptions = categories.map(c => ({ value: c, label: c === "TODAS" ? "Todas las categorías" : c }));

  return (
    <div className="kardex-page">
      {confirmingLogout && <UnsavedChangesDialog onLeave={onLogout} onStay={() => setConfirmingLogout(false)} />}

      <KardexHeader
        community={community}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        monthOptions={monthOptions}
        yearOptions={yearOptions}
        onMonthChange={setSelectedMonth}
        onYearChange={setSelectedYear}
        onExportExcel={handleExportExcel}
        onExportPDF={handleExportPDF}
        onOpenHistorial={openHistorial}
        onLogout={handleLogout}
        saveStatus={saveStatus}
        onRetrySave={retrySave}
        readOnly={readOnly}
        logoutLabel={logoutLabel}
      />

      <KardexNavigation
        currentWeek={currentWeek}
        onWeekChange={setCurrentWeek}
        weekCount={weekCount}
        categoryOptions={categoryOptions}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        weekStates={readOnly ? undefined : weekStates}
      />

      {!readOnly && (
        <WeekSubmitBar
          currentWeek={currentWeek}
          submission={weekSubmissions.submissions.find((s) => s.week_index === currentWeek - 1)}
          saveStatus={saveStatus}
          isSubmitting={weekSubmissions.isSubmitting}
          message={weekSubmissions.message}
          onSubmit={() => weekSubmissions.submit(currentWeek - 1)}
        />
      )}

      <KardexTable
        isLoading={isLoading || isLoadingProducts}
        currentWeek={currentWeek}
        currentWeekDates={currentWeekDates}
        isClosingWeek={isExtraWeek(currentWeek - 1)}
        filteredProducts={filteredProducts}
        exits={exits}
        entries={entries}
        prevBalances={prevBalances}
        onExitChange={handleExitChange}
        onEntryChange={handleEntryChange}
        onOpenAjuste={openAjuste}
        readOnly={locked}
      />

      {ajusteProduct && (
        <AjusteModal
          product={ajusteProduct}
          currentWeek={currentWeek}
          currentBalance={(prevBalances[ajusteProduct.id] || [])[currentWeek - 1] ?? 0}
          isBootstrap={isBootstrapAjuste}
          value={ajusteValue}
          motivo={ajusteMotivo}
          isSubmitting={isSubmittingAjuste}
          onValueChange={setAjusteValue}
          onMotivoChange={setAjusteMotivo}
          onSubmit={submitAjuste}
          onClose={closeAjuste}
        />
      )}

      {showHistorial && (
        <HistorialModal
          community={community}
          historialTab={historialTab}
          isLoadingHistorial={isLoadingHistorial}
          monthsWithData={monthsWithData}
          ajustesHistory={ajustesHistory}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onTabChange={setHistorialTab}
          onClose={closeHistorial}
          onJumpToMonth={jumpToMonth}
          getProductName={getProductName}
        />
      )}

      {loadError && !isLoading && (
        <div role="alert" className="kardex-save-banner">
          <span>
            <strong>No se pudieron cargar los datos de este mes.</strong>{" "}
            La tabla queda bloqueada para no sobrescribir nada. Revisa tu conexión.
          </span>
          <button type="button" className="btn kardex-save-banner-btn" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

    </div>
  );
}
