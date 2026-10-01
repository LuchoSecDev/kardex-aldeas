-- Zona de cambios de la lista de mercado (plan 008, Fase A) — archivo 4 de 6: enviar.
-- Es market_list_submit de market_lists_5.sql con una diferencia: al enviar también se copian las notas
-- (sent_changes = changes), y cambiar solo las notas cuenta como «cambió» para el plazo y para volver a
-- dejar la lista «sin revisar». Sigue exigiendo cantidades: unas notas solas no son un pedido (LISTA_VACIA).

create or replace function market_list_submit(p_token text, p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community    text := _session_community(p_token);
  v_participants int;
  v_deadline     timestamptz;
  v_result       jsonb;
begin
  perform _market_check_week(p_week_start);

  select c.participants into v_participants from communities c where c.name = v_community;
  if v_participants is null then
    raise exception 'PARTICIPANTES_REQUERIDOS';
  end if;

  insert into market_lists (community, week_start, kind)
  select v_community, p_week_start, k
    from unnest(array['fruver', 'carnes', 'abarrotes', 'aseo']) as k
  on conflict (community, week_start, kind) do nothing;

  if not exists (
    select 1 from market_lists l
     where l.community = v_community and l.week_start = p_week_start
       and l.quantities <> '{}'::jsonb
  ) then
    raise exception 'LISTA_VACIA';
  end if;

  v_deadline := _market_deadline(p_week_start - 3);

  with sent as (
    update market_lists l
       set changed_after_deadline = l.changed_after_deadline
                                    or (l.submitted_at is not null
                                        and now() > v_deadline
                                        and (l.sent_quantities is distinct from l.quantities
                                             or l.sent_changes is distinct from l.changes)),
           late                   = case when l.first_submitted_at is null
                                         then now() > v_deadline
                                         else l.late end,
           reviewed_at            = case when l.sent_quantities is distinct from l.quantities
                                              or l.sent_changes is distinct from l.changes
                                         then null
                                         else l.reviewed_at end,
           first_submitted_at     = coalesce(l.first_submitted_at, now()),
           sent_quantities        = l.quantities,
           sent_changes           = l.changes,
           participants           = v_participants,
           submitted_at           = now(),
           submit_count           = l.submit_count + 1,
           updated_at             = now()
     where l.community = v_community and l.week_start = p_week_start
    returning l.late, l.changed_after_deadline
  )
  select jsonb_build_object(
           'submitted_at',           now(),
           'late',                   coalesce(bool_or(late), false),
           'changed_after_deadline', coalesce(bool_or(changed_after_deadline), false)
         )
    into v_result
    from sent;

  return v_result;
end;
$$;

grant execute on function market_list_submit(text, date) to anon;
