-- Lista de mercado (pedido semanal de cada comunidad): Fase A del plan 003.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- week_submissions.sql, y luego correr market_seed.sql (catálogo y calendario).
-- Es aditivo: no toca nada existente salvo agregar una columna a communities.
--
-- Qué guarda
--   market_items     catálogo de la lista (Fruver y lácteos, Carnes, Abarrotes, Aseo).
--                    Solo cantidades y unidades: NO hay precios (plan 003).
--   market_calendar  qué se pide cada viernes y hasta qué hora se puede enviar.
--   market_lists     una fila por (comunidad, semana, tipo). La semana se identifica
--                    por el LUNES de la semana de entrega (= viernes de pedido + 3).
--   communities.participants  número fijo de participantes de la comunidad.
--
-- Estados de una lista (se calculan, no se guardan):
--   borrador    nunca se ha enviado
--   enviada     enviada y sin cambios desde entonces
--   modificada  se editó después de enviarla (la nutricionista sigue viendo lo enviado)
--
-- Todas las tablas nuevas tienen RLS y `revoke all` para anon: solo las funciones
-- security definer (que exigen token de sesión) las tocan.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

-- Participantes: la columna NO entra en el `grant select` por columnas de
-- communities, así que el cliente solo la ve a través de market_list_load().
alter table communities add column if not exists participants int
  check (participants is null or participants between 1 and 500);

create table if not exists market_items (
  id         text primary key,
  kind       text not null check (kind in ('fruver', 'carnes', 'abarrotes', 'aseo')),
  name       text not null,
  unit       text not null,
  is_event   boolean not null default false,
  sort_order int  not null,
  is_active  boolean not null default true,
  unique (kind, sort_order)
);

create table if not exists market_calendar (
  friday      date primary key check (extract(isodow from friday) = 5),
  -- Tipos que se piden ese viernes. Fruver (incluye lácteos) y carnes van siempre.
  kinds       text[] not null check (kinds <@ array['fruver', 'carnes', 'abarrotes', 'aseo']),
  -- Hasta cuándo se puede enviar sin marcarse como tardía (normalmente viernes
  -- 5 pm hora de Bogotá; en viernes festivo, el día hábil anterior).
  deadline_at timestamptz not null
);

create table if not exists market_lists (
  id                     uuid primary key default gen_random_uuid(),
  community              text not null references communities(name) on delete cascade,
  week_start             date not null check (extract(isodow from week_start) = 1),
  kind                   text not null check (kind in ('fruver', 'carnes', 'abarrotes', 'aseo')),
  -- Copia de trabajo: {item_id: cantidad}, solo cantidades distintas de cero.
  quantities             jsonb not null default '{}'::jsonb,
  -- Lo último que se envió (lo que ve la nutricionista). Nulo = nunca enviada.
  sent_quantities        jsonb,
  -- Copia del número de participantes vigente al enviar.
  participants           int,
  first_submitted_at     timestamptz,
  submitted_at           timestamptz,
  submit_count           int not null default 0,
  -- Se juzga por el PRIMER envío: reenviar después no vuelve tardía una lista a tiempo.
  late                   boolean not null default false,
  -- Se reenvió con cambios después del plazo.
  changed_after_deadline boolean not null default false,
  reviewed_at            timestamptz,
  updated_at             timestamptz not null default now(),
  unique (community, week_start, kind)
);

alter table market_items    enable row level security;
alter table market_calendar enable row level security;
alter table market_lists    enable row level security;
revoke all on market_items    from anon, authenticated;
revoke all on market_calendar from anon, authenticated;
revoke all on market_lists    from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Piezas internas (no se exponen por la API)
-- ---------------------------------------------------------------------------

-- La semana debe ser un lunes y estar en un rango razonable.
create or replace function _market_check_week(p_week_start date)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_week_start is null
     or extract(isodow from p_week_start) <> 1
     or extract(year from p_week_start) not between 2000 and 2100 then
    raise exception 'Semana inválida';
  end if;
end;
$$;

-- Plazo de envío del viernes de pedido: el del calendario y, si ese viernes no
-- está sembrado (p. ej. un año futuro), viernes 5 pm hora de Bogotá.
create or replace function _market_deadline(p_friday date)
returns timestamptz
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (select c.deadline_at from market_calendar c where c.friday = p_friday),
    (p_friday + time '17:00') at time zone 'America/Bogota'
  );
$$;

-- Valida y limpia las cantidades de un tipo: debe ser un objeto {item_id: número}
-- con ítems activos de ESE tipo y cantidades >= 0. Los ceros se descartan.
create or replace function _market_clean_quantities(p_kind text, p_quantities jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key   text;
  v_value jsonb;
  v_num   numeric;
  v_clean jsonb := '{}'::jsonb;
begin
  if p_kind is null or p_kind not in ('fruver', 'carnes', 'abarrotes', 'aseo') then
    raise exception 'Tipo de lista inválido';
  end if;
  if p_quantities is null or jsonb_typeof(p_quantities) <> 'object' then
    raise exception 'Cantidades inválidas';
  end if;

  for v_key, v_value in select * from jsonb_each(p_quantities) loop
    if not exists (
      select 1 from market_items i
       where i.id = v_key and i.kind = p_kind and i.is_active
    ) then
      raise exception 'Producto inválido';
    end if;
    if jsonb_typeof(v_value) <> 'number' then
      raise exception 'Cantidades inválidas';
    end if;
    v_num := (v_value #>> '{}')::numeric;
    if v_num < 0 or v_num > 100000 then
      raise exception 'Cantidades inválidas';
    end if;
    if v_num <> 0 then
      v_clean := v_clean || jsonb_build_object(v_key, v_num);
    end if;
  end loop;

  return v_clean;
end;
$$;

revoke execute on function _market_check_week(date)                from public, anon, authenticated;
revoke execute on function _market_deadline(date)                  from public, anon, authenticated;
revoke execute on function _market_clean_quantities(text, jsonb)   from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Comunidad
-- ---------------------------------------------------------------------------

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

-- Guardado automático de UN tipo de lista (borrador o cambios tras enviar).
create or replace function market_list_save(
  p_token text, p_week_start date, p_kind text, p_quantities jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_clean     jsonb;
begin
  perform _market_check_week(p_week_start);
  v_clean := _market_clean_quantities(p_kind, p_quantities);

  insert into market_lists (community, week_start, kind, quantities)
  values (v_community, p_week_start, p_kind, v_clean)
  on conflict (community, week_start, kind) do update
    set quantities = excluded.quantities,
        updated_at = now();
end;
$$;

-- Número fijo de participantes de la comunidad (cambia solo si llega o se va alguien).
create or replace function market_set_participants(p_token text, p_participants int)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  if p_participants is null or p_participants not between 1 and 500 then
    raise exception 'Participantes inválidos';
  end if;
  update communities set participants = p_participants where name = v_community;
end;
$$;

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

grant execute on function market_catalog(text)                          to anon;
grant execute on function market_list_load(text, date)                  to anon;
grant execute on function market_list_save(text, date, text, jsonb)     to anon;
grant execute on function market_set_participants(text, int)            to anon;
grant execute on function market_list_submit(text, date)                to anon;
