-- Plan 006: la comunidad cambia su propio PIN. Correr en el SQL Editor ANTES de desplegar la app
-- (la pantalla nueva llama a esta función). Es aditivo: la app actual sigue funcionando.
--
-- Qué exige: la sesión de la comunidad (token) y su PIN ACTUAL. Un PIN actual equivocado cuenta como
-- intento fallido, igual que en el login (5 fallos bloquean la comunidad 15 minutos): una sesión
-- abierta no sirve para adivinar el PIN. Al cambiarlo se cierran las demás sesiones de la comunidad.
-- El PIN nuevo no puede ser igual al actual ni demasiado obvio (0000, 7777, 1234, 4321...).
--
-- Devuelve true si lo cambió y false si el PIN actual no era el correcto.
-- pin_changed_at queda en null mientras la comunidad siga con el PIN que le asignó la administración
-- (para ver quién ya lo cambió: select name, pin_changed_at from communities order by name;).

alter table communities add column if not exists pin_changed_at timestamptz;

-- Un PIN es «débil» si son 4 dígitos iguales (0000) o una secuencia seguida hacia arriba o hacia abajo (1234, 4321).
-- Son 24 en total. Es interna: no se puede llamar desde internet.
create or replace function _pin_is_weak(p text)
returns boolean
language sql
immutable
as $$
  select p ~ '^([0-9])\1{3}$' or '0123456789' like '%' || p || '%' or '9876543210' like '%' || p || '%'
$$;

revoke execute on function _pin_is_weak(text) from public, anon, authenticated;

create or replace function change_community_pin(p_token text, p_current_pin text, p_new_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  if p_current_pin is null or p_current_pin !~ '^[0-9]{4}$'
     or p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN inválido';
  end if;
  if p_new_pin = p_current_pin then
    raise exception 'PIN_IGUAL';
  end if;
  if _pin_is_weak(p_new_pin) then
    raise exception 'PIN_DEBIL';
  end if;

  -- Lanza PIN_BLOQUEADO si la comunidad está bloqueada; si el PIN es incorrecto suma el intento y
  -- devuelve false (no se lanza excepción para que el intento fallido se conserve).
  if not verify_community_pin(v_community, p_current_pin) then
    return false;
  end if;

  update communities
     set pin_hash = crypt(p_new_pin, gen_salt('bf')),
         pin_changed_at = now()
   where name = v_community;

  delete from community_sessions
   where community = v_community
     and token_hash <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  return true;
end;
$$;

grant execute on function change_community_pin(text, text, text) to anon;
