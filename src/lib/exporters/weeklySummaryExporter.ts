import { MONTH_NAMES } from "@/lib/weekStatus";
import type { ProductTotals } from "@/lib/weeklySummary";

// Excel del resumen semanal para el pedido a proveedores. Dos hojas:
//   1. "Resumen": una fila por producto con los totales entre comunidades.
//   2. "Detalle por comunidad": una fila por (producto, comunidad).
export type WeeklySummaryExportParams = {
  year: number;
  month: number;
  weekIndex: number;
  rangeLabel: string;
  totals: ProductTotals[];
  includedCommunities: string[];
  onlySent: boolean;
};

export const weeklySummaryFileName = (month: number, year: number, weekIndex: number) =>
  `Resumen_Semana${weekIndex + 1}_${MONTH_NAMES[month]}_${year}.xlsx`;

// Arma el libro de Excel (sin descargarlo): así su contenido se puede probar.
export async function buildWeeklySummaryWorkbook({
  year,
  month,
  weekIndex,
  rangeLabel,
  totals,
  includedCommunities,
  onlySent,
}: WeeklySummaryExportParams) {
  const { default: ExcelJS } = await import("exceljs");

  const monthName = MONTH_NAMES[month];
  const HEADER_FILL: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  const CATEGORY_FILL: import("exceljs").Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F0D9" } };
  const THIN_GRAY = { style: "thin" as const, color: { argb: "FF808080" } };
  const BORDERS: Partial<import("exceljs").Borders> = { top: THIN_GRAY, left: THIN_GRAY, bottom: THIN_GRAY, right: THIN_GRAY };

  const workbook = new ExcelJS.Workbook();

  const style = (
    cell: import("exceljs").Cell,
    opts: { bold?: boolean; fill?: import("exceljs").Fill; align?: "left" | "center"; border?: boolean } = {}
  ) => {
    cell.font = { bold: !!opts.bold, size: 11, name: "Calibri" };
    if (opts.fill) cell.fill = opts.fill;
    if (opts.border !== false) cell.border = BORDERS;
    cell.alignment = { horizontal: opts.align ?? "center", vertical: "middle", wrapText: true };
  };

  const title = (sheet: import("exceljs").Worksheet, lastCol: number) => {
    sheet.mergeCells(1, 1, 1, lastCol);
    const t = sheet.getCell(1, 1);
    t.value = "ALDEAS INFANTILES SOS — RESUMEN SEMANAL PARA PEDIDO A PROVEEDORES";
    t.font = { bold: true, size: 14, name: "Calibri" };
    t.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 28;

    sheet.mergeCells(2, 1, 2, lastCol);
    const s = sheet.getCell(2, 1);
    s.value = `Semana ${weekIndex + 1} (${rangeLabel}) de ${monthName} ${year}`;
    s.font = { bold: true, size: 12, name: "Calibri" };
    s.alignment = { horizontal: "left", vertical: "middle" };

    sheet.mergeCells(3, 1, 3, lastCol);
    const c = sheet.getCell(3, 1);
    c.value = `${onlySent ? "Comunidades que enviaron la semana" : "Comunidades con datos (hayan enviado o no)"}: ${
      includedCommunities.length > 0 ? includedCommunities.join(", ") : "ninguna"
    }`;
    c.font = { size: 11, name: "Calibri" };
    c.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    sheet.getRow(3).height = 32;
  };

  // --- Hoja 1: totales por producto ---
  const summary = workbook.addWorksheet("Resumen", {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 5 }],
  });
  const summaryHeaders = ["ALIMENTO", "UNIDAD", "SALDO ANTERIOR", "ENTRADAS", "SALIDAS (CONSUMO)", "SALDO FINAL"];
  [34, 14, 14, 14, 18, 14].forEach((w, i) => { summary.getColumn(i + 1).width = w; });
  title(summary, summaryHeaders.length);
  summaryHeaders.forEach((h, i) => {
    const cell = summary.getCell(5, i + 1);
    cell.value = h;
    style(cell, { bold: true, fill: HEADER_FILL });
  });
  summary.getRow(5).height = 30;

  let row = 6;
  let lastCategory = "";
  totals.forEach((t) => {
    if (t.product.category !== lastCategory) {
      summary.mergeCells(row, 1, row, summaryHeaders.length);
      const cat = summary.getCell(row, 1);
      cat.value = t.product.category;
      style(cat, { bold: true, fill: CATEGORY_FILL, align: "left" });
      lastCategory = t.product.category;
      row++;
    }
    const values: (string | number)[] = [t.product.name, t.product.unit, t.prev, t.entries, t.exits, t.final];
    values.forEach((v, i) => {
      const cell = summary.getCell(row, i + 1);
      cell.value = v;
      style(cell, { align: i === 0 ? "left" : "center", bold: i === 5 });
    });
    row++;
  });

  // --- Hoja 2: detalle por comunidad ---
  const detail = workbook.addWorksheet("Detalle por comunidad", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 5 }],
  });
  const detailHeaders = ["ALIMENTO", "UNIDAD", "COMUNIDAD", "SALDO ANTERIOR", "ENTRADAS", "SALIDAS (CONSUMO)", "SALDO FINAL"];
  [34, 14, 26, 14, 14, 18, 14].forEach((w, i) => { detail.getColumn(i + 1).width = w; });
  title(detail, detailHeaders.length);
  detailHeaders.forEach((h, i) => {
    const cell = detail.getCell(5, i + 1);
    cell.value = h;
    style(cell, { bold: true, fill: HEADER_FILL });
  });
  detail.getRow(5).height = 30;

  row = 6;
  totals.forEach((t) => {
    t.byCommunity.forEach((c) => {
      const values: (string | number)[] = [t.product.name, t.product.unit, c.community, c.prev, c.entries, c.exits, c.final];
      values.forEach((v, i) => {
        const cell = detail.getCell(row, i + 1);
        cell.value = v;
        style(cell, { align: i <= 2 ? "left" : "center" });
      });
      row++;
    });
  });

  return workbook;
}

export async function exportWeeklySummaryToExcel(params: WeeklySummaryExportParams) {
  const workbook = await buildWeeklySummaryWorkbook(params);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = weeklySummaryFileName(params.month, params.year, params.weekIndex);
  link.click();
  URL.revokeObjectURL(url);
}
