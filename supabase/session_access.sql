-- Acceso a datos por sesión (token) en vez de acceso directo a las tablas.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- community_pin.sql y pin_rate_limit.sql.
--
-- Problema: kardex_records y ajustes eran legibles/escribibles por cualquiera
-- que tuviera la anon key (que es pública), sin importar el PIN. El PIN solo
-- controlaba la pantalla de entrada.
--
-- Solución: al entrar con el PIN correcto, login_community() entrega un token
-- aleatorio de 12 horas (deslizante: se renueva con cada uso). Todas las
-- lecturas y escrituras pasan por funciones que exigen ese token y solo
-- devuelven o modifican los datos de SU comunidad.
--
-- ESTE ARCHIVO ES ADITIVO: la app actual (que accede directo a las tablas)
-- sigue funcionando después de correrlo. El cierre del acceso directo está en
-- lock_down_direct_access.sql y debe correrse SOLO cuando la versión nueva de
-- la app ya esté desplegada.

-- ---------------------------------------------------------------------------
-- Sesiones
-- ---------------------------------------------------------------------------

-- Se guarda solo el hash SHA-256 del token: si alguien viera esta tabla, no
-- podría usar los tokens.
create table if not exists community_sessions (
  token_hash text primary key,
  community  text not null references communities(name) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists community_sessions_community_idx
  on community_sessions (community);

alter table community_sessions enable row level security;
revoke all on community_sessions from anon, authenticated;

-- Valida un token, lo renueva y devuelve la comunidad a la que pertenece.
-- Es interna: no se expone por la API.
create or replace function _session_community(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text;
begin
  if p_token is null or p_token = '' then
    raise exception 'SESION_INVALIDA';
  end if;

  update community_sessions
     set expires_at = now() + interval '12 hours'
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and expires_at > now()
  returning community into v_community;

  if v_community is null then
    raise exception 'SESION_INVALIDA';
  end if;

  return v_community;
end;
$$;

revoke execute on function _session_community(text) from public, anon, authenticated;

-- Entrar a una comunidad. Devuelve el token, o null si el PIN es incorrecto
-- (o la comunidad no existe). Comunidades sin PIN entran sin pedirlo, igual
-- que antes. Reutiliza verify_community_pin, así que conserva el bloqueo por
-- intentos fallidos (PIN_BLOQUEADO).
create or replace function login_community(p_name text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_has_pin boolean;
  v_token   text;
begin
  select (pin_hash is not null) into v_has_pin
    from communities where name = p_name;

  if v_has_pin is null then
    return null;
  end if;

  if v_has_pin then
    if p_pin is null or not verify_community_pin(p_name, p_pin) then
      return null;
    end if;
  end if;

  delete from community_sessions where expires_at <= now();

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into community_sessions (token_hash, community, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_name,
          now() + interval '12 hours');

  return v_token;
end;
$$;

create or replace function logout_community(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from community_sessions
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturas (siempre limitadas a la comunidad del token)
-- ---------------------------------------------------------------------------

create or replace function kardex_load_month(p_token text, p_year int, p_month int)
returns setof kardex_records
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  return query
    select * from kardex_records
     where community = v_community and year = p_year and month = p_month;
end;
$$;

create or replace function kardex_load_ajustes(p_token text, p_year int, p_month int)
returns setof ajustes
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  return query
    select * from ajustes
     where community = v_community and year = p_year and month = p_month
     order by created_at asc;
end;
$$;

create or replace function kardex_load_ajustes_history(p_token text, p_limit int default 200)
returns setof ajustes
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  return query
    select * from ajustes
     where community = v_community
     order by created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

create or replace function kardex_months_with_data(p_token text)
returns table (year int, month int)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_community text := _session_community(p_token);
begin
  return query
    select distinct r.year, r.month from kardex_records r
     where r.community = v_community;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escrituras (con validación en el servidor)
-- ---------------------------------------------------------------------------

-- Guardado automático de un producto en un mes. Los saldos anteriores
-- (prev_balances) pueden ser negativos: pasa cuando las salidas superan el
-- stock y la app muestra la alerta de error de digitación.
-- Las columnas exits/entries/prev_balances son jsonb (arreglos JSON).
drop function if exists kardex_save_product(text, int, int, text, numeric[], numeric[], numeric[]);

create or replace function kardex_save_product(
  p_token text, p_year int, p_month int, p_product_id text,
  p_exits jsonb, p_entries jsonb, p_prev_balances jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11 then
    raise exception 'Fecha inválida';
  end if;
  if not exists (select 1 from products where id = p_product_id) then
    raise exception 'Producto inválido';
  end if;
  if jsonb_typeof(p_exits) is distinct from 'array'
     or jsonb_typeof(p_entries) is distinct from 'array'
     or jsonb_typeof(p_prev_balances) is distinct from 'array'
     or jsonb_array_length(p_exits) <> 35
     or jsonb_array_length(p_entries) <> 5
     or jsonb_array_length(p_prev_balances) <> 5 then
    raise exception 'Datos incompletos';
  end if;
  -- Salidas y entradas: números >= 0. Saldos: cualquier número (pueden ser
  -- negativos, ver nota arriba).
  if exists (
       select 1 from jsonb_array_elements(p_exits) e
        where case when jsonb_typeof(e) = 'number' then (e #>> '{}')::numeric < 0 else true end)
     or exists (
       select 1 from jsonb_array_elements(p_entries) e
        where case when jsonb_typeof(e) = 'number' then (e #>> '{}')::numeric < 0 else true end)
     or exists (
       select 1 from jsonb_array_elements(p_prev_balances) e
        where jsonb_typeof(e) <> 'number') then
    raise exception 'Valores inválidos';
  end if;

  insert into kardex_records
    (community, year, month, product_id, exits, entries, prev_balances, updated_at)
  values
    (v_community, p_year, p_month, p_product_id, p_exits, p_entries, p_prev_balances, now())
  on conflict (community, year, month, product_id) do update
    set exits         = excluded.exits,
        entries       = excluded.entries,
        prev_balances = excluded.prev_balances,
        updated_at    = excluded.updated_at;
end;
$$;

-- Ajuste auditado (append-only: no hay función para editarlos ni borrarlos).
create or replace function kardex_insert_ajuste(
  p_token text, p_product_id text, p_year int, p_month int, p_week_index int,
  p_saldo_anterior numeric, p_saldo_nuevo numeric, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_motivo    text := btrim(p_motivo);
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11
     or p_week_index not between 0 and 4 then
    raise exception 'Fecha inválida';
  end if;
  if not exists (select 1 from products where id = p_product_id) then
    raise exception 'Producto inválido';
  end if;
  if p_saldo_nuevo is null or p_saldo_nuevo < 0 or p_saldo_anterior is null then
    raise exception 'Saldo inválido';
  end if;
  if v_motivo is null or char_length(v_motivo) not between 1 and 500 then
    raise exception 'Motivo inválido';
  end if;

  insert into ajustes
    (community, product_id, year, month, week_index, saldo_anterior, saldo_nuevo, motivo)
  values
    (v_community, p_product_id, p_year, p_month, p_week_index, p_saldo_anterior, p_saldo_nuevo, v_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: solo estas funciones son llamables por el cliente.
-- ---------------------------------------------------------------------------
grant execute on function login_community(text, text)                                     to anon;
grant execute on function logout_community(text)                                          to anon;
grant execute on function kardex_load_month(text, int, int)                               to anon;
grant execute on function kardex_load_ajustes(text, int, int)                             to anon;
grant execute on function kardex_load_ajustes_history(text, int)                          to anon;
grant execute on function kardex_months_with_data(text)                                   to anon;
grant execute on function kardex_save_product(text, int, int, text, jsonb, jsonb, jsonb)             to anon;
grant execute on function kardex_insert_ajuste(text, text, int, int, int, numeric, numeric, text)    to anon;
