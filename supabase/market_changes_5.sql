-- Zona de cambios de la lista de mercado (plan 008, Fase A) — archivo 5 de 6: resumen de la semana (nutricionista).
-- Es admin_market_overview de market_admin_1.sql con dos diferencias: cada comunidad trae `changes_count`
-- (cuántas notas ENVIÓ) y «tiene cambios sin enviar» también cuenta las notas editadas después de enviar.
-- SOLO LECTURA. Exige el token de administradora.

create or replace function admin_market_overview(p_token text, p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _admin_session(p_token);
  perform _market_check_week(p_week_start);

  return jsonb_build_object(
    'week_start',  p_week_start,
    'friday',      p_week_start - 3,
    'deadline_at', _market_deadline(p_week_start - 3),
    'kinds_due',   (select to_jsonb(c.kinds) from market_calendar c where c.friday = p_week_start - 3),
    'communities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'community',              t.name,
               'participants',           t.participants,
               'sent',                   t.sent,
               'submitted_at',           t.submitted_at,
               'first_submitted_at',     t.first_submitted_at,
               'submit_count',           t.submit_count,
               'late',                   t.late,
               'changed_after_deadline', t.changed_after_deadline,
               'reviewed',               t.reviewed,
               'has_unsent_changes',     t.unsent,
               'has_draft',              t.draft,
               'changes_count',          t.n_changes,
               'counts', jsonb_build_object('fruver', t.c_fruver, 'carnes', t.c_carnes,
                                            'abarrotes', t.c_abarrotes, 'aseo', t.c_aseo)
             ) order by t.name)
        from (
          select c.name,
                 coalesce(max(l.participants) filter (where l.sent_quantities is not null), c.participants) as participants,
                 coalesce(bool_or(l.sent_quantities is not null), false) as sent,
                 max(l.submitted_at) as submitted_at,
                 min(l.first_submitted_at) as first_submitted_at,
                 coalesce(max(l.submit_count), 0) as submit_count,
                 coalesce(bool_or(l.late), false) as late,
                 coalesce(bool_or(l.changed_after_deadline), false) as changed_after_deadline,
                 coalesce(bool_and(l.reviewed_at is not null) filter (where l.sent_quantities is not null), false) as reviewed,
                 coalesce(bool_or(l.sent_quantities is not null and (l.sent_quantities is distinct from l.quantities
                                                                     or l.sent_changes is distinct from l.changes)), false) as unsent,
                 coalesce(bool_or(l.sent_quantities is null and (l.quantities <> '{}'::jsonb or l.changes <> '[]'::jsonb)), false) as draft,
                 coalesce(sum(jsonb_array_length(l.sent_changes)) filter (where l.sent_quantities is not null), 0)::int as n_changes,
                 coalesce(sum(k.n) filter (where l.kind = 'fruver'), 0)::int    as c_fruver,
                 coalesce(sum(k.n) filter (where l.kind = 'carnes'), 0)::int    as c_carnes,
                 coalesce(sum(k.n) filter (where l.kind = 'abarrotes'), 0)::int as c_abarrotes,
                 coalesce(sum(k.n) filter (where l.kind = 'aseo'), 0)::int      as c_aseo
            from communities c
            left join market_lists l on l.community = c.name and l.week_start = p_week_start
            left join lateral (
              select count(*)::int as n from jsonb_object_keys(coalesce(l.sent_quantities, '{}'::jsonb))
            ) k on true
           group by c.name, c.participants
        ) t
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function admin_market_overview(text, date) to anon;
