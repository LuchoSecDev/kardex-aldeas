-- Lectura de los problemas para la pantalla /dev (plan 007, Fase B1) — archivo 1 de 2: resumen y lista de grupos. Es seguro repetirlo.
-- Requiere dev_errors_1.sql, dev_auth_1.sql y dev_auth_2.sql. TODAS las funciones exigen el token del desarrollador.
--
-- Un «problema» es un GRUPO de reportes iguales: misma comunidad, función, origen, nivel y código. La misma falla repetida 12 veces
-- en Maná es una línea con su contador; la misma falla en Fortaleza es otra línea. Marcar un grupo como resuelto cierra sus
-- reportes abiertos de ese momento: si vuelve a fallar, llega un reporte nuevo y el grupo reaparece solo.

-- Números de las tarjetas de arriba: lo que sigue sin resolver.
create or replace function dev_error_summary(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _dev_session(p_token);
  return (select jsonb_build_object(
            'open_errors',    count(*) filter (where level = 'error'   and resolved_at is null),
            'open_warnings',  count(*) filter (where level = 'warning' and resolved_at is null),
            'communities',    count(distinct community) filter (where resolved_at is null),
            'last_report_at', max(created_at))
            from system_error_logs);
end;
$$;

-- Los grupos de los últimos p_days días (1 a 90), los más recientes primero, con tope de 200. p_only_open = solo los que aún
-- tienen reportes sin resolver. `total` cuenta todo el periodo; `open_count`, lo que sigue abierto.
create or replace function dev_error_groups(p_token text, p_days int default 7, p_only_open boolean default true)
returns table (
  community text, fn text, source text, level text, code text, total int, open_count int,
  first_seen timestamptz, last_seen timestamptz, last_message text, last_version text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _dev_session(p_token);
  if p_days is null or p_days not between 1 and 90 then raise exception 'Rango inválido'; end if;
  return query
    select l.community, l.fn, l.source, l.level, l.code,
           count(*)::int, (count(*) filter (where l.resolved_at is null))::int,
           min(l.created_at), max(l.created_at),
           (array_agg(l.message     order by l.created_at desc, l.id desc))[1],
           (array_agg(l.app_version order by l.created_at desc, l.id desc))[1]
      from system_error_logs l
     where l.created_at >= now() - make_interval(days => p_days)
     group by l.community, l.fn, l.source, l.level, l.code
    having not coalesce(p_only_open, true) or count(*) filter (where l.resolved_at is null) > 0
     order by max(l.created_at) desc
     limit 200;
end;
$$;

grant execute on function dev_error_summary(text)               to anon;
grant execute on function dev_error_groups(text, int, boolean)  to anon;
