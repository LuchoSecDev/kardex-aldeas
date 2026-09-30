// Calendario del kardex: semanas de lunes a domingo que cubren el mes. Los días
// fuera del mes son null. Lo usan la pantalla y los exportadores, así que vive
// aquí como función pura.
//
// Normalmente son 5 semanas. Un mes de 30/31 días que empieza en sábado o
// domingo (p. ej. marzo, agosto y noviembre de 2026) no cabe: sus últimos 1-2
// días van en una SEMANA 6 de cierre, que trae solo esos días (hallazgo H1,
// planes/004). Los demás huecos de esa semana siguen en null.

export const DAYS_PER_WEEK = 7;
// Semanas que caben en todos los meses, y máximo con la semana de cierre.
export const WEEKS_BASE = 5;
export const WEEKS_MAX = 6;
// Índice (0-based) de la semana de cierre.
export const EXTRA_WEEK_INDEX = WEEKS_BASE;

export function buildCalendarWeeks(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDayOfWeek = firstDay.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Lunes es 0

  const weeks: (number | null)[][] = [];
  let currentDay = 1;
  for (let w = 0; w < WEEKS_MAX; w++) {
    // La semana de cierre solo existe si todavía quedan días por ubicar.
    if (w === EXTRA_WEEK_INDEX && currentDay > lastDay.getDate()) break;

    const days: (number | null)[] = [];
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      if (w === 0 && d < startDayOfWeek) {
        days.push(null);
      } else if (currentDay > lastDay.getDate()) {
        days.push(null);
      } else {
        days.push(currentDay);
        currentDay++;
      }
    }
    weeks.push(days);
  }
  return weeks;
}

// Cuántas semanas tiene el mes en el kardex (5, o 6 si necesita la de cierre).
export const weekCountOf = (year: number, month: number) => buildCalendarWeeks(year, month).length;

// ¿Esta semana (0-based) es la de cierre del mes?
export const isExtraWeek = (weekIndex: number) => weekIndex === EXTRA_WEEK_INDEX;

// Cuántos días de la semana (0-based) pertenecen al mes (los demás quedan deshabilitados).
export const enabledDaysOf = (year: number, month: number, weekIndex: number): number =>
  (buildCalendarWeeks(year, month)[weekIndex] ?? []).filter((d) => d !== null).length;
