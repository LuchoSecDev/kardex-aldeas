-- Límite de intentos para el PIN de comunidad + validación del nombre.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- community_pin.sql.
--
-- Problema: un PIN de 4 dígitos tiene solo 10.000 combinaciones y
-- verify_community_pin se podía llamar sin límite por la API pública.
--
-- Solución: tras 5 intentos fallidos seguidos, esa comunidad queda bloqueada
-- 15 minutos. Un PIN correcto reinicia el contador.
--
-- Compromiso conocido: como no hay login, alguien podría bloquear a propósito
-- una comunidad ajena escribiendo PIN incorrectos. Es preferible a que puedan
-- adivinar el PIN; el bloqueo dura solo 15 minutos y no borra nada.

create table if not exists community_pin_attempts (
  community    text primary key references communities(name) on delete cascade,
  failed_count int not null default 0,
  locked_until timestamptz
);

-- Solo las funciones security definer tocan esta tabla; el cliente no.
alter table community_pin_attempts enable row level security;
revoke all on community_pin_attempts from anon;

create or replace function verify_community_pin(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored_hash text;
  attempts    community_pin_attempts%rowtype;
  max_fails   constant int := 5;
  lock_time   constant interval := interval '15 minutes';
begin
  select pin_hash into stored_hash from communities where name = p_name;
  if stored_hash is null then
    return false;
  end if;

  select * into attempts from community_pin_attempts where community = p_name;
  if found and attempts.locked_until is not null and attempts.locked_until > now() then
    -- Sin escrituras en esta rama: el raise revierte la transacción.
    raise exception 'PIN_BLOQUEADO';
  end if;

  if stored_hash = crypt(p_pin, stored_hash) then
    delete from community_pin_attempts where community = p_name;
    return true;
  end if;

  -- Fallo: se suma el intento (atómico ante llamadas concurrentes) y, si
  -- llega al máximo, se bloquea. Se devuelve false (no raise) para que el
  -- incremento no se revierta.
  insert into community_pin_attempts as a (community, failed_count)
  values (p_name, 1)
  on conflict (community) do update
    set failed_count = case
          when a.locked_until is not null and a.locked_until <= now() then 1
          else a.failed_count + 1
        end,
        locked_until = case
          when a.locked_until is not null and a.locked_until <= now() then null
          else a.locked_until
        end;

  update community_pin_attempts
     set locked_until = now() + lock_time,
         failed_count = 0
   where community = p_name and failed_count >= max_fails;

  return false;
end;
$$;

grant execute on function verify_community_pin(text, text) to anon;

-- Nombre de comunidad: sin espacios sobrantes, entre 2 y 60 caracteres.
create or replace function create_community_with_pin(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  clean_name text := btrim(p_name);
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN inválido';
  end if;
  if clean_name is null or char_length(clean_name) not between 2 and 60 then
    raise exception 'Nombre de comunidad inválido';
  end if;

  insert into communities (name, pin_hash)
  values (clean_name, crypt(p_pin, gen_salt('bf')))
  on conflict (name) do nothing;

  return found;
end;
$$;

grant execute on function create_community_with_pin(text, text) to anon;

-- Verificación (opcional), como anon desde la app o con curl:
--   5 llamadas seguidas a verify_community_pin con un PIN incorrecto devuelven
--   false; la sexta responde error con mensaje PIN_BLOQUEADO durante 15 min.
-- Para desbloquear a mano una comunidad:
--   delete from community_pin_attempts where community = '-----';
