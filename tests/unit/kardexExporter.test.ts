import { describe, expect, it } from "vitest";
import { buildKardexWorkbook, kardexExcelFileName } from "@/lib/exporters/excelExporter";
import { buildKardexPdf, kardexPdfFileName } from "@/lib/exporters/pdfExporter";
import { buildCalendarWeeks } from "@/lib/calendar";
import type { Product } from "@/types/kardex";

const products: Product[] = [
  { id: "p1", category: "ABARROTES", name: "Arroz", unit: "KG", minStock: 5 },
  { id: "p2", category: "LACTEOS", name: "Leche", unit: "BOLSA", minStock: 5 },
];

const zeros = (n: number) => Array(n).fill(0);

const paramsFor = (year: number, month: number, over: { exits?: number[]; entries?: number[]; prev?: number[] } = {}) => ({
  community: "Maná",
  selectedMonth: month,
  selectedYear: year,
  calendarWeeks: buildCalendarWeeks(year, month),
  products,
  exits: { p1: over.exits ?? zeros(42), p2: zeros(42) },
  entries: { p1: over.entries ?? zeros(6), p2: zeros(6) },
  prevBalances: { p1: over.prev ?? zeros(6), p2: zeros(6) },
});

// Columnas del Excel: 3 fijas + 9 por semana (ENTRADA, L..D, SALDO).
const weekStartCol = (w: number) => 3 + 1 + w * 9;

describe("Excel del kardex con semana 6 de cierre (planes/004)", () => {
  it("un mes que cabe (septiembre 2026) trae 5 semanas: sin 'SEMANA 6'", async () => {
    const wb = await buildKardexWorkbook(paramsFor(2026, 8));
    const sheet = wb.worksheets[0];
    expect(sheet.columnCount).toBe(3 + 5 * 9); // antes de mirar celdas (mirar una vacía la crearía)
    const titles = Array.from({ length: 5 }, (_, w) => sheet.getCell(3, weekStartCol(w)).value);
    expect(titles).toEqual(["SEMANA 1", "SEMANA 2", "SEMANA 3", "SEMANA 4", "SEMANA 5"]);
  });

  it("marzo 2026 trae una semana más (SEMANA 6 (CIERRE)) con solo el 30 y 31 en las fechas", async () => {
    const wb = await buildKardexWorkbook(paramsFor(2026, 2));
    const sheet = wb.worksheets[0];
    expect(sheet.getCell(3, weekStartCol(5)).value).toBe("SEMANA 6 (CIERRE)");
    expect(sheet.columnCount).toBe(3 + 6 * 9);

    const c = weekStartCol(5);
    const dates = [1, 2, 3, 4, 5, 6, 7].map((d) => sheet.getCell(5, c + d).value);
    expect(dates).toEqual([30, 31, "", "", "", "", ""]);
  });

  it("los movimientos de la semana 6 salen en su bloque y el saldo encadena desde la semana 5", async () => {
    const exits = zeros(42);
    exits[35] = 1; // lunes 30
    exits[36] = 0.5; // martes 31
    const wb = await buildKardexWorkbook(paramsFor(2026, 2, { exits, entries: [10, 0, 0, 0, 0, 3], prev: [0, 10, 10, 10, 10, 10] }));
    // Arroz (ABARROTES) cae en una de las hojas de productos: se busca en todas.
    let arroz = 0;
    const sheet = wb.worksheets.find((ws) => {
      ws.eachRow((row, n) => { if (row.getCell(1).value === "Arroz") arroz = n; });
      return arroz > 0;
    })!;
    expect(arroz).toBeGreaterThan(0);
    const c = weekStartCol(5);
    expect(sheet.getCell(arroz, c).value).toBe(3); // entrada de la semana 6
    expect(sheet.getCell(arroz, c + 1).value).toBe(1); // L 30
    expect(sheet.getCell(arroz, c + 2).value).toBe(0.5); // M 31
    expect(sheet.getCell(arroz, c + 8).value).toBe(11.5); // saldo final: 10 + 3 - 1.5
  });

  it("se puede escribir como un .xlsx válido y volver a leer", async () => {
    const wb = await buildKardexWorkbook(paramsFor(2026, 2));
    const buffer = await wb.xlsx.writeBuffer();
    const { default: ExcelJS } = await import("exceljs");
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buffer as ArrayBuffer);
    expect(back.worksheets).toHaveLength(5);
    expect(back.worksheets[0].getCell(3, weekStartCol(5)).value).toBe("SEMANA 6 (CIERRE)");
  });

  it("el nombre del archivo incluye comunidad, mes y año", () => {
    expect(kardexExcelFileName("Maná", 2, 2026)).toBe("Kardex_Maná_Marzo_2026.xlsx");
    expect(kardexPdfFileName("Maná", 2, 2026)).toBe("Kardex_Maná_Marzo_2026.pdf");
  });
});

describe("PDF del kardex con semana 6 de cierre", () => {
  it("un mes que cabe tiene una página por semana (5)", async () => {
    const doc = await buildKardexPdf(paramsFor(2026, 8));
    expect(doc.getNumberOfPages()).toBe(5);
  });

  it("marzo 2026 tiene una página más: la semana 6 de cierre", async () => {
    const doc = await buildKardexPdf(paramsFor(2026, 2));
    expect(doc.getNumberOfPages()).toBe(6);
  });
});
