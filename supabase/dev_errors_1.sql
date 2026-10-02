-- Registro de errores del navegador (plan 007, Fase A) — archivo 1 de 1.
-- Es seguro repetirlo. Es aditivo: la app anterior sigue funcionando sin él, y la nueva falla en silencio si aún no existe.
--
-- Cuando algo falla en el navegador de una comunidad (un guardado que no se pudo, un error de la página), la app manda un
-- aviso corto a `dev_report_client_error`. Se ve en el Editor de tablas de Supabase (tabla `system_error_logs`); la pantalla
-- `/dev` y las alertas por correo llegan en las fases siguientes.
--
-- Qué se guarda y qué NO: la función, el código de error, un mensaje corto y la versión de la app. Nunca los argumentos de la
-- llamada (llevan el token de sesión ni cantidades del kardex). La comunidad sale del TOKEN, no de lo que mande el navegador,
-- así nadie puede falsificarla. Los reportes sobrantes se ignoran en silencio y los de más de 30 días se borran solos.

create table if not exists system_error_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  community   text not null,
  source      text not null check (source in ('rpc', 'window')),
  level       text not null check (level in ('warning', 'error')),
  fn          text not null check (char_length(fn) between 1 and 60),
  code        text check (code is null or char_length(code) <= 40),
  message     text not null check (char_length(message) between 1 and 300),
  app_version text not null check (char_length(app_version) between 1 and 40),
  resolved_at timestamptz
);

create index if not exists system_error_logs_created_idx   on system_error_logs (created_at desc);
create index if not exists system_error_logs_community_idx on system_error_logs (community, created_at desc);

alter table system_error_logs enable row level security;
revoke all on system_error_logs from anon, authenticated;

create or replace function dev_report_client_error(
  p_token text, p_source text, p_level text, p_fn text, p_code text, p_message text, p_version text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_message   text;
  v_code      text;
  v_version   text;
  v_id        bigint;
  v_minute    int;
  v_day       int;
begin
  -- Lo que el navegador manda como constantes se valida estricto; el texto libre se limpia (no se rechaza).
  if p_source is null or p_source not in ('rpc', 'window') or p_level is null or p_level not in ('warning', 'error')
     or p_fn is null or p_fn !~ '^[A-Za-z0-9_.]{1,60}$' then
    raise exception 'Reporte inválido';
  end if;

  v_message := left(btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')), 300);
  -- Una tira larga sin espacios con 4 o más dígitos parece un token (los de sesión son 64 hex): se tapa por si se coló en el
  -- texto de un error. Los nombres de funciones y rutas largos (sin dígitos, o con un «v1» suelto) se conservan: son justo
  -- lo que hay que ver para diagnosticar.
  v_message := regexp_replace(v_message, '(?=([A-Za-z_+/=-]*[0-9]){4})[A-Za-z0-9_+/=-]{24,}', '[oculto]', 'g');
  if v_message = '' then v_message := 'sin mensaje'; end if;
  v_code    := case when p_code ~ '^[A-Za-z0-9_.-]{1,40}$' then p_code else null end;
  v_version := case when p_version ~ '^[A-Za-z0-9_.-]{1,40}$' then p_version else 'desconocida' end;

  -- Tope por comunidad: 20 por minuto y 300 por día. Pasado el tope se ignora sin error (un reporte nunca debe romper nada).
  -- Es un tope blando: dos reportes simultáneos pueden pasar ambos con 19; para una alarma de inundación basta.
  select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
    into v_minute, v_day
    from system_error_logs
   where community = v_community and created_at > now() - interval '1 day';
  if v_minute >= 20 or v_day >= 300 then
    return;
  end if;

  insert into system_error_logs (community, source, level, fn, code, message, app_version)
  values (v_community, p_source, p_level, p_fn, v_code, v_message, v_version)
  returning id into v_id;

  -- Limpieza sin tareas programadas: cada 50 reportes se borran los de más de 30 días.
  if v_id % 50 = 0 then
    delete from system_error_logs where created_at < now() - interval '30 days';
  end if;
end;
$$;

grant execute on function dev_report_client_error(text, text, text, text, text, text, text) to anon;
