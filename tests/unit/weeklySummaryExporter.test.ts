import { describe, expect, it } from "vitest";
import { buildWeeklySummaryWorkbook, weeklySummaryFileName } from "@/lib/exporters/weeklySummaryExporter";
import { aggregateWeekly, type WeeklyRow } from "@/lib/weeklySummary";
import type { Product } from "@/types/kardex";

const products: Product[] = [
  { id: "p1", category: "ABARROTES", name: "Arroz", unit: "KG", minStock: 5 },
  { id: "p2", category: "ABARROTES", name: "Aceite", unit: "LITRO", minStock: 5 },
  { id: "p3", category: "LACTEOS", name: "Leche", unit: "BOLSA", minStock: 5 },
];

const rows: WeeklyRow[] = [
  { community: "Maná", product_id: "p1", prev_balance: 2, entries: 5, exits: 3.5 },
  { community: "Fortaleza", product_id: "p1", prev_balance: 0.5, entries: 0, exits: 1 },
  { community: "Maná", product_id: "p3", prev_balance: 0, entries: 4, exits: 6 },
];

const params = {
  year: 2026,
  month: 8,
  weekIndex: 1,
  rangeLabel: "7 al 13 de septiembre",
  totals: aggregateWeekly(rows, products),
  includedCommunities: ["Fortaleza", "Maná"],
  onlySent: true,
};

describe("weeklySummaryFileName", () => {
  it("incluye la semana, el mes y el año", () => {
    expect(weeklySummaryFileName(8, 2026, 1)).toBe("Resumen_Semana2_Septiembre_2026.xlsx");
  });
});

describe("buildWeeklySummaryWorkbook", () => {
  it("crea las hojas Resumen y Detalle por comunidad", async () => {
    const wb = await buildWeeklySummaryWorkbook(params);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["Resumen", "Detalle por comunidad"]);
  });

  it("el encabezado indica la semana, su rango y las comunidades incluidas", async () => {
    const sheet = (await buildWeeklySummaryWorkbook(params)).getWorksheet("Resumen")!;
    expect(sheet.getCell(2, 1).value).toBe("Semana 2 (7 al 13 de septiembre) de Septiembre 2026");
    expect(String(sheet.getCell(3, 1).value)).toContain("Comunidades que enviaron la semana: Fortaleza, Maná");
  });

  it("indica cuando el resumen incluye comunidades que no enviaron", async () => {
    const sheet = (await buildWeeklySummaryWorkbook({ ...params, onlySent: false })).getWorksheet("Resumen")!;
    expect(String(sheet.getCell(3, 1).value)).toContain("hayan enviado o no");
  });

  it("la hoja Resumen trae una fila por producto, agrupada por categoría, con los totales", async () => {
    const sheet = (await buildWeeklySummaryWorkbook(params)).getWorksheet("Resumen")!;
    const headers = [1, 2, 3, 4, 5, 6].map((c) => sheet.getCell(5, c).value);
    expect(headers).toEqual(["ALIMENTO", "UNIDAD", "SALDO ANTERIOR", "ENTRADAS", "SALIDAS (CONSUMO)", "SALDO FINAL"]);

    expect(sheet.getCell(6, 1).value).toBe("ABARROTES"); // categoría
    const arroz = [1, 2, 3, 4, 5, 6].map((c) => sheet.getCell(7, c).value);
    expect(arroz).toEqual(["Arroz", "KG", 2.5, 5, 4.5, 3]); // 2,5 + 5 - 4,5
    expect(sheet.getCell(8, 1).value).toBe("LACTEOS");
    const leche = [1, 2, 3, 4, 5, 6].map((c) => sheet.getCell(9, c).value);
    expect(leche).toEqual(["Leche", "BOLSA", 0, 4, 6, -2]); // saldo negativo se conserva
  });

  it("no incluye productos sin movimiento (Aceite)", async () => {
    const sheet = (await buildWeeklySummaryWorkbook(params)).getWorksheet("Resumen")!;
    const names = sheet.getColumn(1).values as unknown[];
    expect(names).not.toContain("Aceite");
  });

  it("la hoja de detalle trae una fila por producto y comunidad", async () => {
    const sheet = (await buildWeeklySummaryWorkbook(params)).getWorksheet("Detalle por comunidad")!;
    const first = [1, 2, 3, 4, 5, 6, 7].map((c) => sheet.getCell(6, c).value);
    expect(first).toEqual(["Arroz", "KG", "Fortaleza", 0.5, 0, 1, -0.5]);
    const second = [1, 2, 3, 4, 5, 6, 7].map((c) => sheet.getCell(7, c).value);
    expect(second).toEqual(["Arroz", "KG", "Maná", 2, 5, 3.5, 3.5]);
    expect(sheet.getCell(8, 3).value).toBe("Maná"); // la leche de Maná
  });

  it("sin filas genera las hojas solo con encabezado", async () => {
    const wb = await buildWeeklySummaryWorkbook({ ...params, totals: [], includedCommunities: [] });
    expect(String(wb.getWorksheet("Resumen")!.getCell(3, 1).value)).toContain("ninguna");
    expect(wb.getWorksheet("Resumen")!.getCell(6, 1).value).toBeNull();
  });
});
