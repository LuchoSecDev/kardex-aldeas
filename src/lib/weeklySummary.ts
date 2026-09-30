import { buildCalendarWeeks } from "@/lib/calendar";
import { MONTH_NAMES } from "@/lib/weekStatus";
import type { Product } from "@/types/kardex";

// Una fila del servidor: lo que UNA comunidad tuvo de UN producto en la semana
// (ver supabase/admin_weekly_summary.sql).
export type WeeklyRow = {
  community: string;
  product_id: string;
  prev_balance: number;
  entries: number;
  exits: number;
};

export type CommunityLine = {
  community: string;
  prev: number;
  entries: number;
  exits: number;
  final: number;
};

// Un producto con sus totales entre comunidades.
export type ProductTotals = {
  product: Product;
  prev: number;
  entries: number;
  exits: number;
  final: number; // saldo anterior + entradas - salidas
  byCommunity: CommunityLine[];
};

// Los kardex guardan medias unidades (0.5), pero sumar decimales en coma
// flotante da restos como 0.30000000000000004: se redondea a 2 decimales.
export const round2 = (n: number) => Math.round(n * 100) / 100;

// Suma por producto entre comunidades. Sigue el ORDEN DEL CATÁLOGO (el mismo del
// kardex) y omite los productos sin movimiento en la semana. Un producto que no
// esté en el catálogo se ignora (el servidor solo guarda productos existentes).
export function aggregateWeekly(rows: WeeklyRow[], products: Product[]): ProductTotals[] {
  const byProduct = new Map<string, WeeklyRow[]>();
  rows.forEach((row) => {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row);
    else byProduct.set(row.product_id, [row]);
  });

  const result: ProductTotals[] = [];
  products.forEach((product) => {
    const productRows = byProduct.get(product.id);
    if (!productRows) return;

    const byCommunity: CommunityLine[] = productRows
      .map((r) => ({
        community: r.community,
        prev: round2(r.prev_balance),
        entries: round2(r.entries),
        exits: round2(r.exits),
        final: round2(r.prev_balance + r.entries - r.exits),
      }))
      .sort((a, b) => a.community.localeCompare(b.community, "es"));

    const prev = round2(byCommunity.reduce((sum, c) => sum + c.prev, 0));
    const entries = round2(byCommunity.reduce((sum, c) => sum + c.entries, 0));
    const exits = round2(byCommunity.reduce((sum, c) => sum + c.exits, 0));

    result.push({ product, prev, entries, exits, final: round2(prev + entries - exits), byCommunity });
  });

  return result;
}

// "7 al 13 de septiembre": el rango de fechas de una semana del kardex. Las
// semanas de los extremos del mes pueden ser parciales ("1 al 6", "28 al 30").
export function weekRangeLabel(year: number, month: number, weekIndex: number): string {
  const days = (buildCalendarWeeks(year, month)[weekIndex] ?? []).filter((d): d is number => d !== null);
  if (days.length === 0) return "sin días en este mes";
  const monthName = MONTH_NAMES[month].toLowerCase();
  return days.length === 1 ? `${days[0]} de ${monthName}` : `${days[0]} al ${days[days.length - 1]} de ${monthName}`;
}

// La semana (0..4) en la que cae hoy, si el mes visible es el actual; si no, la
// primera. Es solo el valor inicial del selector.
export function defaultWeekIndex(year: number, month: number, today: Date = new Date()): number {
  if (today.getFullYear() !== year || today.getMonth() !== month) return 0;
  const weeks = buildCalendarWeeks(year, month);
  const index = weeks.findIndex((w) => w.includes(today.getDate()));
  return index === -1 ? 0 : index;
}
