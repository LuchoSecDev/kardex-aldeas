import { addDays, deadlineInstant, upcomingOrderFriday, weekStartOfFriday } from "@/lib/marketCalendar";
import type { MarketKind } from "@/lib/marketCalendar";
import type { AdminListState, AdminMarketNotification, AdminMarketRow } from "@/types/market";

// Lógica pura del panel de la nutricionista para las listas de mercado (plan 003, Fase C).

// Identifica una lista de mercado en las acciones de la campanita.
export const marketKey = (n: Pick<AdminMarketNotification, "community" | "week_start">) => `m:${n.community}|${n.week_start}`;

export const ADMIN_STATE_LABEL: Record<AdminListState, string> = {
  falta: "Falta por enviar",
  pendiente: "Aún sin enviar",
  enviada: "Por revisar",
  revisada: "Revisada",
};

// Estado de una comunidad en la semana. "Falta" solo existe pasado el plazo: antes es
// simplemente "aún sin enviar" (todavía está a tiempo).
export function adminListState(row: Pick<AdminMarketRow, "sent" | "reviewed">, deadlineAt: string, now: number): AdminListState {
  if (!row.sent) return now > new Date(deadlineAt).getTime() ? "falta" : "pendiente";
  return row.reviewed ? "revisada" : "enviada";
}

// Cuántas comunidades hay en cada estado (para la línea de resumen de arriba).
export function summarizeOverview(rows: Pick<AdminMarketRow, "sent" | "reviewed" | "late">[], deadlineAt: string, now: number) {
  const summary = { total: rows.length, sent: 0, toReview: 0, reviewed: 0, missing: 0, pending: 0, late: 0 };
  for (const row of rows) {
    const state = adminListState(row, deadlineAt, now);
    if (row.sent) summary.sent++;
    if (state === "enviada") summary.toReview++;
    if (state === "revisada") summary.reviewed++;
    if (state === "falta") summary.missing++;
    if (state === "pendiente") summary.pending++;
    if (row.sent && row.late) summary.late++;
  }
  return summary;
}

// Qué mostrar en la celda de un tipo: el número de productos pedidos; "—" si ese viernes no
// tocaba ese tipo y no pidieron nada; nada si la comunidad todavía no ha enviado.
export function kindCell(row: Pick<AdminMarketRow, "sent" | "counts">, kind: MarketKind, due: boolean): string {
  if (!row.sent) return "—";
  const count = row.counts[kind];
  if (count === 0 && !due) return "—";
  return String(count);
}

// Semana que se abre por defecto: la del viernes de pedido más reciente mientras las listas
// siguen "calientes" (hasta 4 días después de su plazo: la nutricionista hace el pedido el
// viernes en la noche o el lunes), y si no, la del próximo pedido.
export const FRESH_WINDOW_MS = 4 * 86_400_000;

export function adminDefaultWeekStart(now: Date, holidays?: ReadonlySet<string>): string {
  const upcoming = upcomingOrderFriday(now, holidays);
  const previous = addDays(upcoming, -7);
  const sinceDeadline = now.getTime() - deadlineInstant(previous, holidays).getTime();
  return weekStartOfFriday(sinceDeadline >= 0 && sinceDeadline < FRESH_WINDOW_MS ? previous : upcoming);
}

// Puntualidad de un envío, para mostrar junto a la fecha.
export function punctualityLabel(row: Pick<AdminMarketRow, "late" | "changed_after_deadline">): string {
  if (row.late) return "Tarde";
  if (row.changed_after_deadline) return "A tiempo, pero cambió después del plazo";
  return "A tiempo";
}
