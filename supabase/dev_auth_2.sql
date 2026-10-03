-- Acceso del desarrollador a la pantalla /dev (plan 007, Fase B1) — archivo 2 de 2: entrar, salir y cambiar la contraseña.
-- Es seguro repetirlo. Requiere dev_auth_1.sql.

-- Entrar. Devuelve {token, must_change}, o null si la contraseña es incorrecta O si aún no hay cuenta (no se distinguen).
create or replace function dev_login(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acc     dev_account%rowtype;
  v_token text;
begin
  select * into acc from dev_account where id = 1;
  if not found then
    return null;
  end if;

  perform _dev_assert_not_locked();

  if p_password is null or acc.password_hash <> crypt(p_password, acc.password_hash) then
    perform _dev_register_failure();
    return null;
  end if;

  update dev_account set failed_count = 0, locked_until = null where id = 1;
  delete from dev_sessions where expires_at <= now();
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into dev_sessions (token_hash, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '8 hours');

  return jsonb_build_object('token', v_token, 'must_change', acc.must_change);
end;
$$;

-- Comprueba que la sesión es válida y que la contraseña ya no es temporal.
create or replace function dev_ping(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _dev_session(p_token); return true;
end;
$$;

create or replace function dev_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from dev_sessions where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
end;
$$;

-- Cambiar la contraseña. Devuelve {ok}: ok=false si la actual no coincide (cuenta como intento fallido).
create or replace function dev_change_password(p_token text, p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acc dev_account%rowtype;
begin
  perform _dev_session(p_token, true);
  perform _dev_assert_not_locked();

  select * into acc from dev_account where id = 1;
  if p_current is null or acc.password_hash <> crypt(p_current, acc.password_hash) then
    perform _dev_register_failure();
    return jsonb_build_object('ok', false);
  end if;

  if p_new is null or char_length(p_new) not between 12 and 128 then
    raise exception 'Contraseña inválida: mínimo 12 caracteres';
  end if;
  if p_new = p_current then
    raise exception 'La nueva contraseña debe ser distinta de la actual';
  end if;

  update dev_account
     set password_hash = crypt(p_new, gen_salt('bf')), must_change = false, failed_count = 0, locked_until = null, updated_at = now()
   where id = 1;
  delete from dev_sessions where token_hash <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  insert into dev_audit_log (action) values ('cambio_clave');
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function dev_login(text)                       to anon;
grant execute on function dev_ping(text)                        to anon;
grant execute on function dev_logout(text)                      to anon;
grant execute on function dev_change_password(text, text, text) to anon;
