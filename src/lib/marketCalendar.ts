// Calendario de la lista de mercado (plan 003): qué se pide cada viernes, hasta
// qué hora se puede enviar, y cómo se nombra cada semana. Todo es lógica pura
// sobre fechas "AAAA-MM-DD" (sin zona horaria) para que se pueda probar sin red.
//
// El calendario oficial de 2026 está en planes/anexos/cronograma-pedidos-2026.md
// y se siembra en Supabase (supabase/market_seed.sql). Las reglas de aquí
// reproducen ese cronograma y sirven de respaldo para años que aún no se siembran.

export const MARKET_KINDS = ["fruver", "carnes", "abarrotes", "aseo"] as const;
export type MarketKind = (typeof MARKET_KINDS)[number];

export const MARKET_KIND_LABEL: Record<MarketKind, string> = {
  fruver: "Fruver y lácteos",
  carnes: "Carnes",
  abarrotes: "Abarrotes",
  aseo: "Aseo",
};

// Abarrotes se pide cada 14 días a partir de este viernes (cronograma 2026).
export const ABARROTES_ANCHOR_FRIDAY = "2026-01-09";

// Hora límite de envío (hora de Bogotá, UTC-5 todo el año) y su desfase.
export const DEADLINE_HOUR = 17;
const BOGOTA_OFFSET = "-05:00";

// Festivos de Colombia 2026. Si el viernes de pedido es festivo, el plazo se
// adelanta al día hábil anterior. Agregar cada año nuevo.
export const COLOMBIA_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01",
  "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07",
  "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
]);

const DAY_MS = 86_400_000;
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTH_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// ---------------------------------------------------------------------------
// Fechas "AAAA-MM-DD"
// ---------------------------------------------------------------------------

const parseDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const formatDate = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (iso: string, days: number) => formatDate(new Date(parseDate(iso).getTime() + days * DAY_MS));

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / DAY_MS);

// 1 = lunes … 7 = domingo
export const isoWeekday = (iso: string) => {
  const day = parseDate(iso).getUTCDay();
  return day === 0 ? 7 : day;
};

export const isFriday = (iso: string) => isoWeekday(iso) === 5;
export const isMonday = (iso: string) => isoWeekday(iso) === 1;

// La lista de una semana se identifica por el LUNES de la semana de entrega:
// el viernes de pedido + 3 días.
export const weekStartOfFriday = (friday: string) => addDays(friday, 3);
export const fridayOfWeekStart = (weekStart: string) => addDays(weekStart, -3);

// Fecha de hoy en Bogotá (AAAA-MM-DD), sin importar la zona del navegador.
export function bogotaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
}

// ---------------------------------------------------------------------------
// Qué se pide cada viernes
// ---------------------------------------------------------------------------

// Regla del cronograma: fruver (con lácteos) y carnes todos los viernes;
// abarrotes cada 14 días desde el 9 ene 2026; aseo el viernes que cae entre el 13 y el 19.
export function kindsDueOnFriday(friday: string): MarketKind[] {
  const kinds: MarketKind[] = ["fruver", "carnes"];
  const sinceAnchor = daysBetween(ABARROTES_ANCHOR_FRIDAY, friday);
  if (((sinceAnchor % 14) + 14) % 14 === 0) kinds.push("abarrotes");
  const dayOfMonth = Number(friday.slice(8, 10));
  if (dayOfMonth >= 13 && dayOfMonth <= 19) kinds.push("aseo");
  return kinds;
}

// Todos los viernes de un año.
export function fridaysOfYear(year: number): string[] {
  let day = `${year}-01-01`;
  while (!isFriday(day)) day = addDays(day, 1);
  const fridays: string[] = [];
  while (day.startsWith(String(year))) {
    fridays.push(day);
    day = addDays(day, 7);
  }
  return fridays;
}

// ---------------------------------------------------------------------------
// Plazo de envío
// ---------------------------------------------------------------------------

// Día del plazo: el viernes de pedido; si es festivo, el día hábil anterior.
export function deadlineDate(friday: string, holidays: ReadonlySet<string> = COLOMBIA_HOLIDAYS_2026): string {
  let day = friday;
  while (holidays.has(day) || isoWeekday(day) >= 6) day = addDays(day, -1);
  return day;
}

// Instante exacto del plazo: 5:00 pm de Bogotá del día del plazo.
export function deadlineInstant(friday: string, holidays: ReadonlySet<string> = COLOMBIA_HOLIDAYS_2026): Date {
  return new Date(`${deadlineDate(friday, holidays)}T${String(DEADLINE_HOUR).padStart(2, "0")}:00:00${BOGOTA_OFFSET}`);
}

export const isLate = (submittedAt: Date, friday: string, holidays?: ReadonlySet<string>) =>
  submittedAt.getTime() > deadlineInstant(friday, holidays).getTime();

// El viernes de pedido que toca "ahora": el primero cuyo plazo aún no ha pasado.
export function upcomingOrderFriday(now: Date, holidays?: ReadonlySet<string>): string {
  let friday = bogotaDate(now);
  while (!isFriday(friday)) friday = addDays(friday, 1);
  while (deadlineInstant(friday, holidays).getTime() <= now.getTime()) friday = addDays(friday, 7);
  return friday;
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

// "Semana 1 de octubre": la semana se numera por el jueves (día de entrega de
// fruver), así que la del lunes 28 sep al domingo 4 oct es la semana 1 de octubre.
export function weekName(weekStart: string): string {
  const thursday = addDays(weekStart, 3);
  const month = Number(thursday.slice(5, 7)) - 1;
  const n = Math.ceil(Number(thursday.slice(8, 10)) / 7);
  return `Semana ${n} de ${MONTH_LONG[month]}`;
}

const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`;

// "28 sep – 4 oct"
export const weekRange = (weekStart: string) => `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;

// "Semana 1 de octubre · 28 sep – 4 oct"
export const weekLabel = (weekStart: string) => `${weekName(weekStart)} · ${weekRange(weekStart)}`;

// ---------------------------------------------------------------------------
// Siembra del calendario (supabase/market_seed.sql)
// ---------------------------------------------------------------------------

export interface CalendarSeedRow {
  friday: string;
  kinds: MarketKind[];
  deadlineAt: string; // ISO con -05:00
}

export function buildCalendarSeed(year: number, holidays?: ReadonlySet<string>): CalendarSeedRow[] {
  return fridaysOfYear(year).map((friday) => ({
    friday,
    kinds: kindsDueOnFriday(friday),
    deadlineAt: `${deadlineDate(friday, holidays)} ${String(DEADLINE_HOUR).padStart(2, "0")}:00:00${BOGOTA_OFFSET}`,
  }));
}

export function renderCalendarSeedSql(rows: CalendarSeedRow[]): string {
  const values = rows
    .map((r) => `  ('${r.friday}', array[${r.kinds.map((k) => `'${k}'`).join(", ")}], '${r.deadlineAt}')`)
    .join(",\n");
  return (
    `insert into market_calendar (friday, kinds, deadline_at) values\n${values}\n` +
    `on conflict (friday) do update\n  set kinds = excluded.kinds, deadline_at = excluded.deadline_at;`
  );
}
