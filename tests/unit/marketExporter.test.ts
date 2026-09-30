import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCommunityWorkbook,
  buildConsolidatedWorkbook,
  communityFileName,
  consolidatedFileName,
} from "@/lib/exporters/marketExporter";
import { MARKET_KINDS, type MarketKind } from "@/lib/marketCalendar";
import { aggregateConsolidated } from "@/lib/marketConsolidated";
import type { AdminMarketConsolidatedRow, MarketItem } from "@/types/market";

// El catálogo real (285 ítems) para probar el Excel con el formato actual.
const catalogJson = JSON.parse(readFileSync("planes/anexos/lista-mercado-catalogo.json", "utf8")) as {
  kinds: Record<MarketKind, { items: { id: string; name: string; unit: string; isEvent: boolean }[] }>;
};
const CATALOG: MarketItem[] = MARKET_KINDS.flatMap((kind) =>
  catalogJson.kinds[kind].items.map((i, idx) => ({ id: i.id, kind, name: i.name, unit: i.unit, is_event: i.isEvent, sort_order: idx + 1 }))
);

const WEEK = "2026-09-28"; // Semana 1 de octubre

describe("nombres de archivo", () => {
  it("incluyen la semana, el mes y el año", () => {
    expect(consolidatedFileName(WEEK)).toBe("Lista_de_mercado_consolidado_Semana1_Octubre_2026.xlsx");
    expect(communityFileName("Maná", WEEK)).toBe("Lista_de_mercado_Maná_Semana1_Octubre_2026.xlsx");
  });

  it("limpian los caracteres que un archivo no acepta y los espacios", () => {
    expect(communityFileName('Casa / Blanca: "1"', WEEK)).toBe("Lista_de_mercado_Casa_Blanca_1_Semana1_Octubre_2026.xlsx");
  });
});

describe("Excel de UNA comunidad (formato actual)", () => {
  const params = {
    community: "Maná",
    weekStart: WEEK,
    participants: 11,
    catalog: CATALOG,
    quantities: {
      fruver: { mf1: 2.5, mf3: 4 },
      carnes: { mc1: 12 },
      abarrotes: {},
      aseo: {},
    },
  };

  it("trae las 4 hojas con los nombres del Excel de las colaboradoras", async () => {
    const wb = await buildCommunityWorkbook(params);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["CARNES", "FRUVER", "ABARROTES", "ASEO"]);
  });

  it("repite el encabezado: título, casa, semana, mes y participantes", async () => {
    const sheet = (await buildCommunityWorkbook(params)).getWorksheet("FRUVER")!;
    expect(sheet.getCell("A3").value).toBe("CONTROL DE PEDIDOS FRUVER");
    expect([sheet.getCell("A4").value, sheet.getCell("B4").value]).toEqual(["CASA", "Maná"]);
    expect([sheet.getCell("A5").value, sheet.getCell("B5").value]).toEqual(["SEMANA", 1]);
    expect([sheet.getCell("A6").value, sheet.getCell("B6").value]).toEqual(["MES", "Octubre"]);
    expect([sheet.getCell("A7").value, sheet.getCell("B7").value]).toEqual(["NUMERO DE PARTICIPANTES", 11]);
    expect(["A8", "B8", "C8"].map((c) => sheet.getCell(c).value)).toEqual(["DETALLE", "CANTIDAD", "UNIDAD DE MEDIDA"]);
  });

  it("lista TODOS los productos del catálogo desde la fila 9, con la cantidad pedida y 0 en los demás", async () => {
    const wb = await buildCommunityWorkbook(params);
    const carnes = wb.getWorksheet("CARNES")!;
    expect([carnes.getCell("A9").value, carnes.getCell("B9").value, carnes.getCell("C9").value]).toEqual(["CARNE ASAR PORCION", 12, "Porcion"]);
    expect(carnes.getCell("B10").value).toBe(0);

    const fruver = wb.getWorksheet("FRUVER")!;
    expect([fruver.getCell("A9").value, fruver.getCell("B9").value]).toEqual(["ACELGA", 2.5]);
    expect(fruver.getCell("B11").value).toBe(4); // PAPA... el tercer producto (mf3)

    const rows = wb.worksheets.map((s) => s.actualRowCount);
    expect(rows).toEqual([35 + 6, 117 + 6, 80 + 6, 53 + 6]); // productos + título, 4 datos de encabezado y fila de encabezado
  });

  it("no lleva columnas de precios ni valores (plan 003: sin precios)", async () => {
    const wb = await buildCommunityWorkbook(params);
    for (const sheet of wb.worksheets) {
      expect(sheet.getRow(8).cellCount).toBe(3);
      // Encabezado (filas 1 a 8): los nombres de productos no cuentan (OLIVA contiene "IVA").
      const header = [1, 2, 3, 4, 5, 6, 7, 8].map((r) => JSON.stringify(sheet.getRow(r).values)).join(" ");
      expect(header).not.toMatch(/VALOR|PRECIO|IVA|TOTAL/i);
    }
  });

  it("sin participantes deja la celda vacía y añade los productos que ya no están en el catálogo", async () => {
    const wb = await buildCommunityWorkbook({
      ...params,
      participants: null,
      extraItems: { fruver: [{ id: "viejo", kind: "fruver", name: "PRODUCTO RETIRADO", unit: "KG", is_event: false, sort_order: 999 }], carnes: [], abarrotes: [], aseo: [] },
      quantities: { ...params.quantities, fruver: { viejo: 3 } },
    });
    const fruver = wb.getWorksheet("FRUVER")!;
    expect(fruver.getCell("B7").value).toBe("");
    const last = fruver.getRow(fruver.rowCount);
    expect([last.getCell(1).value, last.getCell(2).value]).toEqual(["PRODUCTO RETIRADO", 3]);
  });

  it("se puede escribir como un .xlsx válido y volver a leer", async () => {
    const wb = await buildCommunityWorkbook(params);
    const buffer = await wb.xlsx.writeBuffer();
    const { default: ExcelJS } = await import("exceljs");
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buffer as ArrayBuffer);
    expect(back.worksheets.map((s) => s.name)).toEqual(["CARNES", "FRUVER", "ABARROTES", "ASEO"]);
    expect(back.getWorksheet("CARNES")!.getCell("B9").value).toBe(12);
  });
});

describe("Excel consolidado entre comunidades", () => {
  const row = (community: string, kind: MarketKind, item_id: string, name: string, quantity: number, sort_order: number, unit = "KG", is_event = false): AdminMarketConsolidatedRow => ({
    community, kind, item_id, name, unit, is_event, sort_order, quantity,
  });
  const byKind = aggregateConsolidated([
    row("Maná", "fruver", "mf1", "ACELGA", 2.5, 1),
    row("Fortaleza", "fruver", "mf1", "ACELGA", 1.5, 1),
    row("Maná", "fruver", "mf4", "ARANDANOS", 1, 4, "KG", true),
    row("Fortaleza", "carnes", "mc1", "CARNE ASAR PORCION", 12, 1, "Porcion"),
  ]);
  const params = { weekStart: WEEK, byKind, included: ["Fortaleza", "Maná"], missing: ["Shalom", "Renacer"] };

  it("trae una hoja de resumen y una por tipo", async () => {
    const wb = await buildConsolidatedWorkbook(params);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["Resumen", "Fruver y lácteos", "Carnes", "Abarrotes", "Aseo"]);
  });

  it("el resumen dice la semana, quién envió, quién falta y cuántos productos hay de cada tipo", async () => {
    const sheet = (await buildConsolidatedWorkbook(params)).getWorksheet("Resumen")!;
    const lines = new Map<string, string>();
    for (let r = 3; r <= 9; r++) lines.set(String(sheet.getCell(r, 1).value), String(sheet.getCell(r, 2).value));
    expect(lines.get("Semana")).toBe("Semana 1 de octubre · 28 sep – 4 oct");
    expect(lines.get("Comunidades que enviaron")).toBe("Fortaleza, Maná");
    expect(lines.get("Comunidades que faltan por enviar")).toBe("Shalom, Renacer");
    expect(lines.get("Productos pedidos · Fruver y lácteos")).toBe("2");
    expect(lines.get("Productos pedidos · Carnes")).toBe("1");
    expect(lines.get("Productos pedidos · Aseo")).toBe("0");
  });

  it("cada hoja trae producto, unidad, total y una columna por comunidad que pidió de ese tipo", async () => {
    const sheet = (await buildConsolidatedWorkbook(params)).getWorksheet("Fruver y lácteos")!;
    expect([1, 2, 3, 4, 5].map((c) => sheet.getCell(4, c).value)).toEqual(["PRODUCTO", "UNIDAD", "TOTAL", "Fortaleza", "Maná"]);
    expect([1, 2, 3, 4, 5].map((c) => sheet.getCell(5, c).value)).toEqual(["ACELGA", "KG", 4, 1.5, 2.5]);
    // ARANDANOS lo pidió solo Maná: Fortaleza queda vacío (no 0), y es de evento
    expect([1, 3, 4, 5].map((c) => sheet.getCell(6, c).value)).toEqual(["ARANDANOS (evento)", 1, null, 1]);
  });

  it("las columnas de comunidades son solo las de ese tipo (Carnes: solo Fortaleza)", async () => {
    const sheet = (await buildConsolidatedWorkbook(params)).getWorksheet("Carnes")!;
    expect([1, 2, 3, 4].map((c) => sheet.getCell(4, c).value)).toEqual(["PRODUCTO", "UNIDAD", "TOTAL", "Fortaleza"]);
    expect(sheet.getCell(4, 5).value).toBeNull();
  });

  it("un tipo que nadie pidió lo dice en vez de quedar en blanco", async () => {
    const sheet = (await buildConsolidatedWorkbook(params)).getWorksheet("Abarrotes")!;
    expect(String(sheet.getCell(2, 1).value)).toContain("Ninguna comunidad pidió");
  });

  it("no lleva precios ni totales en pesos", async () => {
    const wb = await buildConsolidatedWorkbook(params);
    for (const sheet of wb.worksheets) expect(JSON.stringify(sheet.getSheetValues())).not.toMatch(/VALOR|PRECIO|IVA|\$/i);
  });

  it("se puede escribir como un .xlsx válido", async () => {
    const buffer = await (await buildConsolidatedWorkbook(params)).xlsx.writeBuffer();
    expect((buffer as ArrayBuffer).byteLength).toBeGreaterThan(1000);
  });
});
