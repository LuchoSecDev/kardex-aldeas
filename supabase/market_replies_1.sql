-- Respuestas a los cambios de la lista de mercado (plan 008, Fase D) — archivo 1 de 4: tabla y respuesta de la nutricionista.
-- Correr los 4 EN ORDEN (1 a 4) en el SQL Editor, después de market_changes_1..6.sql. Es seguro repetirlos.
-- Van en archivos chicos: el editor no deja pegar más de ~100 líneas.
--
-- La nutricionista responde a cada nota de cambio ENVIADA (p. ej. «pescado por pechuga» -> «Se envía pechuga»):
-- una respuesta por nota, de hasta 200 caracteres, que puede editar o quitar. La comunidad la ve junto a su nota y recibe
-- una campanita. Van en una tabla aparte porque el guardado automático de la comunidad reemplaza todo el arreglo de notas
-- y borraría una respuesta guardada dentro de él.

create table if not exists market_change_replies (
  id          uuid primary key default gen_random_uuid(),
  community   text not null references communities(name) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 1),
  kind        text not null check (kind in ('fruver', 'carnes', 'abarrotes', 'aseo')),
  change_id   text not null,
  -- Texto de la nota al momento de responder: si la comunidad la cambia después, se avisa que la respuesta fue a otra versión.
  change_text text not null,
  text        text not null check (char_length(text) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  seen_at     timestamptz,
  unique (community, week_start, kind, change_id)
);

alter table market_change_replies enable row level security;
revoke all on market_change_replies from anon, authenticated;

-- Responde (o edita) la respuesta a una nota ENVIADA. Un texto vacío QUITA la respuesta. Editarla la vuelve a dejar «sin leer».
-- Exige el token de administradora.
create or replace function admin_market_reply(
  p_token text, p_community text, p_week_start date, p_kind text, p_change_id text, p_text text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_note text;
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  perform _admin_session(p_token);
  perform _market_check_week(p_week_start);
  if p_kind is null or p_kind not in ('fruver', 'carnes', 'abarrotes', 'aseo') then
    raise exception 'Tipo de lista inválido';
  end if;

  select e ->> 'text' into v_note
    from market_lists l
   cross join lateral jsonb_array_elements(l.sent_changes) e
   where l.community = p_community and l.week_start = p_week_start and l.kind = p_kind and e ->> 'id' = p_change_id;
  if v_note is null then
    raise exception 'Cambio no encontrado';
  end if;

  if v_text = '' then
    delete from market_change_replies
     where community = p_community and week_start = p_week_start and kind = p_kind and change_id = p_change_id;
    return;
  end if;
  if char_length(v_text) > 200 then
    raise exception 'Respuesta inválida';
  end if;

  insert into market_change_replies (community, week_start, kind, change_id, change_text, text)
  values (p_community, p_week_start, p_kind, p_change_id, v_note, v_text)
  on conflict (community, week_start, kind, change_id) do update
    set text        = excluded.text,
        change_text = excluded.change_text,
        updated_at  = now(),
        seen_at     = case when market_change_replies.text is distinct from excluded.text then null
                           else market_change_replies.seen_at end;
end;
$$;

grant execute on function admin_market_reply(text, text, date, text, text, text) to anon;
