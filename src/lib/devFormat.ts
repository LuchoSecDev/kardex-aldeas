// Formato de fechas de la pantalla /dev: siempre hora de Colombia (UTC-5, sin horario de verano), igual que los avisos por correo y
// Telegram, y armada a mano para que no dependa de la región ni de la zona horaria del equipo.

const pad = (n: number) => String(n).padStart(2, "0");

// «2026-10-02 11:59» (hora de Colombia). Una fecha ausente o inválida da «—».
export function colombiaTime(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms - 5 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// «hace 5 min», «hace 3 h», «hace 2 días»; para fechas futuras o sin fecha, «ahora».
export function ago(iso: string | null | undefined, nowMs: number): string {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(ms)) return "—";
  const minutes = Math.floor((nowMs - ms) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
