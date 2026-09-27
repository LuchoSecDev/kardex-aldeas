import { Product } from "@/types/kardex";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export async function exportKardexToExcel({
  community,
  selectedMonth,
  selectedYear,
  calendarWeeks,
  products,
  exits,
  entries,
  prevBalances,
}: {
  community: string;
  selectedMonth: number;
  selectedYear: number;
  calendarWeeks: (number | null)[][];
  products: Product[];
  exits: Record<string, number[]>;
  entries: Record<string, number[]>;
  prevBalances: Record<string, number[]>;
}) {
  const { default: ExcelJS } = await import("exceljs");

  const monthName = MONTH_NAMES[selectedMonth];
  const allWeeks = calendarWeeks;

  const FIXED_COLS = 3;
  const WEEK_BLOCK = 9;
  const TOTAL_COLS = FIXED_COLS + 5 * WEEK_BLOCK; // 48

  const HEADER_FILL: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  const CATEGORY_FILL: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F0D9" } };
  const THIN_GRAY = { style: "thin" as const, color: { argb: "FF808080" } };
  const ALL_BORDERS: Partial<import("exceljs").Borders> = { top: THIN_GRAY, left: THIN_GRAY, bottom: THIN_GRAY, right: THIN_GRAY };

  const workbook = new ExcelJS.Workbook();

  // Separar productos según la solicitud (5 hojas)
  const carnesLacteos = products.filter(p => p.category === "CARNES, PESCADOS Y HUEVOS" || p.category === "LACTEOS");
  
  const fruver = products.filter(p => p.category === "FRUTAS Y VERDURAS");
  const midFruver = Math.ceil(fruver.length / 2);
  const fruver1 = fruver.slice(0, midFruver);
  const fruver2 = fruver.slice(midFruver);

  const panaderia = products.filter(p => p.category === "PANADERIA");
  const abarrotes = products.filter(p => p.category === "ABARROTES");
  const midAbarrotes = Math.ceil(abarrotes.length / 2);
  const panaderiaAbarrotes1 = [...panaderia, ...abarrotes.slice(0, midAbarrotes)];
  const abarrotes2 = abarrotes.slice(midAbarrotes);

  // Si hay productos que no entran en ninguna de esas categorías, los agregamos a la hoja 5
  const knownCategories = ["CARNES, PESCADOS Y HUEVOS", "LACTEOS", "FRUTAS Y VERDURAS", "PANADERIA", "ABARROTES"];
  const otros = products.filter(p => !knownCategories.includes(p.category));
  const finalAbarrotes2 = [...abarrotes2, ...otros];

  const pages = [
    { name: "Hoja 1 (Carnes, Lácteos)", data: carnesLacteos },
    { name: "Hoja 2 (Fruver 1)", data: fruver1 },
    { name: "Hoja 3 (Fruver 2)", data: fruver2 },
    { name: "Hoja 4 (Panadería, Ab 1)", data: panaderiaAbarrotes1 },
    { name: "Hoja 5 (Abarrotes 2)", data: finalAbarrotes2 },
  ];

  type CellOpts = { bold?: boolean; fill?: import("exceljs").Fill; align?: "left" | "center"; border?: boolean };

  pages.forEach((page, pageIndex) => {
    // Si la hoja no tiene datos, igual la creamos pero vacía
    const sheet = workbook.addWorksheet(page.name, {
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.5, footer: 0.5 },
      },
      views: [{ state: "frozen", xSplit: FIXED_COLS, ySplit: 6 }],
    });

    const setCell = (row: number, col: number, value: unknown, opts: CellOpts = {}) => {
      const cell = sheet.getCell(row, col);
      cell.value = value as import("exceljs").CellValue;
      cell.font = { bold: !!opts.bold, size: 11, name: "Calibri" };
      if (opts.fill) cell.fill = opts.fill;
      if (opts.border !== false) cell.border = ALL_BORDERS;
      cell.alignment = { horizontal: opts.align ?? "center", vertical: "middle", wrapText: opts.align !== "left" };
      return cell;
    };

    // Anchos de columna
    const widths: number[] = [30, 14, 12];
    for (let w = 0; w < 5; w++) {
      widths.push(13.5); // ENTRADA
      for (let d = 0; d < 7; d++) widths.push(5.2); // L,M,MC,J,V,S,D
      widths.push(11.1); // SALDO
    }
    widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    // Fila 1: Encabezado institucional
    sheet.mergeCells(1, 1, 1, TOTAL_COLS);
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

    // Fila 3: títulos "SEMANA 1..5"
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

    // Filas de productos, agrupadas por categoría en esta hoja
    let currentRow = 6;
    let lastCategory = "";

    page.data.forEach((product) => {
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
      
      const pPrev = prevBalances[product.id] || [];
      const pEntries = entries[product.id] || [];
      const pExits = exits[product.id] || Array(35).fill(0);

      setCell(currentRow, 3, pPrev[0] ?? 0); // El saldo anterior del mes (solo se muestra en la primera columna)

      for (let w = 0; w < 5; w++) {
        const startCol = FIXED_COLS + 1 + w * WEEK_BLOCK;
        const startDay = w * 7;

        setCell(currentRow, startCol, pEntries[w] || "");
        
        let weekExitsSum = 0;
        for (let d = 0; d < 7; d++) {
          const val = pExits[startDay + d] || 0;
          setCell(currentRow, startCol + 1 + d, val > 0 ? val : "");
          weekExitsSum += val;
        }

        const bal = (pPrev[w] ?? 0) + (pEntries[w] || 0) - weekExitsSum;
        setCell(currentRow, startCol + 8, bal);
      }
      currentRow++;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Kardex_${community}_${monthName}_${selectedYear}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
