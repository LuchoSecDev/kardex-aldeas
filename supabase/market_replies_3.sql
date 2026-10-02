-- Respuestas a los cambios de la lista de mercado (plan 008, Fase D) — archivo 3 de 4: la nutricionista ve su respuesta.
-- Es admin_market_list de market_changes_6.sql con una diferencia: cada nota de `changes` trae `reply`
-- ({text, at}, o null si todavía no tiene respuesta). Solo lectura; exige el token de administradora.

create or replace function admin_market_list(p_token text, p_community text, p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v record;
begin
  perform _admin_session(p_token);
  perform _market_check_week(p_week_start);
  if not exists (select 1 from communities c where c.name = p_community) then
    raise exception 'Comunidad no encontrada';
  end if;

  select coalesce(bool_or(l.sent_quantities is not null), false) as sent,
         max(l.submitted_at) as submitted_at,
         min(l.first_submitted_at) as first_submitted_at,
         coalesce(max(l.submit_count), 0) as submit_count,
         coalesce(bool_or(l.late), false) as late,
         coalesce(bool_or(l.changed_after_deadline), false) as changed_after_deadline,
         coalesce(bool_and(l.reviewed_at is not null) filter (where l.sent_quantities is not null), false) as reviewed,
         coalesce(bool_or(l.sent_quantities is not null and (l.sent_quantities is distinct from l.quantities
                                                             or l.sent_changes is distinct from l.changes)), false) as unsent,
         max(l.participants) filter (where l.sent_quantities is not null) as participants
    into v
    from market_lists l
   where l.community = p_community and l.week_start = p_week_start;

  return jsonb_build_object(
    'community', p_community, 'week_start', p_week_start, 'friday', p_week_start - 3,
    'deadline_at', _market_deadline(p_week_start - 3),
    'kinds_due', (select to_jsonb(c.kinds) from market_calendar c where c.friday = p_week_start - 3),
    'sent', v.sent, 'submitted_at', v.submitted_at, 'first_submitted_at', v.first_submitted_at,
    'submit_count', v.submit_count, 'late', v.late, 'changed_after_deadline', v.changed_after_deadline,
    'reviewed', v.reviewed, 'has_unsent_changes', v.unsent,
    'participants', coalesce(v.participants, (select c.participants from communities c where c.name = p_community)),
    'lists', (
      select jsonb_agg(jsonb_build_object('kind', u.kind, 'items', coalesce((
               select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit,
                                                   'is_event', i.is_event,
                                                   'quantity', (l.sent_quantities -> i.id)) order by i.sort_order)
                 from market_lists l
                 join market_items i on i.kind = l.kind and jsonb_exists(l.sent_quantities, i.id)
                where l.community = p_community and l.week_start = p_week_start and l.kind = u.kind
             ), '[]'::jsonb), 'changes', coalesce((
               select jsonb_agg(jsonb_build_object('id', e.val ->> 'id', 'item_id', e.val -> 'item_id',
                                                   'item_name', i.name, 'unit', i.unit,
                                                   'text', e.val ->> 'text', 'at', e.val ->> 'at',
                                                   'reply', (select jsonb_build_object('text', r.text, 'at', r.updated_at)
                                                               from market_change_replies r
                                                              where r.community = p_community and r.week_start = p_week_start
                                                                and r.kind = u.kind and r.change_id = e.val ->> 'id')) order by e.ord)
                 from market_lists l
                 cross join lateral jsonb_array_elements(l.sent_changes) with ordinality as e(val, ord)
                 left join market_items i on i.id = e.val ->> 'item_id'
                where l.community = p_community and l.week_start = p_week_start and l.kind = u.kind
             ), '[]'::jsonb)) order by u.ord)
        from unnest(array['fruver', 'carnes', 'abarrotes', 'aseo']) with ordinality as u(kind, ord)
    )
  );
end;
$$;

grant execute on function admin_market_list(text, text, date) to anon;
