-- Pruebas de supabase/dev_errors_2.sql y dev_errors_3.sql (plan 007, Fase B1: los problemas agrupados para /dev) contra un Postgres
-- local. Las llamadas se hacen como el rol `anon` con el token del desarrollador, igual que la pantalla.

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

-- Un reporte sembrado a mano, de hace `ago`, ya resuelto o no.
create function tst.log(c text, f text, src text, lvl text, cd text, msg text, ver text, ago interval, done boolean default false)
  returns void language sql security definer set search_path = public as $$
  insert into system_error_logs (community, source, level, fn, code, message, app_version, created_at, resolved_at)
  values (c, src, lvl, f, cd, msg, ver, now() - ago, case when done then now() end) $$;
create function tst.audit_rows() returns int language sql security definer set search_path = public as $$ select count(*)::int from dev_audit_log where action = 'resolver_grupo' $$;
create function tst.last_audit() returns jsonb language sql security definer set search_path = public as $$
  select detail from dev_audit_log where action = 'resolver_grupo' order by id desc limit 1 $$;
create function tst.wipe() returns void language sql security definer set search_path = public as $$
  delete from system_error_logs where community like 'ZZZ_TEST_dev%' $$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text), tst.log(text, text, text, text, text, text, text, interval, boolean),
  tst.audit_rows(), tst.last_audit(), tst.wipe() to anon;

-- Cuenta del desarrollador lista (contraseña definitiva) y tokens de otras cuentas. Se parte de cero para poder repetir la prueba.
delete from dev_account where true;
delete from dev_sessions where true;
delete from dev_audit_log where true;
insert into dev_account (id, password_hash, must_change) values (1, extensions.crypt('clave-de-prueba-larga', extensions.gen_salt('bf')), false);
insert into admin_account (id, password_hash, must_change) values (1, 'no-se-usa', false) on conflict (id) do update set must_change = false;
insert into admin_sessions (token_hash, expires_at) values (encode(sha256(convert_to('token-admin-dev2', 'UTF8')), 'hex'), now() + interval '1 hour') on conflict (token_hash) do update set expires_at = excluded.expires_at;
\i tests/db/provision_key.sql
-- Una limpieza previa por si quedó algo de otra corrida.
delete from system_error_logs where community like 'ZZZ_TEST_dev%';
set role anon;
do $$
begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_dev_com', '4321');
  perform set_config('tst.com', login_community('ZZZ_TEST_dev_com', '4321'), false);
  perform set_config('tst.d', dev_login('clave-de-prueba-larga') ->> 'token', false);
end $$;
reset role;

-- Siembra: A y B en Maná (mismo fn, distinto nivel/código), C en Fortaleza (mismo fn y nivel que A), D viejo (40 días), E y F resueltos
-- (F es un ERROR resuelto: el resumen no debe contarlo) y G (ERROR sin código en Maná: se distingue de A SOLO por el nivel).
select tst.log('ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null, 'TypeError: Failed to fetch', 'v1', interval '3 hours');
select tst.log('ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null, 'TypeError: Failed to fetch', 'v1', interval '2 hours');
select tst.log('ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null, 'sin red, el más reciente', 'v2', interval '1 hour');
select tst.log('ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'error', 'P0001', 'Datos incompletos', 'v2', interval '5 hours');
select tst.log('ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'error', 'P0001', 'Datos incompletos', 'v2', interval '4 hours');
select tst.log('ZZZ_TEST_dev_Fort', 'kardex_save_product', 'rpc', 'warning', null, 'TypeError: Failed to fetch', 'v2', interval '30 minutes');
select tst.log('ZZZ_TEST_dev_Mana', 'market_list_save', 'rpc', 'error', 'P0001', 'Cantidades inválidas', 'v0', interval '40 days');
select tst.log('ZZZ_TEST_dev_Fort', 'kardex_load_month', 'rpc', 'warning', null, 'ya resuelto', 'v1', interval '6 hours', true);
select tst.log('ZZZ_TEST_dev_Fort', 'kardex_load_month', 'rpc', 'warning', null, 'ya resuelto', 'v1', interval '5 hours', true);
select tst.log('ZZZ_TEST_dev_Mana', 'kardex_submit_week', 'rpc', 'error', 'P0001', 'ya resuelto', 'v1', interval '9 hours', true);
select tst.log('ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'error', null, 'error sin código', 'v2', interval '20 minutes');

set role anon;
do $$
declare
  t text := current_setting('tst.d');
  g record;
  n int;
  s jsonb;
begin
  -- Resumen: errores y advertencias SIN resolver (todo el tiempo, también el de hace 40 días), comunidades y último reporte.
  s := dev_error_summary(t);
  perform tst.ok((s ->> 'open_errors')::int = 4 and (s ->> 'open_warnings')::int = 4 and (s ->> 'communities')::int = 2,
                 'resumen: 4 errores y 4 advertencias abiertos en 2 comunidades; los resueltos no cuentan (salió ' || s::text || ')');
  perform tst.ok(s ->> 'last_report_at' is not null, 'resumen: trae la hora del último reporte');

  -- Grupos de 7 días solo abiertos: A (Maná, 3), B (Maná, 2), C (Fortaleza, 1) y G (Maná, 1). No E ni F (resueltos) ni D (40 días).
  select count(*) into n from dev_error_groups(t) where community like 'ZZZ_TEST_dev%';
  perform tst.ok(n = 4, 'cuatro grupos abiertos en 7 días (hay ' || n || ')');
  select * into g from dev_error_groups(t) where community = 'ZZZ_TEST_dev_Mana' and level = 'warning';
  perform tst.ok(g.total = 3 and g.open_count = 3 and g.fn = 'kardex_save_product' and g.code is null, 'A: tres reportes abiertos, sin código');
  perform tst.ok(g.last_message = 'sin red, el más reciente' and g.last_version = 'v2', 'A: el último mensaje y la última versión son los del reporte más nuevo');
  perform tst.ok(g.last_seen > g.first_seen, 'A: primera y última vez distintas');
  select * into g from dev_error_groups(t) where community = 'ZZZ_TEST_dev_Mana' and level = 'error' and code = 'P0001';
  perform tst.ok(g.total = 2, 'B: mismo fn y comunidad pero otro nivel y código es OTRA línea');
  select * into g from dev_error_groups(t) where community = 'ZZZ_TEST_dev_Mana' and level = 'error' and code is null;
  perform tst.ok(g.total = 1 and g.last_message = 'error sin código', 'G: igual que A pero de nivel «error»: otra línea');
  select * into g from dev_error_groups(t) where community = 'ZZZ_TEST_dev_Fort';
  perform tst.ok(g.total = 1 and g.fn = 'kardex_save_product', 'C: la misma falla en otra comunidad es otra línea');
  perform tst.ok((select array_agg(community || '/' || level || '/' || coalesce(code, '-')) from dev_error_groups(t) where community like 'ZZZ_TEST_dev%')
                 = array['ZZZ_TEST_dev_Mana/error/-', 'ZZZ_TEST_dev_Fort/warning/-', 'ZZZ_TEST_dev_Mana/warning/-', 'ZZZ_TEST_dev_Mana/error/P0001'], 'los más recientes primero (en el orden en que los devuelve la función)');

  -- «Todos» incluye el resuelto (abiertos 0); el periodo manda: 30 días no alcanza al de hace 40, 90 sí.
  select count(*) into n from dev_error_groups(t, 7, false) where community like 'ZZZ_TEST_dev%';
  perform tst.ok(n = 6, '«todos» en 7 días: los 4 abiertos y los 2 resueltos (hay ' || n || ')');
  select * into g from dev_error_groups(t, 7, false) where fn = 'kardex_load_month' and community = 'ZZZ_TEST_dev_Fort';
  perform tst.ok(g.total = 2 and g.open_count = 0, 'E: resuelto, con total 2 y abiertos 0');
  select count(*) into n from dev_error_groups(t, 30, false) where fn = 'market_list_save';
  perform tst.ok(n = 0, '30 días no llega al de hace 40');
  select count(*) into n from dev_error_groups(t, 90, true) where fn = 'market_list_save';
  perform tst.ok(n = 1, '90 días sí');
  perform tst.ok((select count(*) from dev_error_groups(t, 7, null) where community like 'ZZZ_TEST_dev%') = 4, 'p_only_open nulo cuenta como «solo abiertos»');

  -- Validación de rangos.
  perform tst.raises(format($q$select * from dev_error_groups(%L, 0)$q$, t), 'Rango inválido', 'días = 0');
  perform tst.raises(format($q$select * from dev_error_groups(%L, 91)$q$, t), 'Rango inválido', 'días = 91');
  perform tst.raises(format($q$select * from dev_error_groups(%L, null)$q$, t), 'Rango inválido', 'días nulo');
end $$;

-- Detalle: los reportes de UN grupo, el más nuevo primero, con tope y el estado de resuelto.
do $$
declare
  t text := current_setting('tst.d');
  n int;
  r record;
begin
  select count(*) into n from dev_error_group_detail(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null);
  perform tst.ok(n = 3, 'detalle de A: 3 reportes');
  select * into r from dev_error_group_detail(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', '') limit 1;
  perform tst.ok(r.message = 'sin red, el más reciente' and not r.resolved, 'el código vacío cuenta como «sin código» y el más nuevo va primero');
  select count(*) into n from dev_error_group_detail(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null, 2);
  perform tst.ok(n = 2, 'respeta el tope');
  select count(*) into n from dev_error_group_detail(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'error', 'P0001');
  perform tst.ok(n = 2, 'detalle de B por su código');
  select count(*) into n from dev_error_group_detail(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'error', null);
  perform tst.ok(n = 1, 'sin el código sale solo G, no se mezcla con B (que lleva P0001)');
  select count(*) into n from dev_error_group_detail(t, 'ZZZ_TEST_dev_Fort', 'kardex_load_month', 'rpc', 'warning', null);
  perform tst.ok(n = 2 and (select bool_and(resolved) from dev_error_group_detail(t, 'ZZZ_TEST_dev_Fort', 'kardex_load_month', 'rpc', 'warning', null)), 'los resueltos salen marcados');
  select count(*) into n from dev_error_group_detail(t, 'x'' or true --', 'x', 'rpc', 'error', null);
  perform tst.ok(n = 0, 'un texto con comillas es un dato, no SQL');
  perform tst.raises(format($q$select * from dev_error_group_detail(%L, 'a', 'b', 'rpc', 'error', null, 0)$q$, t), 'Rango inválido', 'tope 0');
  perform tst.raises(format($q$select * from dev_error_group_detail(%L, 'a', 'b', 'rpc', 'error', null, 101)$q$, t), 'Rango inválido', 'tope 101');
  perform tst.raises(format($q$select * from dev_error_group_detail(%L, 'a', 'b', 'rpc', 'error', null, null)$q$, t), 'Rango inválido', 'tope nulo');
end $$;

-- Resolver: cierra SOLO los abiertos de ese grupo, lo anota, no repite y el grupo reaparece si vuelve a fallar.
do $$
declare
  t text := current_setting('tst.d');
  n int;
  g record;
begin
  n := dev_resolve_group(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null);
  perform tst.ok(n = 3, 'resolver A cierra sus 3 reportes (cerró ' || n || ')');
  perform tst.ok(tst.audit_rows() = 1 and (tst.last_audit() ->> 'rows')::int = 3 and tst.last_audit() ->> 'community' = 'ZZZ_TEST_dev_Mana'
                 and tst.last_audit() ->> 'fn' = 'kardex_save_product' and tst.last_audit() ->> 'level' = 'warning', 'queda en la auditoría con el grupo y la cantidad');
  perform tst.ok((select count(*) from dev_error_groups(t) where community = 'ZZZ_TEST_dev_Mana' and level = 'warning') = 0, 'A ya no aparece entre los abiertos');
  perform tst.ok((select count(*) from dev_error_groups(t) where community like 'ZZZ_TEST_dev%') = 3, 'B, C y G siguen abiertos (no se tocan otros grupos)');
  perform tst.ok((select open_count from dev_error_groups(t) where community = 'ZZZ_TEST_dev_Mana' and level = 'error' and code is null) = 1, 'resolver A (advertencia) no cierra G (error sin código): solo cambia el nivel');
  select * into g from dev_error_groups(t, 7, false) where community = 'ZZZ_TEST_dev_Mana' and level = 'warning';
  perform tst.ok(g.total = 3 and g.open_count = 0, 'en «todos» A sigue con su historial y cero abiertos');

  perform tst.ok(dev_resolve_group(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null) = 0, 'resolverlo otra vez no cierra nada');
  perform tst.ok(tst.audit_rows() = 1, 'y no deja otra anotación');
  perform tst.ok(dev_resolve_group(t, 'ZZZ_TEST_dev_Nada', 'nada', 'rpc', 'error', null) = 0, 'un grupo que no existe cierra cero');
  perform tst.ok(dev_resolve_group(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'error', 'P0001') = 2, 'B se resuelve por su código');
  perform tst.ok((select count(*) from dev_error_group_detail(t, 'ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null) where resolved) = 3, 'los cerrados salen resueltos en el detalle');
end $$;
reset role;

-- Si vuelve a fallar, llega un reporte nuevo y el grupo reaparece solo (con el historial).
select tst.log('ZZZ_TEST_dev_Mana', 'kardex_save_product', 'rpc', 'warning', null, 'otra vez', 'v3', interval '1 minute');
set role anon;
do $$
declare
  t text := current_setting('tst.d');
  g record;
begin
  select * into g from dev_error_groups(t) where community = 'ZZZ_TEST_dev_Mana' and level = 'warning';
  perform tst.ok(g.total = 4 and g.open_count = 1 and g.last_message = 'otra vez' and g.last_version = 'v3', 'tras resolverlo, un reporte nuevo lo reabre: 1 abierto de 4');
end $$;

-- Sin el token del desarrollador nada responde: vacío, nulo, falso, de comunidad, de la nutricionista.
do $$
declare
  tok text;
  q text;
begin
  foreach tok in array array['', 'token-falso', 'token-admin-dev2', current_setting('tst.com')] loop
    foreach q in array array[
      'select dev_error_summary(%L)', 'select * from dev_error_groups(%L)',
      $f$select * from dev_error_group_detail(%L, 'a', 'b', 'rpc', 'error', null)$f$,
      $f$select dev_resolve_group(%L, 'a', 'b', 'rpc', 'error', null)$f$
    ] loop
      perform tst.raises(format(q, tok), 'SESION_DEV_INVALIDA', 'sin token del desarrollador: ' || q || ' con «' || left(tok, 10) || '»');
    end loop;
  end loop;
  perform tst.raises($q$select dev_error_summary(null)$q$, 'SESION_DEV_INVALIDA', 'token nulo en el resumen');
  perform tst.raises($q$select * from dev_error_groups(null)$q$, 'SESION_DEV_INVALIDA', 'token nulo en los grupos');
end $$;
reset role;

-- Con la contraseña TEMPORAL (must_change) solo se puede cambiarla: tampoco se leen los problemas.
update dev_account set must_change = true where id = 1;
set role anon;
do $$
begin
  perform tst.raises(format($q$select dev_error_summary(%L)$q$, current_setting('tst.d')), 'DEV_DEBE_CAMBIAR_CLAVE', 'resumen con la clave temporal');
  perform tst.raises(format($q$select * from dev_error_groups(%L)$q$, current_setting('tst.d')), 'DEV_DEBE_CAMBIAR_CLAVE', 'grupos con la clave temporal');
  perform tst.raises(format($q$select dev_resolve_group(%L, 'a', 'b', 'rpc', 'error', null)$q$, current_setting('tst.d')), 'DEV_DEBE_CAMBIAR_CLAVE', 'resolver con la clave temporal');
end $$;
reset role;

select tst.wipe();
delete from dev_account where true;
delete from dev_sessions where true;
delete from dev_audit_log where true;
\echo dev_errors_2: OK
