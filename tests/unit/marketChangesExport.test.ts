import { describe, expect, it } from "vitest";
import { buildCommunityWorkbook, buildConsolidatedWorkbook } from "@/lib/exporters/marketExporter";
import { collectChanges, groupChangesByCommunity, type ConsolidatedChange } from "@/lib/marketConsolidated";
import type { AdminMarketChange, AdminMarketList, MarketItem } from "@/types/market";

// Zona de cambios (plan 008, Fase C): las notas llegan a la nutricionista en el Excel como nota de celda y como hoja.
const WEEK = "2026-09-28"; // Semana 1 de octubre

const CATALOG: MarketItem[] = [
  { id: "mc1", kind: "carnes", name: "CARNE ASAR PORCION", unit: "Porcion", is_event: false, sort_order: 1 },
  { id: "mc2", kind: "carnes", name: "PESCADO FILETE", unit: "KG", is_event: false, sort_order: 2 },
  { id: "mf1", kind: "fruver", name: "ACELGA", unit: "KG", is_event: false, sort_order: 1 },
];

const change = (id: string, text: string, item_id: string | null = null, item_name: string | null = null, unit: string | null = null): AdminMarketChange => ({
  id, item_id, item_name, unit, text, at: "2026-09-25T20:00:00Z",
});

const base = {
  community: "Maná", weekStart: WEEK, participants: 11, catalog: CATALOG,
  quantities: { fruver: {}, carnes: { mc1: 2 }, abarrotes: {}, aseo: {} },
};

describe("Excel de UNA comunidad: cambios solicitados", () => {
  const changes = {
    carnes: [
      change("a", "Cambiar pescado por pechuga", "mc2", "PESCADO FILETE", "KG"),
      change("b", "Que llegue temprano"),
      change("c", "Solo filete grueso", "mc2", "PESCADO FILETE", "KG"),
    ],
    fruver: [change("d", "Acelga sin hojas dañadas", "mf1", "ACELGA", "KG")],
  };

  it("sin cambios el libro queda igual que antes: 4 hojas, sin hoja de cambios ni notas", async () => {
    const wb = await buildCommunityWorkbook(base);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["CARNES", "FRUVER", "ABARROTES", "ASEO"]);
    const sheet = wb.getWorksheet("CARNES")!;
    expect(sheet.getCell("A9").note).toBeUndefined();
    const withEmpty = await buildCommunityWorkbook({ ...base, changes: { carnes: [], fruver: [] } });
    expect(withEmpty.worksheets).toHaveLength(4);
  });

  it("deja una nota de celda en el nombre del producto con TODAS sus notas, y ninguna en los demás", async () => {
    const sheet = (await buildCommunityWorkbook({ ...base, changes })).getWorksheet("CARNES")!;
    // Fila 9 = CARNE ASAR PORCION (sin notas), fila 10 = PESCADO FILETE.
    expect(sheet.getCell("A9").value).toBe("CARNE ASAR PORCION");
    expect(sheet.getCell("A9").note).toBeUndefined();
    expect(sheet.getCell("A10").value).toBe("PESCADO FILETE");
    expect(sheet.getCell("A10").note).toBe("• Cambiar pescado por pechuga\n• Solo filete grueso");
    const fruver = (await buildCommunityWorkbook({ ...base, changes })).getWorksheet("FRUVER")!;
    expect(fruver.getCell("A9").note).toBe("• Acelga sin hojas dañadas");
  });

  it("agrega la hoja «CAMBIOS» al final con casa, semana, mes y una fila por nota (las generales también)", async () => {
    const wb = await buildCommunityWorkbook({ ...base, changes });
    expect(wb.worksheets.map((s) => s.name)).toEqual(["CARNES", "FRUVER", "ABARROTES", "ASEO", "CAMBIOS"]);
    const sheet = wb.getWorksheet("CAMBIOS")!;
    expect(sheet.getCell("A3").value).toBe("CAMBIOS SOLICITADOS");
    expect([sheet.getCell("A4").value, sheet.getCell("B4").value]).toEqual(["CASA", "Maná"]);
    expect([sheet.getCell("A5").value, sheet.getCell("B5").value]).toEqual(["SEMANA", 1]);
    expect(["A8", "B8", "C8"].map((c) => sheet.getCell(c).value)).toEqual(["TIPO", "PRODUCTO", "CAMBIO"]);

    const rows = [9, 10, 11, 12].map((r) => [1, 2, 3].map((c) => sheet.getCell(r, c).value));
    expect(rows).toEqual([
      ["Carnes", "PESCADO FILETE", "Cambiar pescado por pechuga"],
      ["Carnes", "(nota general)", "Que llegue temprano"],
      ["Carnes", "PESCADO FILETE", "Solo filete grueso"],
      ["Fruver y lácteos", "ACELGA", "Acelga sin hojas dañadas"],
    ]);
  });

  it("una nota de un producto que ya no está en el catálogo no se pierde: sigue en la hoja «CAMBIOS»", async () => {
    const wb = await buildCommunityWorkbook({ ...base, changes: { carnes: [change("x", "Producto retirado", "viejo", "PRODUCTO RETIRADO", "KG")] } });
    expect(wb.getWorksheet("CAMBIOS")!.getCell("B9").value).toBe("PRODUCTO RETIRADO");
  });

  it("las notas de celda SOBREVIVEN al guardar y volver a abrir el archivo .xlsx real", async () => {
    const wb = await buildCommunityWorkbook({ ...base, changes });
    const buffer = await wb.xlsx.writeBuffer();
    const ExcelJS = (await import("exceljs")).default;
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer as ArrayBuffer);

    const note = reopened.getWorksheet("CARNES")!.getCell("A10").note as { texts?: { text: string }[] } | string;
    const text = typeof note === "string" ? note : (note.texts ?? []).map((t) => t.text).join("");
    expect(text).toContain("Cambiar pescado por pechuga");
    expect(text).toContain("Solo filete grueso");
    expect(reopened.getWorksheet("CAMBIOS")!.getCell("C9").value).toBe("Cambiar pescado por pechuga");
  });
});

describe("Excel consolidado: cambios solicitados", () => {
  const emptyByKind = { fruver: [], carnes: [], abarrotes: [], aseo: [] };
  const changes: ConsolidatedChange[] = [
    { community: "Fortaleza", kind: "carnes", itemName: "PESCADO FILETE", unit: "KG", text: "Cambiar por pechuga", at: "2026-09-25T20:00:00Z" },
    { community: "Maná", kind: "fruver", itemName: null, unit: null, text: "Entregar antes de las 8", at: "2026-09-25T21:00:00Z" },
  ];

  it("sin cambios no agrega la hoja ni la línea del resumen", async () => {
    const wb = await buildConsolidatedWorkbook({ weekStart: WEEK, byKind: emptyByKind, included: ["Maná"], missing: [] });
    expect(wb.worksheets.map((s) => s.name)).not.toContain("Cambios");
    const labels = wb.getWorksheet("Resumen")!.getColumn(1).values as unknown[];
    expect(labels).not.toContain("Cambios solicitados");
  });

  it("con cambios agrega la hoja «Cambios» (comunidad, tipo, producto, cambio) y la cuenta en el resumen", async () => {
    const wb = await buildConsolidatedWorkbook({ weekStart: WEEK, byKind: emptyByKind, included: ["Fortaleza", "Maná"], missing: [], changes });
    const sheet = wb.getWorksheet("Cambios")!;
    expect(sheet.getCell("A1").value).toContain("CAMBIOS SOLICITADOS");
    expect(["A4", "B4", "C4", "D4"].map((c) => sheet.getCell(c).value)).toEqual(["COMUNIDAD", "TIPO", "PRODUCTO", "CAMBIO"]);
    expect([5, 6].map((r) => [1, 2, 3, 4].map((c) => sheet.getCell(r, c).value))).toEqual([
      ["Fortaleza", "Carnes", "PESCADO FILETE", "Cambiar por pechuga"],
      ["Maná", "Fruver y lácteos", "(nota general)", "Entregar antes de las 8"],
    ]);
    const summary = wb.getWorksheet("Resumen")!;
    const labels = summary.getColumn(1).values as unknown[];
    const row = labels.indexOf("Cambios solicitados");
    expect(row).toBeGreaterThan(0);
    expect(summary.getCell(row, 2).value).toContain("2");
  });
});

describe("collectChanges y groupChangesByCommunity", () => {
  const list = (community: string, lists: AdminMarketList["lists"]) => ({ community, lists });

  it("ordena por comunidad (A-Z), luego por tipo y respeta el orden en que se escribieron", () => {
    const result = collectChanges([
      list("Shalom", [{ kind: "aseo", items: [], changes: [change("1", "jabón líquido", "ms1", "JABON", "UND")] }]),
      list("Fortaleza", [
        { kind: "carnes", items: [], changes: [change("2", "primero"), change("3", "segundo")] },
        { kind: "fruver", items: [], changes: [change("4", "frutas")] },
      ]),
      list("Maná", [{ kind: "carnes", items: [] }]), // sin `changes`: un servidor anterior
    ]);
    expect(result.map((c) => `${c.community}|${c.kind}|${c.text}`)).toEqual([
      "Fortaleza|fruver|frutas",
      "Fortaleza|carnes|primero",
      "Fortaleza|carnes|segundo",
      "Shalom|aseo|jabón líquido",
    ]);
    expect(result[3].itemName).toBe("JABON");
    expect(result[0].itemName).toBeNull();
  });

  it("agrupa por comunidad", () => {
    const groups = groupChangesByCommunity(collectChanges([
      list("Fortaleza", [{ kind: "carnes", items: [], changes: [change("2", "a"), change("3", "b")] }]),
      list("Shalom", [{ kind: "aseo", items: [], changes: [change("1", "c")] }]),
    ]));
    expect(groups.map((g) => [g.community, g.changes.length])).toEqual([["Fortaleza", 2], ["Shalom", 1]]);
    expect(groupChangesByCommunity([])).toEqual([]);
  });
});
