-- Pruebas de supabase/dev_errors_1.sql (plan 007, Fase A: registro de errores del navegador) contra un Postgres local.
-- Las llamadas se hacen como el rol `anon`, igual que la app; los ayudantes `tst.*` que leen o preparan la tabla cerrada son
-- `security definer` (solo existen en esta prueba).

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

-- Ayudantes sobre la tabla cerrada.
create function tst.n(c text) returns int language sql security definer set search_path = public as $$
  select count(*)::int from system_error_logs where community = c $$;
create function tst.last(c text) returns jsonb language sql security definer set search_path = public as $$
  select to_jsonb(l) from system_error_logs l where community = c order by id desc limit 1 $$;
create function tst.wipe(c text) returns void language sql security definer set search_path = public as $$
  delete from system_error_logs where community = c $$;
create function tst.old(c text, ago interval, k int) returns void language sql security definer set search_path = public as $$
  insert into system_error_logs (community, source, level, fn, message, app_version, created_at)
  select c, 'rpc', 'error', 'f', 'viejo', 'v1', now() - ago from generate_series(1, k) $$;
create function tst.setseq(n bigint) returns void language sql security definer set search_path = public as $$
  select setval(pg_get_serial_sequence('system_error_logs', 'id'), n) $$;
-- Un reporte con valores por defecto; cada prueba cambia solo lo que le interesa.
create function tst.report(tok text, src text default 'rpc', lvl text default 'error', f text default 'kardex_save_product',
                           cd text default 'P0001', msg text default 'algo falló', ver text default 'abc1234') returns void
  language sql as $$ select dev_report_client_error(tok, src, lvl, f, cd, msg, ver) $$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text), tst.n(text), tst.last(text), tst.wipe(text),
  tst.old(text, interval, int), tst.setseq(bigint), tst.report(text, text, text, text, text, text, text) to anon;

\i tests/db/provision_key.sql
set role anon;
do $$
begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_err_A', '4321');
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_err_B', '4321');
  perform set_config('tst.a', login_community('ZZZ_TEST_err_A', '4321'), false);
  perform set_config('tst.b', login_community('ZZZ_TEST_err_B', '4321'), false);
end $$;

-- Permisos: la tabla y la limpieza no se tocan desde la app.
do $$
begin
  perform tst.raises('select * from system_error_logs', 'permission denied', 'anon no lee la tabla de errores');
  perform tst.raises($q$insert into system_error_logs (community, source, level, fn, message, app_version) values ('x', 'rpc', 'error', 'f', 'm', 'v')$q$,
    'permission denied', 'anon no escribe directo en la tabla');
  perform tst.raises($q$delete from system_error_logs where true$q$, 'permission denied', 'anon no borra directo');
end $$;

-- Un reporte normal: se guarda con todo lo que mandó y la comunidad sale del token.
do $$
declare r jsonb;
begin
  perform tst.report(current_setting('tst.a'), 'rpc', 'error', 'kardex_save_product', 'P0001', 'Datos incompletos', 'abc1234');
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 1, 'un reporte, una fila');
  r := tst.last('ZZZ_TEST_err_A');
  perform tst.ok(r ->> 'source' = 'rpc' and r ->> 'level' = 'error' and r ->> 'fn' = 'kardex_save_product'
                 and r ->> 'code' = 'P0001' and r ->> 'message' = 'Datos incompletos' and r ->> 'app_version' = 'abc1234'
                 and r ->> 'resolved_at' is null, 'la fila trae lo reportado y sin resolver');

  -- Con el token de B queda a nombre de B: no hay forma de reportar «como» otra comunidad.
  perform tst.report(current_setting('tst.b'), 'window', 'warning', 'window.onerror', null, 'Script error', 'abc1234');
  perform tst.ok(tst.n('ZZZ_TEST_err_B') = 1 and tst.n('ZZZ_TEST_err_A') = 1, 'la comunidad sale del token');
  perform tst.ok(tst.last('ZZZ_TEST_err_B') ->> 'code' is null, 'el código puede faltar');
end $$;

-- Token inválido: se rechaza con SESION_INVALIDA y no se guarda nada.
do $$
declare tok text;
begin
  foreach tok in array array['', 'token-falso', null] loop
    perform tst.raises(format($q$select tst.report(%L)$q$, tok), 'SESION_INVALIDA', 'token malo: ' || coalesce(tok, 'null'));
  end loop;
  perform tst.raises($q$select dev_report_client_error(null, 'rpc', 'error', 'f', null, 'm', 'v')$q$, 'SESION_INVALIDA', 'token nulo');
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 1, 'nada nuevo guardado');
end $$;

-- Lo que el navegador manda como constantes se valida estricto.
do $$
declare a text := current_setting('tst.a');
begin
  perform tst.raises(format($q$select tst.report(%L, src => 'otro')$q$, a), 'Reporte inválido', 'source desconocido');
  perform tst.raises(format($q$select tst.report(%L, src => null)$q$, a), 'Reporte inválido', 'source nulo');
  perform tst.raises(format($q$select tst.report(%L, lvl => 'critical')$q$, a), 'Reporte inválido', 'level desconocido (critical lo pone el sistema, no el navegador)');
  perform tst.raises(format($q$select tst.report(%L, lvl => null)$q$, a), 'Reporte inválido', 'level nulo');
  perform tst.raises(format($q$select tst.report(%L, f => 'a b')$q$, a), 'Reporte inválido', 'fn con espacio');
  perform tst.raises(format($q$select tst.report(%L, f => '')$q$, a), 'Reporte inválido', 'fn vacío');
  perform tst.raises(format($q$select tst.report(%L, f => %L)$q$, a, repeat('x', 61)), 'Reporte inválido', 'fn de 61 caracteres');
  perform tst.raises(format($q$select tst.report(%L, f => null)$q$, a), 'Reporte inválido', 'fn nulo');
  perform tst.report(a, f => repeat('x', 60));
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 2, 'fn de 60 caracteres sí; las inválidas no guardaron nada');
  perform tst.wipe('ZZZ_TEST_err_A');
end $$;

-- El texto libre se limpia (no se rechaza): espacios, largo, tokens y vacíos.
do $$
declare a text := current_setting('tst.a');
begin
  perform tst.report(a, msg => E'  hola \n  mundo\t ');
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'hola mundo', 'espacios y saltos de línea colapsados');

  perform tst.report(a, msg => repeat('ab ', 200));
  perform tst.ok(char_length(tst.last('ZZZ_TEST_err_A') ->> 'message') <= 300, 'mensaje cortado a 300');

  -- Tapado de tokens: tira de 24 o más con 4 o más dígitos (los tokens de sesión son 64 hex).
  perform tst.report(a, msg => 'falló con a1b2c3d4e5f6a1b2c3d4e5f6 en x');          -- 24 con dígitos: parece token
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'falló con [oculto] en x', 'una tira de 24 con dígitos se tapa');
  perform tst.report(a, msg => 'falló con a1b2c3d4e5f6a1b2c3d4e5f en x');           -- 23: no
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'falló con a1b2c3d4e5f6a1b2c3d4e5f en x', 'una de 23 no se toca');
  perform tst.report(a, msg => 'falló con abcdefghijklmnopqrstu123 en x');         -- 24 con solo 3 dígitos: no
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'falló con abcdefghijklmnopqrstu123 en x', 'con 3 dígitos no se toca');
  perform tst.report(a, msg => 'falló con abcdefghijklmnopqrst1234 en x');         -- 24 con 4 dígitos: sí
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'falló con [oculto] en x', 'con 4 dígitos se tapa');
  perform tst.report(a, msg => 'token A1b2+C3d4/E5f6=G7h8-I9j0_K1l2M3n4 fin');
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'token [oculto] fin', 'también con + / = - _');
  perform tst.report(a, msg => 'sesion ' || encode(sha256('x'::bytea), 'hex') || ' fin');   -- 64 hex, como un token real
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'sesion [oculto] fin', 'un token de 64 hex se tapa');
  -- Lo que SÍ hay que ver para diagnosticar se conserva: nombres de función y rutas largos (sin dígitos o con un «v1» suelto).
  perform tst.report(a, msg => 'Could not find the function public.market_replies_mark_seen(p_token)');
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'Could not find the function public.market_replies_mark_seen(p_token)', 'un nombre de función largo no se tapa');
  perform tst.report(a, msg => 'POST co/rest/v1/rpc/market_list_save_changes falló');
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'POST co/rest/v1/rpc/market_list_save_changes falló', 'una ruta larga con un «v1» no se tapa');

  perform tst.report(a, msg => '   ');
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'sin mensaje', 'mensaje en blanco');
  perform tst.report(a, msg => null);
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'message' = 'sin mensaje', 'mensaje nulo');

  perform tst.report(a, cd => 'a b');
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'code' is null, 'código inválido se descarta');
  perform tst.report(a, cd => 'PGRST202');
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'code' = 'PGRST202', 'código válido se guarda');
  perform tst.report(a, ver => 'a b!');
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'app_version' = 'desconocida', 'versión inválida');
  perform tst.report(a, ver => null);
  perform tst.ok(tst.last('ZZZ_TEST_err_A') ->> 'app_version' = 'desconocida', 'versión nula');
  perform tst.wipe('ZZZ_TEST_err_A');
end $$;

-- Tope por minuto: 20 por comunidad; lo demás se ignora sin error y las otras comunidades no se afectan.
do $$
declare a text := current_setting('tst.a'); i int;
begin
  perform tst.wipe('ZZZ_TEST_err_B');
  for i in 1..25 loop perform tst.report(a, msg => 'error ' || i); end loop;
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 20, 'A se queda en 20 por minuto (hay ' || tst.n('ZZZ_TEST_err_A') || ')');
  perform tst.report(current_setting('tst.b'));
  perform tst.ok(tst.n('ZZZ_TEST_err_B') = 1, 'B no se ve afectada por el tope de A');
  perform tst.wipe('ZZZ_TEST_err_A');
  -- La ventana es de un minuto: 20 reportes de hace 90 segundos ya no cuentan para el tope por minuto.
  perform tst.old('ZZZ_TEST_err_A', interval '90 seconds', 20);
  perform tst.report(current_setting('tst.a'));
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 21, 'lo de hace 90 segundos no cuenta para el tope por minuto');
  perform tst.wipe('ZZZ_TEST_err_A');
end $$;

-- Tope por día: 300 por comunidad (los de hace dos horas ya cuentan, los de hace dos días no).
do $$
declare a text := current_setting('tst.a');
begin
  perform tst.old('ZZZ_TEST_err_A', interval '2 hours', 299);
  perform tst.report(a);
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 300, 'con 299 en el día, el 300 todavía entra');
  perform tst.report(a);
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 300, 'con 300 en el día, el siguiente se ignora');
  perform tst.wipe('ZZZ_TEST_err_A');
  perform tst.old('ZZZ_TEST_err_A', interval '2 days', 300);
  perform tst.report(a);
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 301, 'lo de hace dos días no cuenta para el tope diario');
  perform tst.wipe('ZZZ_TEST_err_A');
end $$;

-- Limpieza: cada 50 reportes se borran los de más de 30 días (sin tareas programadas).
do $$
declare a text := current_setting('tst.a');
begin
  perform tst.old('ZZZ_TEST_err_A', interval '40 days', 3);
  perform tst.old('ZZZ_TEST_err_A', interval '10 days', 2);
  perform tst.setseq(10);
  perform tst.report(a);                                   -- id 11: no es múltiplo de 50
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 6, 'sin limpieza si el id no es múltiplo de 50');
  perform tst.setseq(49);
  perform tst.report(a);                                   -- id 50: limpia
  perform tst.ok(tst.n('ZZZ_TEST_err_A') = 4, 'en el id 50 se borran los de 40 días y quedan los de 10 y los nuevos (hay ' || tst.n('ZZZ_TEST_err_A') || ')');
  perform tst.wipe('ZZZ_TEST_err_A');
  perform tst.wipe('ZZZ_TEST_err_B');
end $$;

reset role;
\echo dev_errors: OK
