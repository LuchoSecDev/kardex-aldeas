-- Lista de mercado (plan 003, Fase A) — archivo 5 de 5: enviar la lista de la semana.
-- Correr los 5 EN ORDEN (1 a 5) en el SQL Editor, después de week_submissions.sql, y luego
-- los market_seed_N.sql. Va en archivos chicos: el editor no deja pegar más de ~100 líneas.
-- Es seguro repetirlos. No hay precios (plan 003).

-- Envía (o reenvía) TODAS las listas de la semana juntas, como el libro de
-- Excel: los tipos vacíos quedan registrados como "no pedí".
--   PARTICIPANTES_REQUERIDOS  la comunidad aún no tiene su número de participantes
--   LISTA_VACIA               los 4 tipos están vacíos
-- "late" se decide solo en el primer envío; "changed_after_deadline" se marca si
-- se reenvía con cambios después del plazo. Reenviar sin cambios no vuelve la
-- lista "sin revisar".
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
                                        and l.sent_quantities is distinct from l.quantities),
           late                   = case when l.first_submitted_at is null
                                         then now() > v_deadline
                                         else l.late end,
           reviewed_at            = case when l.sent_quantities is distinct from l.quantities
                                         then null
                                         else l.reviewed_at end,
           first_submitted_at     = coalesce(l.first_submitted_at, now()),
           sent_quantities        = l.quantities,
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

grant execute on function market_list_submit(text, date)                to anon;
