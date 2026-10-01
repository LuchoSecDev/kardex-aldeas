-- Pruebas de supabase/change_pin.sql (plan 006: la comunidad cambia su propio PIN) contra un Postgres local.
-- Las llamadas se hacen como el rol `anon`, igual que la app con la anon key.

\set ON_ERROR_STOP on
\set QUIET on

drop schema if exists tst cascade;
create schema tst;
grant usage on schema tst to anon;

create function tst.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function tst.raises(stmt text, expected text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm like '%' || expected || '%' then return; end if;
    raise exception 'FALLÓ: % (esperaba "%", salió "%")', msg, expected, sqlerrm;
  end;
  raise exception 'FALLÓ: % (no falló)', msg;
end $$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text) to anon;

\i tests/db/provision_key.sql
set role anon;
do $$ begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_pin_A', '4321');
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_pin_B', '4321');
  perform set_config('tst.a1', login_community('ZZZ_TEST_pin_A', '4321'), false);
  perform set_config('tst.a2', login_community('ZZZ_TEST_pin_A', '4321'), false);
  perform set_config('tst.b', login_community('ZZZ_TEST_pin_B', '4321'), false);
end $$;

-- ===========================================================================
-- Cambio correcto
-- ===========================================================================
do $$
declare
  a1 text := current_setting('tst.a1');
  a2 text := current_setting('tst.a2');
begin
  perform tst.ok(change_community_pin(a1, '4321', '8520') is true, 'con el PIN actual correcto lo cambia');
  perform tst.ok(login_community('ZZZ_TEST_pin_A', '8520') is not null, 'entra con el PIN nuevo');
  perform tst.ok(login_community('ZZZ_TEST_pin_A', '4321') is null, 'el PIN anterior ya no sirve');
  perform tst.ok(login_community('ZZZ_TEST_pin_B', '4321') is not null, 'el PIN de OTRA comunidad no cambió');

  -- La sesión que hizo el cambio sigue viva; las demás de esa comunidad se cierran.
  perform tst.ok((select count(*) from kardex_months_with_data(a1)) >= 0, 'la sesión que cambió el PIN sigue válida');
  perform tst.raises(format('select * from kardex_months_with_data(%L)', a2), 'SESION_INVALIDA', 'las otras sesiones de la comunidad se cierran');
  perform tst.ok((select count(*) from kardex_months_with_data(current_setting('tst.b'))) >= 0, 'las sesiones de otra comunidad no se tocan');
end $$;
reset role;

do $$ begin
  perform tst.ok((select pin_changed_at is not null from communities where name = 'ZZZ_TEST_pin_A'), 'queda registrada la fecha del cambio');
  perform tst.ok((select pin_changed_at is null from communities where name = 'ZZZ_TEST_pin_B'), 'las que no lo cambiaron siguen en null');
  perform tst.ok((select pin_hash ~ '^\$2[aby]\$' from communities where name = 'ZZZ_TEST_pin_A'), 'el PIN nuevo se guarda como hash bcrypt');
end $$;

-- ===========================================================================
-- Rechazos
-- ===========================================================================
set role anon;
do $$
declare
  t text := login_community('ZZZ_TEST_pin_A', '8520');
  q text := 'select change_community_pin(%L, %L, %L)';
begin
  perform tst.raises(format(q, 'token-falso', '8520', '1357'), 'SESION_INVALIDA', 'token falso');
  perform tst.raises(format(q, null, '8520', '1357'), 'SESION_INVALIDA', 'sin token');
  perform tst.raises(format(q, t, '85', '1357'), 'PIN inválido', 'PIN actual de menos de 4 dígitos');
  perform tst.raises(format(q, t, '8520', '13a7'), 'PIN inválido', 'PIN nuevo con letras');
  perform tst.raises(format(q, t, '8520', '13579'), 'PIN inválido', 'PIN nuevo de 5 dígitos');
  perform tst.raises(format(q, t, '8520', null), 'PIN inválido', 'PIN nuevo nulo');
  perform tst.raises(format(q, t, '8520', '8520'), 'PIN_IGUAL', 'PIN nuevo igual al actual');
  perform tst.raises(format(q, t, '8520', '0000'), 'PIN_DEBIL', 'cuatro dígitos iguales');
  perform tst.raises(format(q, t, '8520', '1234'), 'PIN_DEBIL', 'secuencia ascendente');
  perform tst.raises(format(q, t, '8520', '4321'), 'PIN_DEBIL', 'secuencia descendente');
  perform tst.ok(change_community_pin(t, '1111', '2580') is false, 'PIN actual equivocado devuelve false');
  perform tst.ok(login_community('ZZZ_TEST_pin_A', '8520') is not null, 'tras un intento fallido el PIN real no cambió');
end $$;

reset role;

-- Exactamente 24 PIN son «débiles»: 10 de dígitos iguales + 7 ascendentes + 7 descendentes.
do $$ begin
  perform tst.ok((select count(*) from generate_series(0, 9999) i where _pin_is_weak(lpad(i::text, 4, '0'))) = 24, 'hay exactamente 24 PIN débiles');
  perform tst.ok(_pin_is_weak('0000') and _pin_is_weak('7777') and _pin_is_weak('1234') and _pin_is_weak('0123') and _pin_is_weak('6789')
                 and _pin_is_weak('4321') and _pin_is_weak('9876') and _pin_is_weak('3210'), 'los obvios son débiles');
  perform tst.ok(not (_pin_is_weak('1357') or _pin_is_weak('8520') or _pin_is_weak('2580') or _pin_is_weak('1235') or _pin_is_weak('1122')
                      or _pin_is_weak('1212') or _pin_is_weak('7890') or _pin_is_weak('0001')), 'los demás no lo son');
end $$;

set role anon;
do $$ begin
  perform tst.raises($q$select _pin_is_weak('0000')$q$, 'permission denied', 'la función interna no se llama desde internet');
end $$;
reset role;

-- ===========================================================================
-- Un PIN actual equivocado cuenta para el bloqueo (5 fallos = 15 minutos), también al cambiar
-- ===========================================================================
set role anon;
do $$
declare
  t text := login_community('ZZZ_TEST_pin_A', '8520');
begin
  for i in 1..5 loop
    perform tst.ok(change_community_pin(t, '1111', '2580') is false, 'fallo ' || i || ' devuelve false');
  end loop;
  perform tst.raises(format('select change_community_pin(%L, %L, %L)', t, '8520', '2580'), 'PIN_BLOQUEADO', 'tras 5 fallos queda bloqueada, incluso con el PIN correcto');
  perform tst.raises(format('select login_community(%L, %L)', 'ZZZ_TEST_pin_A', '8520'), 'PIN_BLOQUEADO', 'y el login también');
end $$;
reset role;

-- ===========================================================================
-- Permisos
-- ===========================================================================
set role anon;
do $$ begin
  perform tst.raises($q$select pin_changed_at from communities$q$, 'permission denied', 'anon no lee pin_changed_at (solo name, created_at y has_pin)');
  perform tst.raises($q$update communities set pin_hash = null$q$, 'permission denied', 'anon no actualiza communities directo');
end $$;
reset role;

delete from communities where name like 'ZZZ_TEST_pin_%';
drop schema tst cascade;
\echo change_pin: OK
