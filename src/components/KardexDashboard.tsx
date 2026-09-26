"use client";

import "@/app/kardex.css";
import { useState } from "react";
import { INITIAL_PRODUCTS } from "@/data/products";
import { AjusteRow, Product } from "@/types/kardex";
import KardexHeader from "@/components/KardexHeader";
import KardexNavigation from "@/components/KardexNavigation";
import KardexTable from "@/components/KardexTable";
import AjusteModal from "@/components/AjusteModal";
import HistorialModal from "@/components/HistorialModal";
import ErrorToast from "@/components/ErrorToast";
import { useCalendar } from "@/hooks/useCalendar";
import { useErrorAlert } from "@/hooks/useErrorAlert";
import { useKardexData } from "@/hooks/useKardexData";
import { sumRange } from "@/lib/balanceEngine";
import { kardexService } from "@/lib/kardexService";
import { exportKardexToExcel } from "@/lib/exporters/excelExporter";
import { exportKardexToPDF } from "@/lib/exporters/pdfExporter";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function KardexDashboard({ community, onLogout }: { community: string, onLogout: () => void }) {
  const [currentWeek, setCurrentWeek] = useState(1);
  const [activeCategory, setActiveCategory] = useState("TODAS");
  const [selectedMonth, setSelectedMonth] = useState(8); // Septiembre (0-indexado)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { calendarWeeks, currentWeekDates } = useCalendar(selectedYear, selectedMonth, currentWeek);
  const { errorToast, scheduleErrorCheck } = useErrorAlert();

  const {
    isLoading,
    exits,
    entries,
    prevBalances,
    ajustesByProduct,
    inheritedBase,
    saveProductData,
    updateLocalState,
    applyAjuste
  } = useKardexData(community, selectedYear, selectedMonth);

  const handleExitChange = (productId: string, dayIndex: number, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    const absoluteDayIndex = ((currentWeek - 1) * 7) + dayIndex;
    const newProductExits = [...(exits[productId] || [])];
    newProductExits[absoluteDayIndex] = numValue;

    const newProductPrev = updateLocalState(productId, newProductExits, entries[productId] || []);

    const weekIndex = currentWeek - 1;
    const weekExits = sumRange(newProductExits, weekIndex * 7, 7);
    const weekBalance = (newProductPrev[weekIndex] ?? 0) + ((entries[productId] || [])[weekIndex] ?? 0) - weekExits;
    scheduleErrorCheck(productId, INITIAL_PRODUCTS.find(p => p.id === productId)?.name || productId, weekIndex, weekBalance);

    saveProductData(productId, newProductExits, entries[productId] || [], newProductPrev);
  };

  const handleEntryChange = (productId: string, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    const newProductEntries = [...(entries[productId] || [])];
    newProductEntries[currentWeek - 1] = numValue;

    const newProductPrev = updateLocalState(productId, exits[productId] || [], newProductEntries);

    const weekIndex = currentWeek - 1;
    const weekExits = sumRange(exits[productId] || [], weekIndex * 7, 7);
    const weekBalance = (newProductPrev[weekIndex] ?? 0) + (newProductEntries[weekIndex] ?? 0) - weekExits;
    scheduleErrorCheck(productId, INITIAL_PRODUCTS.find(p => p.id === productId)?.name || productId, weekIndex, weekBalance);

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
      community,
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
      return;
    }

    // Actualiza el saldo en pantalla al instante (sin recargar la página):
    // registra el override localmente y guarda el encadenado recalculado.
    const newProductPrev = applyAjuste(productId, weekIndex, numValue);
    await saveProductData(productId, exits[productId] || [], entries[productId] || [], newProductPrev);

    setIsSubmittingAjuste(false);
    setAjusteProduct(null);
    setAjusteMotivo("");
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
      kardexService.loadMonthsWithData(community),
      kardexService.loadAjustesHistory(community),
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
    INITIAL_PRODUCTS.find((p) => p.id === productId)?.name ?? productId;

  const handleExportExcel = () => exportKardexToExcel({
    community,
    selectedMonth,
    selectedYear,
    calendarWeeks,
    exits,
    entries,
    prevBalances,
  });

  const handleExportPDF = () => exportKardexToPDF({
    community,
    selectedMonth,
    selectedYear,
    calendarWeeks,
    exits,
    entries,
    prevBalances,
  });

  const categories = ["TODAS", ...Array.from(new Set(INITIAL_PRODUCTS.map(p => p.category)))];

  const filteredProducts = activeCategory === "TODAS"
    ? INITIAL_PRODUCTS
    : INITIAL_PRODUCTS.filter(p => p.category === activeCategory);

  // Options for custom selects
  const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }));
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i)
    .map(y => ({ value: String(y), label: String(y) }));
  const categoryOptions = categories.map(c => ({ value: c, label: c === "TODAS" ? "Todas las categorías" : c }));

  return (
    <div className="kardex-page">

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
        onLogout={onLogout}
      />

      <KardexNavigation
        currentWeek={currentWeek}
        onWeekChange={setCurrentWeek}
        categoryOptions={categoryOptions}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      <KardexTable
        isLoading={isLoading}
        currentWeek={currentWeek}
        currentWeekDates={currentWeekDates}
        filteredProducts={filteredProducts}
        exits={exits}
        entries={entries}
        prevBalances={prevBalances}
        onExitChange={handleExitChange}
        onEntryChange={handleEntryChange}
        onOpenAjuste={openAjuste}
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

      <ErrorToast message={errorToast} />

    </div>
  );
}
