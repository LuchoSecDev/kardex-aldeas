import { MARKET_KINDS, MARKET_KIND_LABEL, weekLabel, weekParts, type MarketKind } from "@/lib/marketCalendar";
import { communitiesOfKind, countsByKind, type ConsolidatedByKind, type ConsolidatedChange } from "@/lib/marketConsolidated";
import { MONTH_NAMES } from "@/lib/weekStatus";
import type { AdminMarketChange, MarketItem, MarketQuantities } from "@/types/market";

// Excel de la lista de mercado (plan 003, Fase D). Sin precios ni totales en pesos.
//   1. Consolidado: por tipo, una hoja con el total por producto y una columna por comunidad.
//   2. Por comunidad: el libro con el formato que se usaba (CARNES, FRUVER, ABARROTES, ASEO),
//      con todos los productos y las cantidades pedidas (0 en los que no).

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// "Semana1_Octubre_2026"
const weekSlug = (weekStart: string) => {
  const { n, monthIndex, year } = weekParts(weekStart);
  return `Semana${n}_${MONTH_NAMES[monthIndex]}_${year}`;
};

// Quita lo que los sistemas de archivos no aceptan y cambia los espacios por guiones bajos.
const fileSafe = (text: string) => text.replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "_");

export const consolidatedFileName = (weekStart: string) => `Lista_de_mercado_consolidado_${weekSlug(weekStart)}.xlsx`;
export const communityFileName = (community: string, weekStart: string) =>
  `Lista_de_mercado_${fileSafe(community)}_${weekSlug(weekStart)}.xlsx`;

type Excel = typeof import("exceljs");

const loadExcel = async (): Promise<Excel> => (await import("exceljs")).default as unknown as Excel;

const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD9E1F2" } };
const THIN_GRAY = { style: "thin" as const, color: { argb: "FF808080" } };
const BORDERS = { top: THIN_GRAY, left: THIN_GRAY, bottom: THIN_GRAY, right: THIN_GRAY };

function styleCell(cell: import("exceljs").Cell, opts: { bold?: boolean; fill?: typeof HEADER_FILL; align?: "left" | "center" } = {}) {
  cell.font = { bold: !!opts.bold, size: 11, name: "Calibri" };
  if (opts.fill) cell.fill = opts.fill;
  cell.border = BORDERS;
  cell.alignment = { horizontal: opts.align ?? "center", vertical: "middle", wrapText: true };
}

// ---------------------------------------------------------------------------
// 1. Consolidado entre comunidades
// ---------------------------------------------------------------------------

export type ConsolidatedExportParams = {
  weekStart: string;
  byKind: ConsolidatedByKind;
  // Comunidades que enviaron la lista esa semana, y las que no.
  included: string[];
  missing: string[];
  // Notas de cambio enviadas por las comunidades (plan 008): salen en la hoja «Cambios».
  changes?: ConsolidatedChange[];
};

export async function buildConsolidatedWorkbook({ weekStart, byKind, included, missing, changes = [] }: ConsolidatedExportParams) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const counts = countsByKind(byKind);

  // --- Hoja "Resumen": qué semana es, quién envió y cuántos productos de cada tipo ---
  const summary = workbook.addWorksheet("Resumen");
  summary.getColumn(1).width = 30;
  summary.getColumn(2).width = 60;
  const lines: [string, string][] = [
    ["Semana", weekLabel(weekStart)],
    ["Comunidades que enviaron", included.length > 0 ? included.join(", ") : "ninguna"],
    ["Comunidades que faltan por enviar", missing.length > 0 ? missing.join(", ") : "ninguna"],
    ...MARKET_KINDS.map((k): [string, string] => [`Productos pedidos · ${MARKET_KIND_LABEL[k]}`, String(counts[k])]),
    ...(changes.length > 0 ? [["Cambios solicitados", `${changes.length} (ver la hoja «Cambios»)`] as [string, string]] : []),
  ];
  summary.mergeCells(1, 1, 1, 2);
  const title = summary.getCell(1, 1);
  title.value = "ALDEAS INFANTILES SOS — LISTA DE MERCADO CONSOLIDADA";
  title.font = { bold: true, size: 14, name: "Calibri" };
  title.alignment = { horizontal: "center", vertical: "middle" };
  summary.getRow(1).height = 28;
  lines.forEach(([label, value], i) => {
    const r = i + 3;
    summary.getCell(r, 1).value = label;
    styleCell(summary.getCell(r, 1), { bold: true, fill: HEADER_FILL, align: "left" });
    summary.getCell(r, 2).value = value;
    styleCell(summary.getCell(r, 2), { align: "left" });
  });

  // --- Una hoja por tipo: producto, unidad, total y una columna por comunidad ---
  for (const kind of MARKET_KINDS) {
    const items = byKind[kind];
    const communities = communitiesOfKind(items);
    const sheet = workbook.addWorksheet(MARKET_KIND_LABEL[kind], {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ state: "frozen", ySplit: 4, xSplit: 3 }],
    });
    const headers = ["PRODUCTO", "UNIDAD", "TOTAL", ...communities];
    sheet.getColumn(1).width = 38;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 12;
    communities.forEach((_, i) => { sheet.getColumn(4 + i).width = 16; });

    sheet.mergeCells(1, 1, 1, headers.length);
    const t = sheet.getCell(1, 1);
    t.value = `${MARKET_KIND_LABEL[kind].toUpperCase()} — ${weekLabel(weekStart)}`;
    t.font = { bold: true, size: 13, name: "Calibri" };
    t.alignment = { horizontal: "left", vertical: "middle" };
    sheet.getRow(1).height = 26;

    headers.forEach((h, i) => {
      const cell = sheet.getCell(4, i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: HEADER_FILL });
    });
    sheet.getRow(4).height = 30;

    if (items.length === 0) {
      sheet.mergeCells(2, 1, 2, headers.length);
      sheet.getCell(2, 1).value = "Ninguna comunidad pidió este tipo esa semana.";
      continue;
    }

    items.forEach((item, idx) => {
      const r = 5 + idx;
      const byCommunity = new Map(item.byCommunity.map((c) => [c.community, c.quantity]));
      const values: (string | number | null)[] = [
        item.isEvent ? `${item.name} (evento)` : item.name, item.unit, item.total,
        ...communities.map((c) => byCommunity.get(c) ?? null),
      ];
      values.forEach((v, i) => {
        const cell = sheet.getCell(r, i + 1);
        cell.value = v;
        styleCell(cell, { align: i === 0 ? "left" : "center", bold: i === 2 });
      });
    });
  }

  // --- Hoja «Cambios»: lo que las comunidades pidieron cambiar (solo si hay notas) ---
  if (changes.length > 0) {
    const sheet = workbook.addWorksheet("Cambios", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ state: "frozen", ySplit: 4 }],
    });
    [18, 20, 36, 70].forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
    sheet.mergeCells(1, 1, 1, 4);
    const t = sheet.getCell(1, 1);
    t.value = `CAMBIOS SOLICITADOS — ${weekLabel(weekStart)}`;
    t.font = { bold: true, size: 13, name: "Calibri" };
    t.alignment = { horizontal: "left", vertical: "middle" };
    sheet.getRow(1).height = 26;
    ["COMUNIDAD", "TIPO", "PRODUCTO", "CAMBIO"].forEach((h, i) => {
      const cell = sheet.getCell(4, i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: HEADER_FILL });
    });
    changes.forEach((c, idx) => {
      const values = [c.community, MARKET_KIND_LABEL[c.kind], c.itemName ?? "(nota general)", c.text];
      values.forEach((v, i) => {
        const cell = sheet.getCell(5 + idx, i + 1);
        cell.value = v;
        styleCell(cell, { align: "left" });
      });
    });
  }

  return workbook;
}

// ---------------------------------------------------------------------------
// 2. Lista de UNA comunidad, con el formato que se usaba
// ---------------------------------------------------------------------------

export type CommunityExportParams = {
  community: string;
  weekStart: string;
  participants: number | null;
  // Catálogo completo: así salen también los productos que no se pidieron (en 0).
  catalog: MarketItem[];
  // Lo enviado: {tipo: {id del producto: cantidad}}.
  quantities: Record<MarketKind, MarketQuantities>;
  // Nombres de los productos pedidos que ya no están en el catálogo activo.
  extraItems?: Record<MarketKind, MarketItem[]>;
  // Notas de cambio ENVIADAS de cada tipo (plan 008): nota de celda en el producto y hoja «CAMBIOS».
  changes?: Partial<Record<MarketKind, AdminMarketChange[]>>;
};

// Los nombres de hoja y títulos que usaba el Excel de las colaboradoras.
const SHEETS: { kind: MarketKind; sheet: string; title: string }[] = [
  { kind: "carnes", sheet: "CARNES", title: "CONTROL DE PEDIDOS CARNES" },
  { kind: "fruver", sheet: "FRUVER", title: "CONTROL DE PEDIDOS FRUVER" },
  { kind: "abarrotes", sheet: "ABARROTES", title: "CONTROL DE PEDIDOS ABARROTES" },
  { kind: "aseo", sheet: "ASEO", title: "CONTROL DE PEDIDOS ASEO" },
];

export async function buildCommunityWorkbook({ community, weekStart, participants, catalog, quantities, extraItems, changes }: CommunityExportParams) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const { n, monthIndex } = weekParts(weekStart);

  for (const { kind, sheet: name, title } of SHEETS) {
    const sheet = workbook.addWorksheet(name, {
      pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ state: "frozen", ySplit: 8 }],
    });
    sheet.getColumn(1).width = 52;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 22;

    // Mismo orden de filas que el Excel original: título, casa, semana, mes, participantes, encabezado.
    sheet.getCell(3, 1).value = title;
    sheet.getCell(3, 1).font = { bold: true, size: 13, name: "Calibri" };
    const header: [string, string | number][] = [
      ["CASA", community],
      ["SEMANA", n],
      ["MES", MONTH_NAMES[monthIndex]],
      ["NUMERO DE PARTICIPANTES", participants ?? ""],
    ];
    header.forEach(([label, value], i) => {
      const r = 4 + i;
      sheet.getCell(r, 1).value = label;
      styleCell(sheet.getCell(r, 1), { bold: true, align: "left" });
      sheet.getCell(r, 2).value = value;
      styleCell(sheet.getCell(r, 2), { align: "left" });
    });
    ["DETALLE", "CANTIDAD", "UNIDAD DE MEDIDA"].forEach((h, i) => {
      const cell = sheet.getCell(8, i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: HEADER_FILL });
    });

    const items = [
      ...catalog.filter((i) => i.kind === kind).sort((a, b) => a.sort_order - b.sort_order),
      ...(extraItems?.[kind] ?? []),
    ];
    items.forEach((item, idx) => {
      const r = 9 + idx;
      const values: (string | number)[] = [item.name, quantities[kind]?.[item.id] ?? 0, item.unit];
      values.forEach((v, i) => {
        const cell = sheet.getCell(r, i + 1);
        cell.value = v;
        styleCell(cell, { align: i === 1 ? "center" : "left", bold: i === 1 && Number(v) > 0 });
      });
      // Como la nota de celda del Excel de antes: las notas de cambio de este producto, en su celda del nombre.
      const notes = (changes?.[kind] ?? []).filter((c) => c.item_id === item.id);
      if (notes.length > 0) sheet.getCell(r, 1).note = notes.map((c) => `• ${c.text}`).join("\n");
    });
  }

  // --- Hoja «CAMBIOS»: todas las notas de la comunidad (las de producto y las generales), solo si hay ---
  const allChanges = SHEETS.flatMap(({ kind }) => (changes?.[kind] ?? []).map((c) => ({ kind, ...c })));
  if (allChanges.length > 0) {
    const sheet = workbook.addWorksheet("CAMBIOS", {
      pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ state: "frozen", ySplit: 8 }],
    });
    [14, 40, 70].forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
    sheet.getCell(3, 1).value = "CAMBIOS SOLICITADOS";
    sheet.getCell(3, 1).font = { bold: true, size: 13, name: "Calibri" };
    const header: [string, string | number][] = [
      ["CASA", community],
      ["SEMANA", n],
      ["MES", MONTH_NAMES[monthIndex]],
    ];
    header.forEach(([label, value], i) => {
      sheet.getCell(4 + i, 1).value = label;
      styleCell(sheet.getCell(4 + i, 1), { bold: true, align: "left" });
      sheet.getCell(4 + i, 2).value = value;
      styleCell(sheet.getCell(4 + i, 2), { align: "left" });
    });
    ["TIPO", "PRODUCTO", "CAMBIO"].forEach((h, i) => {
      const cell = sheet.getCell(8, i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: HEADER_FILL });
    });
    allChanges.forEach((c, idx) => {
      const values = [MARKET_KIND_LABEL[c.kind], c.item_name ?? "(nota general)", c.text];
      values.forEach((v, i) => {
        const cell = sheet.getCell(9 + idx, i + 1);
        cell.value = v;
        styleCell(cell, { align: "left" });
      });
    });
  }

  return workbook;
}

// ---------------------------------------------------------------------------
// Descarga
// ---------------------------------------------------------------------------

async function download(workbook: import("exceljs").Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportConsolidatedToExcel(params: ConsolidatedExportParams) {
  await download(await buildConsolidatedWorkbook(params), consolidatedFileName(params.weekStart));
}

export async function exportCommunityListToExcel(params: CommunityExportParams) {
  await download(await buildCommunityWorkbook(params), communityFileName(params.community, params.weekStart));
}
