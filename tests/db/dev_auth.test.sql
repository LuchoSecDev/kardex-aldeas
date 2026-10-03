-- Pruebas de supabase/dev_auth_1.sql, dev_auth_2.sql y dev_reset_password.sql (plan 007, Fase B1: la cuenta del desarrollador para
-- la pantalla /dev) contra un Postgres local. Las llamadas se hacen como el rol `anon`, igual que la app; los ayudantes `tst.*` que
-- leen o preparan las tablas cerradas son `security definer` (solo existen en esta prueba).

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

-- Ayudantes sobre las tablas cerradas.
create function tst.failed() returns int language sql security definer set search_path = public as $$ select failed_count from dev_account where id = 1 $$;
create function tst.locked() returns boolean language sql security definer set search_path = public as $$ select coalesce(locked_until > now(), false) from dev_account where id = 1 $$;
create function tst.must() returns boolean language sql security definer set search_path = public as $$ select must_change from dev_account where id = 1 $$;
create function tst.sessions() returns int language sql security definer set search_path = public as $$ select count(*)::int from dev_sessions $$;
create function tst.audit(a text) returns int language sql security definer set search_path = public as $$ select count(*)::int from dev_audit_log where action = a $$;
create function tst.set_lock(minutes int) returns void language sql security definer set search_path = public as $$
  update dev_account set locked_until = now() + make_interval(mins => minutes) where id = 1 $$;
create function tst.expire_sessions() returns void language sql security definer set search_path = public as $$
  update dev_sessions set expires_at = now() - interval '1 minute' where true $$;
create function tst.session_ttl_hours() returns numeric language sql security definer set search_path = public as $$
  select round(extract(epoch from (max(expires_at) - now())) / 3600.0, 1) from dev_sessions $$;
create function tst.lock_minutes() returns int language sql security definer set search_path = public as $$
  select round(extract(epoch from (locked_until - now())) / 60.0)::int from dev_account where id = 1 $$;
create function tst.shorten_sessions() returns void language sql security definer set search_path = public as $$
  update dev_sessions set expires_at = now() + interval '1 hour' where true $$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text), tst.failed(), tst.locked(), tst.must(), tst.sessions(),
  tst.audit(text), tst.set_lock(int), tst.expire_sessions(), tst.session_ttl_hours(), tst.shorten_sessions(), tst.lock_minutes() to anon;

-- Tokens de otras cuentas, para comprobar que NO sirven en /dev.
insert into admin_account (id, password_hash, must_change) values (1, 'no-se-usa', false) on conflict (id) do update set must_change = false;
insert into admin_sessions (token_hash, expires_at) values (encode(sha256(convert_to('token-admin-dev', 'UTF8')), 'hex'), now() + interval '1 hour') on conflict (token_hash) do update set expires_at = excluded.expires_at;
\i tests/db/provision_key.sql
set role anon;
do $$
begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_dev_auth', '4321');
  perform set_config('tst.com', login_community('ZZZ_TEST_dev_auth', '4321'), false);
end $$;
reset role;

-- 1) Sin cuenta: entrar devuelve null (igual que con una contraseña incorrecta: no se distingue).
delete from dev_account where true;
delete from dev_sessions where true;
delete from dev_audit_log where true;
set role anon;
do $$
begin
  perform tst.ok(dev_login('lo-que-sea') is null, 'sin cuenta, login devuelve null');
end $$;
reset role;

-- Cuenta con contraseña TEMPORAL.
insert into dev_account (id, password_hash, must_change) values (1, extensions.crypt('clave-temporal-1', extensions.gen_salt('bf')), true);

-- Una sola cuenta y las tres tablas con la seguridad por filas activa (además de cerradas con revoke).
do $$
begin
  perform tst.raises($q$insert into dev_account (id, password_hash) values (2, 'x')$q$, 'violates check constraint', 'no puede haber una segunda cuenta');
  perform tst.ok((select count(*) from pg_class where oid in ('dev_account'::regclass, 'dev_sessions'::regclass, 'dev_audit_log'::regclass) and relrowsecurity) = 3,
                 'las tres tablas tienen RLS activo');
end $$;

set role anon;
do $$
declare r jsonb;
begin
  -- 2) Contraseña incorrecta: null y cuenta un intento. Nula también.
  perform tst.ok(dev_login('incorrecta') is null, 'contraseña incorrecta devuelve null');
  perform tst.ok(tst.failed() = 1, 'cuenta un intento fallido');
  perform tst.ok(dev_login(null) is null and tst.failed() = 2, 'contraseña nula también cuenta');

  -- 3) Contraseña correcta: token y must_change; reinicia el contador.
  r := dev_login('clave-temporal-1');
  perform tst.ok(r ->> 'token' ~ '^[0-9a-f]{64}$' and (r ->> 'must_change')::boolean, 'entra con la temporal y debe cambiarla');
  perform tst.ok(tst.failed() = 0, 'un acierto reinicia el contador');
  perform set_config('tst.t1', r ->> 'token', false);
  perform set_config('tst.t2', dev_login('clave-temporal-1') ->> 'token', false);
  perform tst.ok(tst.sessions() = 2, 'cada entrada abre su sesión');

  -- 4) Con la contraseña temporal solo se puede cambiarla.
  perform tst.raises(format($q$select dev_ping(%L)$q$, current_setting('tst.t1')), 'DEV_DEBE_CAMBIAR_CLAVE', 'ping con la temporal');
  perform tst.raises(format($q$select dev_error_summary(%L)$q$, current_setting('tst.t1')), 'DEV_DEBE_CAMBIAR_CLAVE', 'lectura con la temporal');

  -- 5) Tokens de otras cuentas, falsos o vacíos NO sirven; y el del desarrollador no sirve en las otras cuentas.
  perform tst.raises($q$select dev_ping('token-admin-dev')$q$, 'SESION_DEV_INVALIDA', 'token de la nutricionista');
  perform tst.raises(format($q$select dev_ping(%L)$q$, current_setting('tst.com')), 'SESION_DEV_INVALIDA', 'token de comunidad');
  perform tst.raises($q$select dev_ping('token-falso')$q$, 'SESION_DEV_INVALIDA', 'token falso');
  perform tst.raises($q$select dev_ping('')$q$, 'SESION_DEV_INVALIDA', 'token vacío');
  perform tst.raises($q$select dev_ping(null)$q$, 'SESION_DEV_INVALIDA', 'token nulo');
  perform tst.raises(format($q$select admin_ping(%L)$q$, current_setting('tst.t1')), 'SESION_ADMIN_INVALIDA', 'el token de /dev no sirve como el de la nutricionista');
  perform tst.raises(format($q$select kardex_load_month(%L, 2026, 0)$q$, current_setting('tst.t1')), 'SESION_INVALIDA', 'ni como el de una comunidad');

  -- 6) Cambiar la contraseña: actual incorrecta, corta, igual a la actual.
  perform tst.ok(not (dev_change_password(current_setting('tst.t1'), 'otra-clave-x', 'clave-nueva-larga-1') ->> 'ok')::boolean, 'actual incorrecta: ok=false');
  perform tst.ok(tst.failed() = 1 and tst.must(), 'y cuenta como intento fallido; sigue temporal');
  perform tst.raises(format($q$select dev_change_password(%L, 'clave-temporal-1', 'corta')$q$, current_setting('tst.t1')), 'mínimo 12', 'nueva demasiado corta');
  perform tst.raises(format($q$select dev_change_password(%L, 'clave-temporal-1', 'abcdefghijk')$q$, current_setting('tst.t1')), 'mínimo 12', 'nueva de 11 caracteres');
  perform tst.raises(format($q$select dev_change_password(%L, 'clave-temporal-1', %L)$q$, current_setting('tst.t1'), repeat('x', 129)), 'mínimo 12', 'nueva demasiado larga');
  perform tst.raises(format($q$select dev_change_password(%L, 'clave-temporal-1', 'clave-temporal-1')$q$, current_setting('tst.t1')), 'distinta', 'nueva igual a la actual');
  perform tst.raises($q$select dev_change_password('token-admin-dev', 'a', 'clave-nueva-larga-1')$q$, 'SESION_DEV_INVALIDA', 'cambiar con un token ajeno');

  -- 7) Cambio correcto: ya no es temporal, cierra las demás sesiones, conserva la actual, anota la auditoría.
  perform tst.ok((dev_change_password(current_setting('tst.t1'), 'clave-temporal-1', 'clave-nueva-larga-1') ->> 'ok')::boolean, 'cambio correcto');
  perform tst.ok(not tst.must() and tst.failed() = 0, 'ya no es temporal y el contador queda en cero');
  perform tst.ok(dev_ping(current_setting('tst.t1')), 'la sesión actual se conserva');
  perform tst.raises(format($q$select dev_ping(%L)$q$, current_setting('tst.t2')), 'SESION_DEV_INVALIDA', 'las demás sesiones se cierran');
  perform tst.ok(tst.audit('cambio_clave') = 1, 'el cambio queda en la auditoría');
  perform tst.ok((dev_change_password(current_setting('tst.t1'), 'clave-nueva-larga-1', 'abcdefghijkl') ->> 'ok')::boolean, 'una clave de exactamente 12 caracteres se acepta');
  perform tst.ok((dev_change_password(current_setting('tst.t1'), 'abcdefghijkl', 'clave-nueva-larga-1') ->> 'ok')::boolean, 'y se puede volver a cambiar');
  perform tst.ok(tst.audit('cambio_clave') = 3, 'cada cambio queda en la auditoría');
  perform tst.ok(dev_login('clave-temporal-1') is null, 'la contraseña vieja ya no entra');
  perform tst.ok(not (dev_login('clave-nueva-larga-1') ->> 'must_change')::boolean, 'la nueva entra sin pedir cambio');
end $$;
reset role;

-- 8) Bloqueo: 5 fallos bloquean 15 minutos (incluso con la contraseña correcta); un acierto antes reinicia el contador.
set role anon;
do $$
begin
  perform dev_login('mal');
  perform dev_login('mal');
  perform dev_login('clave-nueva-larga-1');
  perform tst.ok(tst.failed() = 0, 'un acierto antes del quinto fallo reinicia la cuenta');
  perform dev_login('mal'); perform dev_login('mal'); perform dev_login('mal'); perform dev_login('mal');
  perform tst.ok(tst.failed() = 4 and not tst.locked(), 'cuatro fallos todavía no bloquean');
  perform dev_login('mal');
  perform tst.ok(tst.locked() and tst.failed() = 0, 'el quinto fallo bloquea y reinicia el contador');
  perform tst.ok(tst.lock_minutes() between 14 and 15, 'el bloqueo dura 15 minutos (' || tst.lock_minutes() || ')');
  perform tst.raises($q$select dev_login('clave-nueva-larga-1')$q$, 'DEV_BLOQUEADO', 'bloqueada aun con la contraseña correcta');
  perform tst.raises($q$select dev_login('mal')$q$, 'DEV_BLOQUEADO', 'y con la incorrecta');
  perform tst.raises(format($q$select dev_change_password(%L, 'clave-nueva-larga-1', 'otra-clave-larga-2')$q$, current_setting('tst.t1')), 'DEV_BLOQUEADO', 'cambiar la clave estando bloqueada');
end $$;
reset role;
select tst.set_lock(-1);   -- el bloqueo vence
set role anon;
do $$
begin
  perform tst.ok(dev_login('clave-nueva-larga-1') ->> 'token' is not null, 'vencido el bloqueo vuelve a entrar');
  perform tst.set_lock(-1);
  perform dev_login('mal');
  perform tst.ok(tst.failed() = 1 and not tst.locked(), 'tras un bloqueo vencido, el primer fallo cuenta uno (no cinco)');
end $$;
reset role;

-- 9) Sesión: vence a las 8 h deslizantes, se renueva al usarla y se cierra con dev_logout.
set role anon;
do $$
declare tok text;
begin
  tok := dev_login('clave-nueva-larga-1') ->> 'token';
  perform tst.shorten_sessions();
  perform dev_ping(tok);
  perform tst.ok(tst.session_ttl_hours() between 7.9 and 8.1, 'usar la sesión la renueva a 8 horas (' || tst.session_ttl_hours() || ')');
  perform tst.expire_sessions();
  perform tst.raises(format($q$select dev_ping(%L)$q$, tok), 'SESION_DEV_INVALIDA', 'sesión vencida');
  tok := dev_login('clave-nueva-larga-1') ->> 'token';
  perform dev_logout(tok);
  perform tst.raises(format($q$select dev_ping(%L)$q$, tok), 'SESION_DEV_INVALIDA', 'cerrar sesión invalida el token');
  perform dev_logout(null);
  perform dev_logout('token-que-no-existe');
end $$;
reset role;

-- 10) Tablas cerradas y piezas internas fuera de alcance para la app.
set role anon;
do $$
begin
  perform tst.raises('select * from dev_account', 'permission denied', 'anon no lee la cuenta');
  perform tst.raises('select * from dev_sessions', 'permission denied', 'anon no lee las sesiones');
  perform tst.raises('select * from dev_audit_log', 'permission denied', 'anon no lee la auditoría');
  perform tst.raises($q$update dev_account set must_change = false$q$, 'permission denied', 'anon no cambia la cuenta');
  perform tst.raises($q$insert into dev_audit_log (action) values ('x')$q$, 'permission denied', 'anon no escribe la auditoría');
  perform tst.raises($q$select _dev_session('x')$q$, 'permission denied', 'anon no llama a _dev_session');
  perform tst.raises($q$select _dev_register_failure()$q$, 'permission denied', 'ni a _dev_register_failure');
  perform tst.raises($q$select _dev_assert_not_locked()$q$, 'permission denied', 'ni a _dev_assert_not_locked');
end $$;
reset role;

-- 11) dev_reset_password.sql: deja la clave temporal, quita el bloqueo, cierra las sesiones y lo anota.
select tst.set_lock(10);
\i supabase/dev_reset_password.sql
set role anon;
do $$
declare r jsonb;
begin
  perform tst.ok(tst.must() and not tst.locked() and tst.failed() = 0, 'el reset deja la cuenta temporal y sin bloqueo');
  perform tst.ok(tst.sessions() = 0, 'el reset cierra todas las sesiones');
  perform tst.ok(tst.audit('reset_clave') = 1, 'el reset queda en la auditoría');
  perform tst.ok(dev_login('clave-nueva-larga-1') is null, 'la contraseña anterior ya no entra');
  r := dev_login('PON-AQUI-LA-CLAVE-TEMPORAL');
  perform tst.ok((r ->> 'must_change')::boolean, 'entra con la temporal de la plantilla y debe cambiarla');
end $$;
reset role;

delete from dev_account where true;
delete from dev_sessions where true;
delete from dev_audit_log where true;
\echo dev_auth: OK
