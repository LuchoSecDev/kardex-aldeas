import type { WeekState } from "@/types/submissions";

// Estado de una semana a partir de su envío (undefined = nunca se envió).
// "modificada" manda sobre "revisada": si los datos cambiaron, lo revisado ya
// no es lo que hay ahora.
export function getWeekState(submission: { modified: boolean; reviewed: boolean } | undefined): WeekState {
  if (!submission) return "pendiente";
  if (submission.modified) return "modificada";
  if (submission.reviewed) return "revisada";
  return "enviada";
}

export const WEEK_STATE_LABEL: Record<WeekState, string> = {
  pendiente: "Pendiente",
  enviada: "Enviada",
  revisada: "Revisada",
  modificada: "Modificada tras el envío",
};

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });

// "hace 5 min", "hace 3 h", "hace 2 días" — para la campanita.
export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}
