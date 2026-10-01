-- Plan 005: cierra la creación libre de comunidades. Correr DESPUÉS de desplegar la app nueva
-- (la anterior todavía ofrecía "crear comunidad"; sin esta función cerrada ya no se puede).
--
-- 1) Las dos funciones abiertas a cualquiera dejan de ser llamables desde internet.
-- 2) Crear una comunidad (p. ej. la novena, o las de las pruebas automáticas) pasa por
--    provision_community, que exige una clave de aprovisionamiento que solo tú conoces.
--
-- Después de correr este archivo define la clave (larga y aleatoria; guárdala en .env.local
-- como PROVISION_KEY; NO la escribas en ningún archivo del repositorio):
--   insert into community_provision_key (id, key_hash)
--   values (1, encode(sha256(convert_to('TU-CLAVE', 'UTF8')), 'hex'))
--   on conflict (id) do update set key_hash = excluded.key_hash;

create table if not exists community_provision_key (
  id       smallint primary key check (id = 1),
  key_hash text not null
);
alter table community_provision_key enable row level security;
revoke all on community_provision_key from anon, authenticated;

create or replace function provision_community(p_key text, p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  clean_name text := btrim(p_name);
begin
  if p_key is null or not exists (
       select 1 from community_provision_key
        where id = 1 and key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    raise exception 'CLAVE_INVALIDA';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
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

grant execute on function provision_community(text, text, text) to anon;

revoke execute on function create_community_with_pin(text, text) from public, anon, authenticated;
revoke execute on function claim_pin_for_existing_community(text, text) from public, anon, authenticated;
