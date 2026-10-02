-- Respuestas a los cambios de la lista de mercado (plan 008, Fase D) — archivo 4 de 4: la campanita de la comunidad.
-- Exigen el token de COMUNIDAD (uno de administradora no sirve aquí) y solo ven las respuestas de SU comunidad.

-- Lo que muestra la campanita: respuestas sin leer a notas que todavía existen en la lista de la comunidad
-- (si borró la nota, la respuesta ya no cuenta). Solo las de los últimos 120 días, las más recientes primero.
create or replace function market_replies_unseen(p_token text)
returns table (
  week_start  date,
  kind        text,
  change_id   text,
  change_text text,
  item_name   text,
  reply_text  text,
  replied_at  timestamptz
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
    select r.week_start, r.kind, r.change_id, e.val ->> 'text', i.name, r.text, r.updated_at
      from market_change_replies r
      join market_lists l on l.community = r.community and l.week_start = r.week_start and l.kind = r.kind
     cross join lateral jsonb_array_elements(l.changes) as e(val)
      left join market_items i on i.id = e.val ->> 'item_id'
     where r.community = v_community
       and r.seen_at is null
       and r.week_start > current_date - 120
       and e.val ->> 'id' = r.change_id
     order by r.updated_at desc
     limit 50;
end;
$$;

-- Marca como leídas las respuestas de una semana (la persona las está viendo): solo las de un tipo de lista si se indica
-- `p_kind`, o las de toda la semana si va null.
create or replace function market_replies_mark_seen(p_token text, p_week_start date, p_kind text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  perform _market_check_week(p_week_start);
  update market_change_replies
     set seen_at = now()
   where community = v_community and week_start = p_week_start and seen_at is null
     and (p_kind is null or kind = p_kind);
end;
$$;

grant execute on function market_replies_unseen(text)            to anon;
grant execute on function market_replies_mark_seen(text, date, text) to anon;
