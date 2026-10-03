-- Estado de las alertas al desarrollador (plan 007, Fase A2) — archivo 1 de 2 (el 2 es el trigger: dev_alerts_2.sql). Es seguro repetirlo y no toca datos existentes.
--
-- La Edge Function `dev-alert` (supabase/functions/dev-alert/index.ts) avisa por correo y Telegram cuando hay una racha de
-- errores, y como máximo UNA vez cada 30 minutos. Para no avisar dos veces cuando llegan reportes casi al mismo tiempo, guarda
-- aquí cuándo fue el último aviso y "toma el turno" con una actualización condicional (solo gana quien encuentra el último
-- aviso más viejo que el enfriamiento).
--
-- Una sola fila (id = 1). Tabla CERRADA: la app (anon) no la ve ni la toca; solo la usa la función con la clave de servicio.

create table if not exists dev_alert_state (
  id            smallint primary key default 1 check (id = 1),
  last_alert_at timestamptz not null default 'epoch'
);

insert into dev_alert_state (id) values (1) on conflict (id) do nothing;

alter table dev_alert_state enable row level security;
revoke all on dev_alert_state from anon, authenticated;
