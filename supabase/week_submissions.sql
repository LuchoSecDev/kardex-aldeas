-- Envío de semana + campanita de la nutricionista: Fase C del plan 001.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de admin_read.sql.
-- Es aditivo: no toca nada existente.
--
-- Una comunidad "envía" una semana cuando termina de llenarla: es el
-- equivalente a entregar el papel. Al enviar se guarda una FOTO (snapshot) de
-- los números de esa semana; el estado "modificada tras el envío" sale de
-- comparar la foto con los datos actuales. (No se compara updated_at porque
-- es por producto y mes, no por semana: editar la semana 3 marcaría como
-- modificada a la semana 1 ya enviada.)
--
-- Estados por comunidad y semana:
--   pendiente   → no hay envío
--   enviada     → enviada, sin revisar
--   revisada    → la nutricionista la marcó como revisada
--   modificada  → sus datos cambiaron después del envío (o de la revisión)

create table if not exists week_submissions (
  id           uuid primary key default gen_random_uuid(),
  community    text not null references communities(name) on delete cascade,
  year         int  not null,
  month        int  not null check (month between 0 and 11),
  week_index   int  not null check (week_index between 0 and 4),
  submitted_at timestamptz not null default now(),
  submit_count int  not null default 1,
  snapshot     jsonb not null,
  reviewed_at  timestamptz,
  unique (community, year, month, week_index)
);

alter table week_submissions enable row level security;
revoke all on week_submissions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Piezas internas (no se exponen por la API)
-- ---------------------------------------------------------------------------

-- Foto de una semana: por producto, [saldo anterior, entrada, salida día 1..7].
-- Solo se incluyen los productos con algún valor distinto de cero. jsonb
-- compara los números por valor (1 = 1.0), así que la comparación es estable.
create or replace function _week_snapshot(p_community text, p_year int, p_month int, p_week int)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_object_agg(t.product_id, t.arr), '{}'::jsonb)
    from (
      select r.product_id,
             jsonb_build_array(
               coalesce(r.prev_balances -> p_week, '0'::jsonb),
               coalesce(r.entries -> p_week, '0'::jsonb)
             ) || coalesce((
               select jsonb_agg(e.val order by e.idx)
                 from jsonb_array_elements(r.exits) with ordinality as e(val, idx)
                where e.idx between p_week * 7 + 1 and p_week * 7 + 7
             ), '[]'::jsonb) as arr
        from kardex_records r
       where r.community = p_community and r.year = p_year and r.month = p_month
    ) t
   where exists (
     select 1 from jsonb_array_elements(t.arr) x where (x #>> '{}')::numeric <> 0
   );
$$;

-- ¿La semana tiene algún movimiento (entrada o salida)? Una semana con solo
-- saldos heredados no se puede enviar.
create or replace function _week_has_activity(p_community text, p_year int, p_month int, p_week int)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from kardex_records r
     where r.community = p_community and r.year = p_year and r.month = p_month
       and (
         coalesce((r.entries ->> p_week)::numeric, 0) <> 0
         or exists (
           select 1
             from jsonb_array_elements(r.exits) with ordinality as e(val, idx)
            where e.idx between p_week * 7 + 1 and p_week * 7 + 7
              and (e.val #>> '{}')::numeric <> 0
         )
       )
  );
$$;

revoke execute on function _week_snapshot(text, int, int, int)     from public, anon, authenticated;
revoke execute on function _week_has_activity(text, int, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Comunidad
-- ---------------------------------------------------------------------------

-- Enviar (o reenviar) una semana. Reenviar refresca la foto, sube el contador
-- y quita la marca de revisada.
create or replace function kardex_submit_week(p_token text, p_year int, p_month int, p_week_index int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_row       week_submissions%rowtype;
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11
     or p_week_index not between 0 and 4 then
    raise exception 'Fecha inválida';
  end if;

  if not _week_has_activity(v_community, p_year, p_month, p_week_index) then
    raise exception 'SEMANA_VACIA';
  end if;

  insert into week_submissions (community, year, month, week_index, snapshot)
  values (v_community, p_year, p_month, p_week_index,
          _week_snapshot(v_community, p_year, p_month, p_week_index))
  on conflict (community, year, month, week_index) do update
    set snapshot     = excluded.snapshot,
        submitted_at = now(),
        submit_count = week_submissions.submit_count + 1,
        reviewed_at  = null
  returning * into v_row;

  return jsonb_build_object('submitted_at', v_row.submitted_at, 'submit_count', v_row.submit_count);
end;
$$;

-- Qué semanas de un mes ya envió la comunidad, y si cambiaron después.
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
           (s.snapshot is distinct from _week_snapshot(s.community, s.year, s.month, s.week_index))
      from week_submissions s
     where s.community = v_community and s.year = p_year and s.month = p_month
     order by s.week_index;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administradora (nutricionista)
-- ---------------------------------------------------------------------------

-- Estado de cada semana enviada de cada comunidad en un mes.
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
           (s.snapshot is distinct from _week_snapshot(s.community, s.year, s.month, s.week_index))
      from week_submissions s
     where s.year = p_year and s.month = p_month
     order by s.community, s.week_index;
end;
$$;

-- Lo que la campanita muestra: envíos sin revisar y envíos (aun revisados)
-- cuyos datos cambiaron después. Solo mira los últimos 90 días de envíos ya
-- revisados, para que la consulta no crezca con el tiempo.
create or replace function admin_notifications(p_token text)
returns table (
  id           uuid,
  community    text,
  year         int,
  month        int,
  week_index   int,
  submitted_at timestamptz,
  submit_count int,
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
    select t.id, t.community, t.year, t.month, t.week_index, t.submitted_at, t.submit_count, t.modified
      from (
        select s.id, s.community, s.year, s.month, s.week_index, s.submitted_at, s.submit_count, s.reviewed_at,
               (s.snapshot is distinct from _week_snapshot(s.community, s.year, s.month, s.week_index)) as modified
          from week_submissions s
         where s.reviewed_at is null
            or s.submitted_at > now() - interval '90 days'
      ) t
     where t.reviewed_at is null or t.modified
     order by t.submitted_at desc
     limit 100;
end;
$$;

-- Marcar un envío como revisado. Revisar significa "vi los datos tal como
-- están ahora", así que también actualiza la foto: si estaba marcado como
-- modificado, deja de estarlo.
create or replace function admin_mark_reviewed(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _admin_session(p_token);

  update week_submissions s
     set reviewed_at = now(),
         snapshot    = _week_snapshot(s.community, s.year, s.month, s.week_index)
   where s.id = p_id;

  if not found then
    raise exception 'Envío no encontrado';
  end if;
end;
$$;

grant execute on function kardex_submit_week(text, int, int, int)      to anon;
grant execute on function kardex_week_submissions(text, int, int)      to anon;
grant execute on function admin_week_statuses(text, int, int)          to anon;
grant execute on function admin_notifications(text)                    to anon;
grant execute on function admin_mark_reviewed(text, uuid)              to anon;
