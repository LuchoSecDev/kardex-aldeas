-- Zona de cambios de la lista de mercado (plan 008, Fase A) — archivo 3 de 6: cargar la semana.
-- Es market_list_load de market_lists_3.sql con dos diferencias: cada lista trae sus `changes`, y
-- «modificada» también es verdad si las notas cambiaron después de enviar.

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
               'changes',                l.changes,
               'sent',                   l.sent_quantities is not null,
               'modified',               l.sent_quantities is not null
                                         and (l.sent_quantities is distinct from l.quantities
                                              or l.sent_changes is distinct from l.changes),
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

grant execute on function market_list_load(text, date) to anon;
