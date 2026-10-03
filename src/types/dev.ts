// Tipos de la pantalla /dev (plan 007, Fase B1). Las filas vienen de supabase/dev_errors_2.sql y dev_errors_3.sql.

// Un «problema»: reportes iguales (misma comunidad, función, origen, nivel y código) agrupados.
export type DevErrorGroup = {
  community: string;
  fn: string;
  source: "rpc" | "window";
  level: "warning" | "error";
  code: string | null;
  total: number;
  open_count: number;
  first_seen: string;
  last_seen: string;
  last_message: string;
  last_version: string;
};

export type DevErrorSummary = {
  open_errors: number;
  open_warnings: number;
  communities: number;
  last_report_at: string | null;
};

// Un reporte del detalle técnico de un grupo.
export type DevErrorReport = {
  id: number;
  created_at: string;
  message: string;
  app_version: string;
  resolved: boolean;
};

export type DevLoginResult = { token: string; must_change: boolean };
export type DevPasswordResult = { ok: boolean };

// Lo que identifica a un grupo (se manda tal cual a dev_error_group_detail y dev_resolve_group).
export type DevGroupKey = Pick<DevErrorGroup, "community" | "fn" | "source" | "level" | "code">;
