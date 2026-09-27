-- PIN por comunidad: protege quién puede volver a entrar a editar el kardex
-- de una comunidad ya creada. Ejecutar una sola vez en el SQL Editor de
-- Supabase, después de communities.sql.
--
-- El PIN nunca se guarda en texto plano: se hashea con bcrypt (pgcrypto)
-- dentro de las funciones de abajo. El cliente (anon key) nunca puede leer
-- pin_hash directamente, solo llamar a estas funciones y recibir true/false.

create extension if not exists pgcrypto;

alter table communities add column if not exists pin_hash text;
alter table communities add column if not exists has_pin boolean
  generated always as (pin_hash is not null) stored;

-- La política anterior de update era demasiado abierta (using(true) with
-- check(true) — cualquiera podía sobreescribir cualquier columna de
-- cualquier fila). Con PIN en la tabla eso sería un problema serio, así
-- que se quita del todo: crear/actualizar communities pasa exclusivamente
-- por las funciones security definer de abajo.
drop policy if exists "Allow anon insert communities" on communities;
drop policy if exists "Allow anon update communities" on communities;
revoke insert, update, delete on communities from anon;

-- pin_hash nunca es legible por el cliente, ni aunque intente saltarse la
-- política con un select directo: se restringe a nivel de columna.
-- has_pin sí es público (el cliente lo necesita para saber si pedir el
-- PIN o el flujo de creación).
revoke select on communities from anon;
grant select (name, created_at, has_pin) on communities to anon;

-- search_path incluye "extensions" además de "public": Supabase instala
-- pgcrypto ahí por defecto, no en public, así que gen_salt()/crypt() no se
-- encontraban si solo se buscaba en public.
create or replace function create_community_with_pin(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN inválido';
  end if;

  insert into communities (name, pin_hash)
  values (p_name, crypt(p_pin, gen_salt('bf')))
  on conflict (name) do nothing;

  return found;
end;
$$;

create or replace function verify_community_pin(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored_hash text;
begin
  select pin_hash into stored_hash from communities where name = p_name;
  if stored_hash is null then
    return false;
  end if;
  return stored_hash = crypt(p_pin, stored_hash);
end;
$$;

-- "Reclama" un PIN para una comunidad real que ya existía sin uno (ej.
-- Maná). No hace nada si la comunidad ya tiene pin_hash — no se puede usar
-- para secuestrar una comunidad que ya está protegida.
create or replace function claim_pin_for_existing_community(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN inválido';
  end if;

  update communities set pin_hash = crypt(p_pin, gen_salt('bf'))
  where name = p_name and pin_hash is null;

  return found;
end;
$$;

grant execute on function create_community_with_pin(text, text) to anon;
grant execute on function verify_community_pin(text, text) to anon;
grant execute on function claim_pin_for_existing_community(text, text) to anon;

-- Si alguna comunidad olvida su PIN, resetearlo manualmente, reemplazando '-----' por el nombre de la comunidad:
-- update communities set pin_hash = null where name = '-----';
