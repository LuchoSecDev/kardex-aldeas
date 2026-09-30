-- Lista de mercado (plan 003, Fase C) — archivo 1 de 3: resumen de la semana para la nutricionista.
-- Correr los 3 EN ORDEN en el SQL Editor, después de market_lists_1..5.sql y market_seed_N.sql.
-- Van en archivos chicos: el editor no deja pegar más de ~100 líneas. Es seguro repetirlos.
-- SOLO LECTURA. Exige el token de administradora (uno de comunidad no sirve aquí).

-- Una fila por comunidad: si envió la lista de la semana, cuándo, si llegó tarde, si ya la
-- revisó, cuántos productos pidió de cada tipo (de lo ENVIADO, no del borrador) y si tiene
-- cambios sin enviar. Incluye a las comunidades que aún no envían (sent = false).
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
                 coalesce(bool_or(l.sent_quantities is not null and l.sent_quantities is distinct from l.quantities), false) as unsent,
                 coalesce(bool_or(l.sent_quantities is null and l.quantities <> '{}'::jsonb), false) as draft,
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
