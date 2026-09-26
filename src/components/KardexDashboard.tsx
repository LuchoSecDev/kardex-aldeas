"use client";

import { useState, useEffect, useRef } from "react";
import { INITIAL_PRODUCTS } from "@/data/products";
import CustomSelect from "@/components/CustomSelect";
import { supabase } from "@/lib/supabase";

const DAYS = ["L", "M", "MC", "J", "V", "S", "D"];
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Suma un rango de un arreglo de números (usado para sumar las salidas de una semana).
const sumRange = (arr: number[], start: number, len: number) =>
  arr.slice(start, start + len).reduce((a, b) => a + b, 0);

// Calcula el saldo anterior de cada una de las 5 semanas, encadenando hacia
// adelante. `overrides` son ajustes auditados: si la semana w tiene un
// ajuste, ese valor manda para esa semana (y las siguientes se calculan a
// partir de él); si no, se calcula desde el saldo final de la semana previa.
// La semana 0 sin ajuste hereda el saldo final del mes anterior.
const computeCascade = (
  inheritedBase: number,
  overrides: Record<number, number>,
  entriesArr: number[],
  exitsArr: number[]
): number[] => {
  const result = Array(5).fill(0);
  for (let w = 0; w < 5; w++) {
    if (overrides[w] !== undefined) {
      result[w] = overrides[w];
    } else if (w === 0) {
      result[w] = inheritedBase;
    } else {
      const prevWeekExits = sumRange(exitsArr, (w - 1) * 7, 7);
      result[w] = result[w - 1] + (entriesArr[w - 1] || 0) - prevWeekExits;
    }
  }
  return result;
};

// Saldo con el que un mes termina (semana 5), para heredarlo como saldo
// anterior de la semana 1 del mes siguiente.
const finalBalanceOfMonth = (row: { prev_balances: number[]; entries: number[]; exits: number[] }) => {
  const w = 4;
  const weekExits = sumRange(row.exits, w * 7, 7);
  return (row.prev_balances[w] || 0) + (row.entries[w] || 0) - weekExits;
};

// Beep corto de alerta, sintetizado con Web Audio (no necesita ningún
// archivo de audio). Se usa para avisar de un error de digitación
// (saldo negativo) aunque la persona no esté mirando la pantalla.
const playErrorBeep = () => {
  try {
    type WindowWithWebkitAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 440;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => ctx.close();
  } catch (e) {
    console.error("No se pudo reproducir el sonido de alerta:", e);
  }
};

// Semáforo de stock: rojo si ya se agotó, amarillo si está en o por debajo
// del umbral mínimo del producto (`minStock`, ver products.ts), verde si
// hay suficiente.
//
// Por ahora solo se muestra el rojo (es la señal de error de digitación que
// sí se usa, ver notifyDataEntryError más abajo). Amarillo/verde quedan
// calculados pero ocultos en el render hasta que existan umbrales reales
// por producto — reactivarlos es solo volver a usar `statusMeta` en el JSX.
type StockStatus = "rojo" | "amarillo" | "verde";

const getStockStatus = (balance: number, minStock: number): StockStatus => {
  if (balance < 0) return "rojo";
  if (balance <= minStock) return "amarillo";
  return "verde";
};

const STOCK_STATUS_META: Record<StockStatus, { color: string; emoji: string; label: string }> = {
  rojo: { color: "var(--color-accent-red)", emoji: "🔴", label: "Sin stock" },
  amarillo: { color: "var(--color-warning)", emoji: "🟡", label: "Stock bajo" },
  verde: { color: "var(--color-success)", emoji: "🟢", label: "Stock suficiente" },
};

type AjusteRow = {
  id: string;
  product_id: string;
  year: number;
  month: number;
  week_index: number;
  saldo_anterior: number;
  saldo_nuevo: number;
  motivo: string;
  created_at: string;
};

export default function KardexDashboard({ community, onLogout }: { community: string, onLogout: () => void }) {
  const [currentWeek, setCurrentWeek] = useState(1);
  const [activeCategory, setActiveCategory] = useState("TODAS");
  const [selectedMonth, setSelectedMonth] = useState(8); // Septiembre (0-indexado)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Calcular calendario dinámico
  const getCalendarWeeks = (y: number, m: number) => {
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Lunes es 0
    
    const weeks: (number | null)[][] = [];
    let currentDay = 1;
    for (let w = 0; w < 5; w++) {
      const days: (number | null)[] = [];
      for (let d = 0; d < 7; d++) {
        if (w === 0 && d < startDayOfWeek) {
          days.push(null);
        } else if (currentDay > lastDay.getDate()) {
          days.push(null);
        } else {
          days.push(currentDay);
          currentDay++;
        }
      }
      weeks.push(days);
    }
    return weeks;
  };

  const calendarWeeks = getCalendarWeeks(selectedYear, selectedMonth);
  const currentWeekDates = calendarWeeks[currentWeek - 1];

  // State structured per week (0 to 4)
  const [isLoading, setIsLoading] = useState(true);
  const [exits, setExits] = useState<Record<string, number[]>>(
    INITIAL_PRODUCTS.reduce((acc, p) => ({ ...acc, [p.id]: Array(35).fill(0) }), {})
  );
  const [entries, setEntries] = useState<Record<string, number[]>>(
    INITIAL_PRODUCTS.reduce((acc, p) => ({ ...acc, [p.id]: [0, 0, 0, 0, 0] }), {})
  );
  const [prevBalances, setPrevBalances] = useState<Record<string, number[]>>(
    INITIAL_PRODUCTS.reduce((acc, p) => ({ ...acc, [p.id]: [0, 0, 0, 0, 0] }), {})
  );
  // Ajustes auditados vigentes de este mes: productId -> { weekIndex: saldo_nuevo }
  const [ajustesByProduct, setAjustesByProduct] = useState<Record<string, Record<number, number>>>({});
  // Saldo con el que cerró el mes anterior, por producto (para heredar en la semana 1)
  const [inheritedBase, setInheritedBase] = useState<Record<string, number>>({});

  // Cargar datos desde Supabase: el mes actual, el mes anterior (para heredar
  // el saldo de cierre) y los ajustes auditados vigentes de este mes.
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear -= 1;
      }

      const [{ data, error }, prevMonthResult, ajustesResult] = await Promise.all([
        supabase.from("kardex_records").select("*").eq("community", community).eq("year", selectedYear).eq("month", selectedMonth),
        supabase.from("kardex_records").select("*").eq("community", community).eq("year", prevYear).eq("month", prevMonth),
        supabase.from("ajustes").select("*").eq("community", community).eq("year", selectedYear).eq("month", selectedMonth).order("created_at", { ascending: true }),
      ]);

      if (error) console.error("Error cargando datos de Supabase:", error);
      if (prevMonthResult.error) console.error("Error cargando el mes anterior:", prevMonthResult.error);
      if (ajustesResult.error) console.error("Error cargando ajustes:", ajustesResult.error);

      const inheritedBaseByProduct: Record<string, number> = {};
      (prevMonthResult.data || []).forEach(row => {
        inheritedBaseByProduct[row.product_id] = finalBalanceOfMonth(row);
      });

      // Ordenados por fecha ascendente: el último ajuste de cada semana
      // sobreescribe a los anteriores, que quedan igual en el historial.
      const overridesByProduct: Record<string, Record<number, number>> = {};
      (ajustesResult.data || []).forEach(row => {
        if (!overridesByProduct[row.product_id]) overridesByProduct[row.product_id] = {};
        overridesByProduct[row.product_id][row.week_index] = row.saldo_nuevo;
      });

      const newExits: Record<string, number[]> = {};
      const newEntries: Record<string, number[]> = {};
      const newPrev: Record<string, number[]> = {};

      INITIAL_PRODUCTS.forEach(p => {
        const row = (data || []).find(r => r.product_id === p.id);
        const productExits = row ? row.exits : Array(35).fill(0);
        const productEntries = row ? row.entries : [0, 0, 0, 0, 0];
        const base = inheritedBaseByProduct[p.id] ?? 0;
        const overrides = overridesByProduct[p.id] || {};

        newExits[p.id] = productExits;
        newEntries[p.id] = productEntries;
        newPrev[p.id] = computeCascade(base, overrides, productEntries, productExits);
      });

      setExits(newExits);
      setEntries(newEntries);
      setPrevBalances(newPrev);
      setAjustesByProduct(overridesByProduct);
      setInheritedBase(inheritedBaseByProduct);
      setIsLoading(false);
    };

    loadData();
  }, [community, selectedYear, selectedMonth]);

  // Guardar en Supabase (Upsert)
  const saveProductData = async (productId: string, prodExits: number[], prodEntries: number[], prodPrev: number[]) => {
    const { error } = await supabase
      .from("kardex_records")
      .upsert({
        community,
        year: selectedYear,
        month: selectedMonth,
        product_id: productId,
        exits: prodExits,
        entries: prodEntries,
        prev_balances: prodPrev,
        updated_at: new Date().toISOString()
      }, { onConflict: 'community, year, month, product_id' });
      
    if (error) {
      console.error("Error guardando en Supabase:", error);
    }
  };

  // --- Aviso de error de digitación (saldo quedó negativo) ---
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorCheckTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!errorToast) return;
    const timer = setTimeout(() => setErrorToast(null), 5000);
    return () => clearTimeout(timer);
  }, [errorToast]);

  // Espera a que la persona haga una pausa (600ms) antes de avisar, para no
  // sonar en cada tecla mientras se escribe un número de varias cifras.
  const scheduleErrorCheck = (productId: string, weekIndex: number, weekBalance: number) => {
    const key = `${productId}-${weekIndex}`;
    if (errorCheckTimers.current[key]) clearTimeout(errorCheckTimers.current[key]);
    errorCheckTimers.current[key] = setTimeout(() => {
      delete errorCheckTimers.current[key];
      if (weekBalance < 0) {
        setErrorToast(`⚠️ ${getProductName(productId)} — el saldo de la Semana ${weekIndex + 1} quedó en ${weekBalance}. Revisa las salidas.`);
        playErrorBeep();
      }
    }, 600);
  };

  const handleExitChange = (productId: string, dayIndex: number, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    const absoluteDayIndex = ((currentWeek - 1) * 7) + dayIndex;
    const newProductExits = [...exits[productId]];
    newProductExits[absoluteDayIndex] = numValue;

    const newProductPrev = computeCascade(
      inheritedBase[productId] ?? 0,
      ajustesByProduct[productId] || {},
      entries[productId],
      newProductExits
    );

    const weekIndex = currentWeek - 1;
    const weekExits = sumRange(newProductExits, weekIndex * 7, 7);
    const weekBalance = (newProductPrev[weekIndex] ?? 0) + (entries[productId][weekIndex] ?? 0) - weekExits;
    scheduleErrorCheck(productId, weekIndex, weekBalance);

    setExits(prev => ({ ...prev, [productId]: newProductExits }));
    setPrevBalances(prev => ({ ...prev, [productId]: newProductPrev }));
    saveProductData(productId, newProductExits, entries[productId], newProductPrev);
  };

  const handleEntryChange = (productId: string, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    const newProductEntries = [...entries[productId]];
    newProductEntries[currentWeek - 1] = numValue;

    const newProductPrev = computeCascade(
      inheritedBase[productId] ?? 0,
      ajustesByProduct[productId] || {},
      newProductEntries,
      exits[productId]
    );

    const weekIndex = currentWeek - 1;
    const weekExits = sumRange(exits[productId], weekIndex * 7, 7);
    const weekBalance = (newProductPrev[weekIndex] ?? 0) + (newProductEntries[weekIndex] ?? 0) - weekExits;
    scheduleErrorCheck(productId, weekIndex, weekBalance);

    setEntries(prev => ({ ...prev, [productId]: newProductEntries }));
    setPrevBalances(prev => ({ ...prev, [productId]: newProductPrev }));
    saveProductData(productId, exits[productId], newProductEntries, newProductPrev);
  };

  // --- Ajuste auditado: la única forma de corregir un saldo anterior ---
  const [ajusteProduct, setAjusteProduct] = useState<(typeof INITIAL_PRODUCTS)[number] | null>(null);
  const [ajusteValue, setAjusteValue] = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [isSubmittingAjuste, setIsSubmittingAjuste] = useState(false);
  // true si es el primer registro real de este producto (no hay mes anterior del
  // cual heredar ni ajustes previos): no es una "corrección", es el arranque.
  const [isBootstrapAjuste, setIsBootstrapAjuste] = useState(false);

  const openAjuste = (product: (typeof INITIAL_PRODUCTS)[number]) => {
    const weekIndex = currentWeek - 1;
    const bootstrap =
      weekIndex === 0 &&
      inheritedBase[product.id] === undefined &&
      ajustesByProduct[product.id]?.[0] === undefined;

    setAjusteProduct(product);
    setAjusteValue(String(prevBalances[product.id][weekIndex] ?? 0));
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
    const saldoAnterior = prevBalances[productId][weekIndex] ?? 0;

    setIsSubmittingAjuste(true);

    const { error } = await supabase.from("ajustes").insert({
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

    const newOverrides = { ...(ajustesByProduct[productId] || {}), [weekIndex]: numValue };
    setAjustesByProduct(prev => ({ ...prev, [productId]: newOverrides }));

    const newProductPrev = computeCascade(inheritedBase[productId] ?? 0, newOverrides, entries[productId], exits[productId]);
    setPrevBalances(prev => ({ ...prev, [productId]: newProductPrev }));
    await saveProductData(productId, exits[productId], entries[productId], newProductPrev);

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
      supabase.from("kardex_records").select("year, month").eq("community", community),
      supabase.from("ajustes").select("*").eq("community", community).order("created_at", { ascending: false }).limit(200),
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

  const calculateBalance = (product: (typeof INITIAL_PRODUCTS)[number]) => {
    if (!exits[product.id] || !prevBalances[product.id] || !entries[product.id]) return 0;

    const weekIndex = currentWeek - 1;
    const startDay = weekIndex * 7;
    const endDay = startDay + 7;
    
    const weekExits = (exits[product.id] || Array(35).fill(0)).slice(startDay, endDay).reduce((a: number, b: number) => a + b, 0);
    const prevBalance = (prevBalances[product.id] || [])[weekIndex] || 0;
    const entry = (entries[product.id] || [])[weekIndex] || 0;
    
    return prevBalance + entry - weekExits;
  };

  const handleExportExcel = async () => {
    const { default: ExcelJS } = await import("exceljs");

    const monthName = MONTH_NAMES[selectedMonth];
    const allWeeks = getCalendarWeeks(selectedYear, selectedMonth);

    // Layout: 3 columnas fijas (ALIMENTO, UNIDAD DE MEDIDA, SALDO ANTERIOR)
    // + 5 semanas de 9 columnas cada una (ENTRADA, L, M, MC, J, V, S, D, SALDO)
    const FIXED_COLS = 3;
    const WEEK_BLOCK = 9;
    const TOTAL_COLS = FIXED_COLS + 5 * WEEK_BLOCK; // 48

    const HEADER_FILL: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    const CATEGORY_FILL: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F0D9" } };
    const THIN_GRAY = { style: "thin" as const, color: { argb: "FF808080" } };
    const ALL_BORDERS: Partial<import("exceljs").Borders> = { top: THIN_GRAY, left: THIN_GRAY, bottom: THIN_GRAY, right: THIN_GRAY };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kardex digital", {
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.5, footer: 0.5 },
      },
      views: [{ state: "frozen", xSplit: FIXED_COLS, ySplit: 6 }],
    });

    // Anchos de columna, fieles al formato original
    const widths: number[] = [30, 14, 12];
    for (let w = 0; w < 5; w++) {
      widths.push(13.5546875); // ENTRADA
      for (let d = 0; d < 7; d++) widths.push(5.21875); // L,M,MC,J,V,S,D
      widths.push(11.109375); // SALDO
    }
    widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    type CellOpts = { bold?: boolean; fill?: import("exceljs").Fill; align?: "left" | "center"; border?: boolean };
    const setCell = (row: number, col: number, value: unknown, opts: CellOpts = {}) => {
      const cell = sheet.getCell(row, col);
      cell.value = value as import("exceljs").CellValue;
      cell.font = { bold: !!opts.bold, size: 11, name: "Calibri" };
      if (opts.fill) cell.fill = opts.fill;
      if (opts.border !== false) cell.border = ALL_BORDERS;
      cell.alignment = { horizontal: opts.align ?? "center", vertical: "middle", wrapText: opts.align !== "left" };
      return cell;
    };

    // Fila 1: Encabezado institucional (una sola celda combinada)
    sheet.mergeCells(1, 1, 1, 45);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = "ALDEAS INFANTILES SOS — MOVIMIENTO DIARIO DE ALIMENTOS — KARDEX";
    titleCell.font = { bold: true, size: 14, name: "Calibri" };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 28.05;

    // Fila 2: MES / COMUNIDAD
    sheet.getRow(2).height = 22.05;
    const boldNoBorder = { bold: true, size: 11, name: "Calibri" };
    sheet.getCell(2, 1).value = "MES:";
    sheet.getCell(2, 1).font = boldNoBorder;
    sheet.getCell(2, 2).value = monthName;
    sheet.getCell(2, 2).font = boldNoBorder;
    sheet.getCell(2, 4).value = "COMUNIDAD:";
    sheet.getCell(2, 4).font = boldNoBorder;
    sheet.getCell(2, 5).value = community;
    sheet.getCell(2, 5).font = boldNoBorder;

    // Fila 3: títulos "SEMANA 1..5" combinados sobre cada bloque de 9 columnas
    sheet.getRow(3).height = 22.05;
    for (let c = 1; c <= FIXED_COLS; c++) setCell(3, c, "");
    for (let w = 0; w < 5; w++) {
      const startCol = FIXED_COLS + 1 + w * WEEK_BLOCK;
      sheet.mergeCells(3, startCol, 3, startCol + WEEK_BLOCK - 1);
      setCell(3, startCol, `SEMANA ${w + 1}`, { bold: true, fill: HEADER_FILL });
    }

    // Fila 4: encabezados de columna
    sheet.getRow(4).height = 22.05;
    const headers = ["ALIMENTO", "UNIDAD DE MEDIDA", "SALDO ANTERIOR"];
    for (let w = 0; w < 5; w++) headers.push("ENTRADA", "L", "M", "MC", "J", "V", "S", "D", "SALDO");
    headers.forEach((h, i) => setCell(4, i + 1, h, { bold: true, fill: HEADER_FILL }));

    // Fila 5: números de fecha bajo cada día
    sheet.getRow(5).height = 22.05;
    for (let c = 1; c <= FIXED_COLS; c++) setCell(5, c, "", { fill: HEADER_FILL });
    for (let w = 0; w < 5; w++) {
      const startCol = FIXED_COLS + 1 + w * WEEK_BLOCK;
      setCell(5, startCol, "", { fill: HEADER_FILL }); // ENTRADA sin fecha
      const weekDates = allWeeks[w];
      for (let d = 0; d < 7; d++) {
        setCell(5, startCol + 1 + d, weekDates[d] !== null ? weekDates[d] : "", { fill: HEADER_FILL });
      }
      setCell(5, startCol + 8, "", { fill: HEADER_FILL }); // SALDO sin fecha
    }

    // Filas de productos, agrupadas por categoría
    let currentRow = 6;
    let lastCategory = "";

    INITIAL_PRODUCTS.forEach((product) => {
      if (product.category !== lastCategory) {
        sheet.getRow(currentRow).height = 22.05;
        sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLS);
        setCell(currentRow, 1, product.category, { bold: true, fill: CATEGORY_FILL, align: "left" });
        lastCategory = product.category;
        currentRow++;
      }

      sheet.getRow(currentRow).height = 22.05;
      setCell(currentRow, 1, product.name, { align: "left" });
      setCell(currentRow, 2, product.unit);
      setCell(currentRow, 3, prevBalances[product.id][0] || "");

      for (let w = 0; w < 5; w++) {
        const startCol = FIXED_COLS + 1 + w * WEEK_BLOCK;
        const startDay = w * 7;
        const pEntries = entries[product.id] || [];
        const pExits = exits[product.id] || Array(35).fill(0);
        const pPrev = prevBalances[product.id] || [];

        setCell(currentRow, startCol, pEntries[w] || "");
        for (let d = 0; d < 7; d++) {
          setCell(currentRow, startCol + 1 + d, pExits[startDay + d] || "");
        }
        const weekExits = pExits.slice(startDay, startDay + 7).reduce((a: number, b: number) => a + b, 0);
        const bal = (pPrev[w] || 0) + (pEntries[w] || 0) - weekExits;
        setCell(currentRow, startCol + 8, bal);
      }
      currentRow++;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Kardex_${community}_${monthName}_${selectedYear}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: JsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const monthName = MONTH_NAMES[selectedMonth];
    const allWeeks = getCalendarWeeks(selectedYear, selectedMonth);

    // 48 columnas no caben en una hoja impresa: una tabla por semana (igual
    // que la vista en pantalla), con salto de página automático si una
    // semana no cabe completa.
    const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    const drawHeader = (weekLabel: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("ALDEAS INFANTILES SOS — MOVIMIENTO DIARIO DE ALIMENTOS — KARDEX", pageWidth / 2, 28, { align: "center" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`MES: ${monthName}    COMUNIDAD: ${community}    ${weekLabel}`, pageWidth / 2, 44, { align: "center" });
    };

    for (let w = 0; w < 5; w++) {
      if (w > 0) doc.addPage();

      const weekDates = allWeeks[w];
      const head = [[
        "ALIMENTO", "UNIDAD", "SALDO ANT.", "ENTRADA",
        ...DAYS.map((d, i) => (weekDates[i] !== null ? `${d} (${weekDates[i]})` : d)),
        "SALDO FINAL",
      ]];

      const TOTAL_TABLE_COLS = 4 + 7 + 1; // ALIMENTO, UNIDAD, SALDO ANT, ENTRADA + 7 días + SALDO FINAL
      const body: (string | number | { content: string; colSpan: number; styles: Record<string, unknown> })[][] = [];
      let lastCategory = "";
      const startDay = w * 7;

      INITIAL_PRODUCTS.forEach((product) => {
        if (product.category !== lastCategory) {
          body.push([{
            content: product.category,
            colSpan: TOTAL_TABLE_COLS,
            styles: { fillColor: [226, 240, 217], textColor: [0, 0, 0], fontStyle: "bold", halign: "left" },
          }]);
          lastCategory = product.category;
        }

        const pExits = exits[product.id] || Array(35).fill(0);
        const pPrev = prevBalances[product.id] || [];
        const pEntries = entries[product.id] || [];

        const weekExits = pExits.slice(startDay, startDay + 7).reduce((a: number, b: number) => a + b, 0);
        const prevBalance = pPrev[w] ?? 0;
        const entry = pEntries[w] ?? 0;
        const finalBalance = prevBalance + entry - weekExits;

        body.push([
          product.name,
          product.unit,
          prevBalance,
          entry,
          ...DAYS.map((_, d) => exits[product.id][startDay + d] || ""),
          finalBalance,
        ]);
      });

      autoTable(doc, {
        head,
        body,
        startY: 55,
        margin: { top: 55, left: 25, right: 25, bottom: 25 },
        styles: { fontSize: 7, cellPadding: 3, halign: "center", valign: "middle" },
        headStyles: { fillColor: [0, 133, 202], textColor: 255, fontSize: 7 },
        columnStyles: { 0: { halign: "left", cellWidth: 110 }, 1: { cellWidth: 55 } },
        didDrawPage: () => drawHeader(`SEMANA ${w + 1}`),
      });
    }

    doc.save(`Kardex_${community}_${monthName}_${selectedYear}.pdf`);
  };

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
    <div style={{ padding: "var(--spacing-base)", maxWidth: "1400px", margin: "0 auto" }}>
      
      {/* Header */}
      <div className="card" style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <div>
            <h2 style={{ marginBottom: "0.2rem" }}>Comunidad {community}</h2>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <CustomSelect
                options={monthOptions}
                value={String(selectedMonth)}
                onChange={(v) => setSelectedMonth(parseInt(v))}
                style={{ minWidth: "170px" }}
              />
              <CustomSelect
                options={yearOptions}
                value={String(selectedYear)}
                onChange={(v) => setSelectedYear(parseInt(v))}
                style={{ minWidth: "110px" }}
              />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={handleExportExcel}>
            <svg style={{ width: "20px", height: "20px", marginRight: "8px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Descargar Excel
          </button>
          <button className="btn" style={{ border: "2px solid var(--color-border)" }} onClick={handleExportPDF}>
            <svg style={{ width: "20px", height: "20px", marginRight: "8px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Descargar PDF
          </button>
          <button className="btn" style={{ border: "2px solid var(--color-border)" }} onClick={openHistorial}>Historial</button>
          <button className="btn" style={{ border: "2px solid var(--color-border)" }} onClick={onLogout}>Cambiar Comunidad</button>
        </div>
      </div>

      {/* Control Panel */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div className="card" style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ fontSize: "1.1rem" }}>Navegación</h3>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5].map(week => (
              <button
                key={week}
                onClick={() => setCurrentWeek(week)}
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
              onChange={setActiveCategory}
            />
          </div>
        </div>
      </div>

      {/* Main Table */}
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
                <th style={{ width: "20%", position: "sticky", left: 0, zIndex: 2, backgroundColor: "var(--color-primary-dark)" }}>ALIMENTO</th>
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
                const balance = calculateBalance(product);
                const stockStatus = getStockStatus(balance, product.minStock);
                const statusMeta = STOCK_STATUS_META[stockStatus];
                const isRowInError = stockStatus === "rojo";
                const weekIndex = currentWeek - 1;
                const absoluteDayStart = weekIndex * 7;

                return (
                  <tr key={product.id}>
                    <td style={{ fontWeight: "500", position: "sticky", left: 0, zIndex: 1, backgroundColor: "var(--color-bg-card)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" }}>{product.name}</td>
                    <td style={{ color: "var(--color-text-muted)", fontSize: "0.9em" }}>{product.unit}</td>
                    
                    {/* Saldo Anterior: calculado automáticamente. Solo se corrige
                        con un ajuste auditado (motivo + registro), nunca editando
                        el número directamente. */}
                    <td style={{ padding: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                        <span style={{ fontWeight: 600 }}>{(prevBalances[product.id] || [])[weekIndex] ?? 0}</span>
                        <button
                          type="button"
                          onClick={() => openAjuste(product)}
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
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="input-field"
                        style={{
                          padding: "0.5rem",
                          textAlign: "center",
                          width: "100%",
                          minWidth: "70px",
                          borderColor: isRowInError ? "var(--color-accent-red)" : undefined,
                          boxShadow: isRowInError ? "0 0 0 2px rgba(230, 51, 69, 0.15)" : undefined,
                        }}
                        value={(entries[product.id] || [])[weekIndex] || ""}
                        onChange={(e) => handleEntryChange(product.id, e.target.value)}
                      />
                    </td>

                    {/* Salidas diarias */}
                    {DAYS.map((day, idx) => {
                      const isInvalidDay = currentWeekDates[idx] === null;
                      return (
                        <td key={day} style={{ padding: "0.5rem" }}>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            className="input-field"
                            disabled={isInvalidDay}
                            style={{
                              padding: "0.5rem",
                              textAlign: "center",
                              width: "100%",
                              minWidth: "60px",
                              backgroundColor: isInvalidDay ? "#E2E8F0" : (((exits[product.id] || [])[absoluteDayStart + idx] || 0) > 0 ? "rgba(16, 185, 129, 0.1)" : "var(--color-bg-card)"),
                              borderColor: isRowInError ? "var(--color-accent-red)" : (((exits[product.id] || [])[absoluteDayStart + idx] || 0) > 0 ? "var(--color-success)" : "var(--color-border)"),
                              boxShadow: isRowInError ? "0 0 0 2px rgba(230, 51, 69, 0.15)" : undefined,
                              opacity: isInvalidDay ? 0.5 : 1
                            }}
                            value={(exits[product.id] || [])[absoluteDayStart + idx] || ""}
                            onChange={(e) => handleExitChange(product.id, idx, e.target.value)}
                            title={isInvalidDay ? "Día fuera del mes" : ""}
                          />
                        </td>
                      );
                    })}

                    {/* Saldo Final: rojo si quedó negativo (error de digitación).
                        El amarillo/verde del semáforo está oculto por ahora, ver
                        el comentario de STOCK_STATUS_META más arriba. */}
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

      {/* Modal de ajuste auditado */}
      {ajusteProduct && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="card" style={{ maxWidth: "440px", width: "100%" }}>
            <h3 style={{ marginTop: 0 }}>{isBootstrapAjuste ? "Registrar saldo inicial" : "Corregir saldo"}</h3>
            <p style={{ color: "var(--color-text-muted)", marginTop: "-0.5rem" }}>
              {ajusteProduct.name} — Semana {currentWeek}
            </p>
            <p style={{ marginBottom: "1rem" }}>
              {isBootstrapAjuste
                ? "Aún no hay saldo registrado para este producto en esta comunidad."
                : <>Saldo calculado actualmente: <strong>{prevBalances[ajusteProduct.id][currentWeek - 1] ?? 0}</strong></>}
            </p>
            <form onSubmit={submitAjuste} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold" }}>
                  Saldo real (conteo físico)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="input-field"
                  value={ajusteValue}
                  onChange={(e) => setAjusteValue(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold" }}>
                  Motivo del ajuste
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={ajusteMotivo}
                  onChange={(e) => setAjusteMotivo(e.target.value)}
                  placeholder="Ej: conteo físico, producto dañado, donación no registrada..."
                  required
                />
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn"
                  style={{ border: "2px solid var(--color-border)" }}
                  onClick={closeAjuste}
                  disabled={isSubmittingAjuste}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingAjuste}>
                  {isSubmittingAjuste ? "Guardando..." : "Guardar ajuste"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de historial: meses registrados + ajustes auditados */}
      {showHistorial && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="card" style={{ maxWidth: "700px", width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 style={{ margin: 0 }}>Historial — Comunidad {community}</h3>
              <button
                type="button"
                onClick={closeHistorial}
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
                onClick={() => setHistorialTab("meses")}
              >
                Meses registrados
              </button>
              <button
                type="button"
                className={`btn ${historialTab === "ajustes" ? "btn-primary" : ""}`}
                style={{ border: historialTab !== "ajustes" ? "1px solid var(--color-border)" : "none" }}
                onClick={() => setHistorialTab("ajustes")}
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
                          onClick={() => jumpToMonth(year, month)}
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
      )}

      {/* Aviso de error de digitación (saldo negativo) */}
      {errorToast && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: "1.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--color-accent-red)",
            color: "white",
            padding: "0.9rem 1.5rem",
            borderRadius: "10px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
            zIndex: 2000,
            maxWidth: "90vw",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {errorToast}
        </div>
      )}

    </div>
  );
}
