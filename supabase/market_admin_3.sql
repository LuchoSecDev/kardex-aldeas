-- Lista de mercado (plan 003, Fase C) — archivo 3 de 3: marcar revisada y campanita.
-- Correr los 3 EN ORDEN en el SQL Editor. Exigen el token de administradora.

-- Marcar como revisada la lista enviada de una comunidad (las 4 a la vez).
-- Revisar = "vi lo que enviaron"; no cambia ningún dato de la comunidad.
create or replace function admin_market_mark_reviewed(p_token text, p_community text, p_week_start date)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _admin_session(p_token);
  perform _market_check_week(p_week_start);

  update market_lists l
     set reviewed_at = now()
   where l.community = p_community and l.week_start = p_week_start
     and l.sent_quantities is not null;

  if not found then
    raise exception 'Envío no encontrado';
  end if;
end;
$$;

-- Lo que la campanita muestra de las listas de mercado: envíos sin revisar (incluye los
-- reenvíos con cambios, que vuelven a quedar sin revisar). Solo los últimos 120 días.
create or replace function admin_market_notifications(p_token text)
returns table (
  community              text,
  week_start             date,
  submitted_at           timestamptz,
  submit_count           int,
  late                   boolean,
  changed_after_deadline boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _admin_session(p_token);
  return query
    select l.community, l.week_start, max(l.submitted_at), max(l.submit_count),
           bool_or(l.late), bool_or(l.changed_after_deadline)
      from market_lists l
     where l.sent_quantities is not null
       and l.week_start > current_date - 120
     group by l.community, l.week_start
    having bool_or(l.reviewed_at is null)
     order by max(l.submitted_at) desc
     limit 100;
end;
$$;

grant execute on function admin_market_mark_reviewed(text, text, date) to anon;
grant execute on function admin_market_notifications(text)             to anon;
