-- Rendimiento (1 de 2): evita recalcular la "foto" de la semana cuando no hubo cambios.
-- Correr en el SQL Editor; es seguro repetirlo y no cambia lo que devuelven las funciones.
-- Comparar la foto cuesta ~9 ms por semana enviada; si ningun producto del mes se guardo
-- despues del envio/revision (con 5 s de margen por guardados en curso), no puede haber cambiado.
create or replace function _week_modified(
  p_community text, p_year int, p_month int, p_week int, p_snapshot jsonb, p_since timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
           when exists (
             select 1 from kardex_records r
              where r.community = p_community and r.year = p_year and r.month = p_month
                and r.updated_at > p_since - interval '5 seconds'
           )
           then p_snapshot is distinct from _week_snapshot(p_community, p_year, p_month, p_week)
           else false
         end;
$$;

revoke execute on function _week_modified(text, int, int, int, jsonb, timestamptz) from public, anon, authenticated;

create or replace function kardex_week_submissions(p_token text, p_year int, p_month int)
returns table (
  week_index   int,
  submitted_at timestamptz,
  submit_count int,
  reviewed     boolean,
  modified     boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_community text := _session_community(p_token);
begin
  return query
    select s.week_index,
           s.submitted_at,
           s.submit_count,
           (s.reviewed_at is not null),
           _week_modified(s.community, s.year, s.month, s.week_index, s.snapshot,
                          greatest(s.submitted_at, s.reviewed_at))
      from week_submissions s
     where s.community = v_community and s.year = p_year and s.month = p_month
     order by s.week_index;
end;
$$;

create or replace function admin_week_statuses(p_token text, p_year int, p_month int)
returns table (
  community    text,
  week_index   int,
  submitted_at timestamptz,
  submit_count int,
  reviewed_at  timestamptz,
  modified     boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _admin_session(p_token);
  return query
    select s.community,
           s.week_index,
           s.submitted_at,
           s.submit_count,
           s.reviewed_at,
           _week_modified(s.community, s.year, s.month, s.week_index, s.snapshot,
                          greatest(s.submitted_at, s.reviewed_at))
      from week_submissions s
     where s.year = p_year and s.month = p_month
     order by s.community, s.week_index;
end;
$$;

grant execute on function kardex_week_submissions(text, int, int) to anon;
grant execute on function admin_week_statuses(text, int, int)     to anon;
