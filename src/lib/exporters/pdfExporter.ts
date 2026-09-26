import { INITIAL_PRODUCTS } from "@/data/products";

const DAYS = ["L", "M", "MC", "J", "V", "S", "D"];
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export async function exportKardexToPDF({
  community,
  selectedMonth,
  selectedYear,
  calendarWeeks,
  exits,
  entries,
  prevBalances,
}: {
  community: string;
  selectedMonth: number;
  selectedYear: number;
  calendarWeeks: (number | null)[][];
  exits: Record<string, number[]>;
  entries: Record<string, number[]>;
  prevBalances: Record<string, number[]>;
}) {
  const { default: JsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const monthName = MONTH_NAMES[selectedMonth];
  const allWeeks = calendarWeeks;

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
        ...DAYS.map((_, d) => pExits[startDay + d] || ""),
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
}
