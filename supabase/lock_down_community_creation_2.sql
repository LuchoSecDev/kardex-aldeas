-- Plan 005: una comunidad sin PIN ya no entra (antes entraba cualquiera). Correr después de
-- fixed_communities.sql (que le pone PIN a las 8) y de lock_down_community_creation_1.sql.
-- Es login_community de session_access.sql con una sola diferencia: sin PIN guardado, devuelve null.

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

  if v_has_pin is not true then
    return null;
  end if;

  if p_pin is null or not verify_community_pin(p_name, p_pin) then
    return null;
  end if;

  delete from community_sessions where expires_at <= now();

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into community_sessions (token_hash, community, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_name,
          now() + interval '12 hours');

  return v_token;
end;
$$;

grant execute on function login_community(text, text) to anon;
