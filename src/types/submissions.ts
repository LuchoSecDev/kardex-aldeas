// Envío de semana (ver supabase/week_submissions.sql y planes/001).

// Lo que la comunidad ve de una semana que ya envió.
export type WeekSubmission = {
  week_index: number; // 0..4
  submitted_at: string;
  submit_count: number;
  reviewed: boolean;
  // Los datos de esa semana cambiaron después de enviarla.
  modified: boolean;
};

// Lo que la administradora ve de cada semana enviada de cada comunidad.
export type AdminWeekStatus = {
  community: string;
  week_index: number;
  submitted_at: string;
  submit_count: number;
  reviewed_at: string | null;
  modified: boolean;
};

// Una entrada de la campanita: envío sin revisar, o cuyos datos cambiaron.
export type AdminNotification = {
  id: string;
  community: string;
  year: number;
  month: number;
  week_index: number;
  submitted_at: string;
  submit_count: number;
  modified: boolean;
};

// pendiente: no hay envío · enviada: esperando revisión · revisada · modificada: cambió tras el envío
export type WeekState = "pendiente" | "enviada" | "revisada" | "modificada";
