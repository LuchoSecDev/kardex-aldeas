-- Lista de mercado (plan 003, Fase A) — archivo 3 de 5: catálogo y carga de la semana.
-- Correr los 5 EN ORDEN (1 a 5) en el SQL Editor, después de week_submissions.sql, y luego
-- los market_seed_N.sql. Va en archivos chicos: el editor no deja pegar más de ~100 líneas.
-- Es seguro repetirlos. No hay precios (plan 003).

-- Comunidad: lecturas (siempre con token de sesión).

-- Catálogo de ítems activos (sin precios), en el orden de la lista.
create or replace function market_catalog(p_token text)
returns table (
  id         text,
  kind       text,
  name       text,
  unit       text,
  is_event   boolean,
  sort_order int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _session_community(p_token);
  return query
    select i.id, i.kind, i.name, i.unit, i.is_event, i.sort_order
      from market_items i
     where i.is_active
     order by i.kind, i.sort_order;
end;
$$;

-- Todo lo que la pantalla necesita de una semana: el calendario del viernes de
-- pedido (nulo si no está sembrado), los participantes y las 4 listas.
create or replace function market_list_load(p_token text, p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_friday    date;
begin
  perform _market_check_week(p_week_start);
  v_friday := p_week_start - 3;

  return jsonb_build_object(
    'week_start',   p_week_start,
    'friday',       v_friday,
    'deadline_at',  _market_deadline(v_friday),
    'kinds_due',    (select to_jsonb(c.kinds) from market_calendar c where c.friday = v_friday),
    'participants', (select c.participants from communities c where c.name = v_community),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind',                   l.kind,
               'quantities',             l.quantities,
               'sent',                   l.sent_quantities is not null,
               'modified',               l.sent_quantities is not null
                                         and l.sent_quantities is distinct from l.quantities,
               'submitted_at',           l.submitted_at,
               'first_submitted_at',     l.first_submitted_at,
               'submit_count',           l.submit_count,
               'late',                   l.late,
               'changed_after_deadline', l.changed_after_deadline
             ) order by l.kind)
        from market_lists l
       where l.community = v_community and l.week_start = p_week_start
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function market_catalog(text)                          to anon;
grant execute on function market_list_load(text, date)                  to anon;
