-- Acceso de la administradora (nutricionista): Fase A del plan 001.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- session_access.sql y pin_rate_limit.sql. Es aditivo: no toca nada existente.
--
-- Una sola cuenta compartida, con contraseña larga (mín. 10 caracteres):
--   * La contraseña inicial la pones tú con admin_reset_password.sql; queda
--     como TEMPORAL y el primer ingreso obliga a cambiarla.
--   * Al cambiarla por primera vez se genera un código de recuperación de un
--     solo uso (se muestra una vez). Con ese código puede poner otra
--     contraseña sin depender de nadie.
--   * Si pierde el código, se resetea con admin_reset_password.sql.
--   * 5 intentos fallidos bloquean la cuenta 15 minutos (igual que el PIN de
--     las comunidades). Compromiso conocido: alguien podría bloquearla a
--     propósito; dura 15 minutos y no borra nada.
--
-- La sesión de administradora es un token de 8 h (deslizante) en una tabla
-- APARTE de las de las comunidades: un token de comunidad nunca sirve aquí ni
-- al revés (los mensajes de error también son distintos).

create extension if not exists pgcrypto;

create table if not exists admin_account (
  id            smallint primary key default 1 check (id = 1),
  password_hash text not null,
  must_change   boolean not null default true,
  recovery_hash text,
  failed_count  int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists admin_sessions (
  token_hash text primary key,
  expires_at timestamptz not null
);

alter table admin_account  enable row level security;
alter table admin_sessions enable row level security;
revoke all on admin_account  from anon, authenticated;
revoke all on admin_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Piezas internas (no se exponen por la API)
-- ---------------------------------------------------------------------------

-- Valida el token de administradora y lo renueva. Mientras la contraseña sea
-- temporal (must_change), solo se permite cambiarla.
create or replace function _admin_session(p_token text, p_allow_pending boolean default false)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows int;
begin
  if p_token is null or p_token = '' then
    raise exception 'SESION_ADMIN_INVALIDA';
  end if;

  update admin_sessions
     set expires_at = now() + interval '8 hours'
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and expires_at > now();
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'SESION_ADMIN_INVALIDA';
  end if;

  if not p_allow_pending
     and (select must_change from admin_account where id = 1) then
    raise exception 'DEBE_CAMBIAR_CLAVE';
  end if;
end;
$$;

-- Suma un intento fallido a la cuenta y bloquea al llegar a 5. Devuelve void:
-- quien la llama debe RETORNAR (no lanzar excepción) para que se conserve.
create or replace function _admin_register_failure()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update admin_account
     set failed_count = case
           when locked_until is not null and locked_until <= now() then 1
           else failed_count + 1
         end,
         locked_until = case
           when locked_until is not null and locked_until <= now() then null
           else locked_until
         end
   where id = 1;

  update admin_account
     set locked_until = now() + interval '15 minutes', failed_count = 0
   where id = 1 and failed_count >= 5;
end;
$$;

create or replace function _admin_assert_not_locked()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from admin_account
              where id = 1 and locked_until is not null and locked_until > now()) then
    raise exception 'ADMIN_BLOQUEADO';
  end if;
end;
$$;

-- Genera un código de recuperación legible de 20 caracteres (80 bits).
create or replace function _admin_new_recovery_code()
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select upper(encode(gen_random_bytes(10), 'hex'));
$$;

revoke execute on function _admin_session(text, boolean)   from public, anon, authenticated;
revoke execute on function _admin_register_failure()       from public, anon, authenticated;
revoke execute on function _admin_assert_not_locked()      from public, anon, authenticated;
revoke execute on function _admin_new_recovery_code()      from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- API pública (anon)
-- ---------------------------------------------------------------------------

-- Entrar. Devuelve {token, must_change}, o null si la contraseña es
-- incorrecta (o si aún no hay cuenta configurada).
create or replace function admin_login(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acc     admin_account%rowtype;
  v_token text;
begin
  select * into acc from admin_account where id = 1;
  if not found then
    return null;
  end if;

  perform _admin_assert_not_locked();

  if p_password is null or acc.password_hash <> crypt(p_password, acc.password_hash) then
    perform _admin_register_failure();
    return null;
  end if;

  update admin_account set failed_count = 0, locked_until = null where id = 1;
  delete from admin_sessions where expires_at <= now();

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into admin_sessions (token_hash, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '8 hours');

  return jsonb_build_object('token', v_token, 'must_change', acc.must_change);
end;
$$;

-- Comprueba que la sesión es válida y que la contraseña ya no es temporal.
create or replace function admin_ping(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _admin_session(p_token);
  return true;
end;
$$;

create or replace function admin_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from admin_sessions
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
end;
$$;

-- Cambiar la contraseña. Devuelve {ok, recovery_code}: ok=false si la contraseña
-- actual no coincide (cuenta como intento fallido); recovery_code solo viene
-- la primera vez (contraseña temporal) o si no había código.
create or replace function admin_change_password(p_token text, p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acc    admin_account%rowtype;
  v_code text;
begin
  perform _admin_session(p_token, true);
  perform _admin_assert_not_locked();

  select * into acc from admin_account where id = 1;

  if p_current is null or acc.password_hash <> crypt(p_current, acc.password_hash) then
    perform _admin_register_failure();
    return jsonb_build_object('ok', false, 'recovery_code', null);
  end if;

  if p_new is null or char_length(p_new) not between 10 and 128 then
    raise exception 'Contraseña inválida: mínimo 10 caracteres';
  end if;
  if p_new = p_current then
    raise exception 'La nueva contraseña debe ser distinta de la actual';
  end if;

  if acc.must_change or acc.recovery_hash is null then
    v_code := _admin_new_recovery_code();
  end if;

  update admin_account
     set password_hash = crypt(p_new, gen_salt('bf')),
         must_change   = false,
         recovery_hash = coalesce(case when v_code is not null then crypt(v_code, gen_salt('bf')) end, recovery_hash),
         failed_count  = 0,
         locked_until  = null,
         updated_at    = now()
   where id = 1;

  -- Cierra las demás sesiones abiertas; conserva la actual.
  delete from admin_sessions
   where token_hash <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  return jsonb_build_object('ok', true, 'recovery_code', v_code);
end;
$$;

-- "Olvidé mi contraseña": restablece con el código de recuperación. El código
-- es de un solo uso: al usarlo se genera uno nuevo y se devuelve.
create or replace function admin_recover_password(p_code text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acc    admin_account%rowtype;
  v_code text;
begin
  select * into acc from admin_account where id = 1;
  if not found then
    return jsonb_build_object('ok', false, 'recovery_code', null);
  end if;

  perform _admin_assert_not_locked();

  if p_code is null or acc.recovery_hash is null
     or acc.recovery_hash <> crypt(upper(btrim(p_code)), acc.recovery_hash) then
    perform _admin_register_failure();
    return jsonb_build_object('ok', false, 'recovery_code', null);
  end if;

  if p_new is null or char_length(p_new) not between 10 and 128 then
    raise exception 'Contraseña inválida: mínimo 10 caracteres';
  end if;

  v_code := _admin_new_recovery_code();

  update admin_account
     set password_hash = crypt(p_new, gen_salt('bf')),
         must_change   = false,
         recovery_hash = crypt(v_code, gen_salt('bf')),
         failed_count  = 0,
         locked_until  = null,
         updated_at    = now()
   where id = 1;

  -- (Supabase rechaza un DELETE sin WHERE: de ahí el "where true".)
  delete from admin_sessions where true;

  return jsonb_build_object('ok', true, 'recovery_code', v_code);
end;
$$;

grant execute on function admin_login(text)                        to anon;
grant execute on function admin_ping(text)                         to anon;
grant execute on function admin_logout(text)                       to anon;
grant execute on function admin_change_password(text, text, text)  to anon;
grant execute on function admin_recover_password(text, text)       to anon;
