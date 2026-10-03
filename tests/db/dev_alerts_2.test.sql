-- Pruebas de supabase/dev_alerts_2.sql (plan 007, Fase A2: el trigger que llama a la Edge Function con pg_net) contra un Postgres
-- local. Aquí NO existen la Vault ni pg_net de Supabase: se simulan con `vault.decrypted_secrets` y `net.http_post` falsos
-- que anotan lo que se les pide. Lo que no se puede probar aquí (que pg_net acepte esos parámetros con nombre) se comprueba en
-- Supabase con la autoprueba del plan 007.

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

-- 1) Sin Vault (el esquema ni existe): guardar un reporte NO falla, aunque no pueda avisar.
insert into system_error_logs (community, source, level, fn, message, app_version)
  values ('ZZZ_TEST_alerta', 'rpc', 'error', 'f', 'sin vault', 'v1');
do $$
begin
  perform tst.ok((select count(*) from system_error_logs where community = 'ZZZ_TEST_alerta') = 1, 'sin Vault el reporte se guarda igual');
end $$;

-- Vault y pg_net falsos.
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
create schema net;
create table tst.calls (id serial primary key, url text, headers jsonb, body jsonb, timeout_ms int);
create table tst.flags (fail boolean not null default false);
insert into tst.flags values (false);
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $$
begin
  if (select fail from tst.flags) then raise exception 'pg_net caído'; end if;
  insert into tst.calls (url, headers, body, timeout_ms) values (url, headers, body, timeout_milliseconds);
  return 1;
end $$;

create function tst.n() returns int language sql as $$ select count(*)::int from tst.calls $$;
create function tst.reset() returns void language sql as $$ truncate tst.calls restart identity; $$;
create function tst.row_() returns void language sql as $$
  insert into system_error_logs (community, source, level, fn, code, message, app_version)
  values ('ZZZ_TEST_alerta', 'rpc', 'error', 'kardex_save_product', 'P0001', 'Datos incompletos', 'abc1234') $$;

-- 2) Sin configurar (falta la URL o la clave, o vienen vacías): el reporte se guarda y no se llama a nadie.
do $$
begin
  perform tst.row_();
  insert into vault.decrypted_secrets values ('alert_function_url', 'https://x.supabase.co/functions/v1/dev-alert');
  perform tst.row_();   -- solo URL
  delete from vault.decrypted_secrets;
  insert into vault.decrypted_secrets values ('alert_webhook_secret', 's3creto');
  perform tst.row_();   -- solo clave
  delete from vault.decrypted_secrets;
  insert into vault.decrypted_secrets values ('alert_function_url', ''), ('alert_webhook_secret', 's3creto');
  perform tst.row_();   -- URL vacía
  delete from vault.decrypted_secrets;
  insert into vault.decrypted_secrets values ('alert_function_url', 'https://x.supabase.co/functions/v1/dev-alert'), ('alert_webhook_secret', '');
  perform tst.row_();   -- clave vacía
  perform tst.ok(tst.n() = 0, 'sin URL o sin clave no se llama a la función (hubo ' || tst.n() || ')');
  delete from vault.decrypted_secrets;
end $$;

-- 3) Configurado: una llamada por reporte, con el formato del webhook de Supabase.
do $$
declare c record;
begin
  perform tst.reset();
  insert into vault.decrypted_secrets values
    ('alert_function_url', 'https://x.supabase.co/functions/v1/dev-alert'), ('alert_webhook_secret', 's3creto');
  perform tst.row_();
  perform tst.ok(tst.n() = 1, 'un reporte, una llamada');
  select * into c from tst.calls;
  perform tst.ok(c.url = 'https://x.supabase.co/functions/v1/dev-alert', 'llama a la URL de la Vault');
  perform tst.ok(c.headers ->> 'x-alert-secret' = 's3creto' and c.headers ->> 'Content-Type' = 'application/json', 'manda la clave compartida');
  perform tst.ok(not (c.headers ? 'apikey') and not (c.headers ? 'Authorization'), 'sin claves opcionales no manda apikey ni Authorization');
  perform tst.ok(c.timeout_ms = 5000, 'espera hasta 5 s');
  perform tst.ok(c.body ->> 'type' = 'INSERT' and c.body ->> 'table' = 'system_error_logs' and c.body ->> 'schema' = 'public'
                 and c.body -> 'old_record' = 'null'::jsonb, 'mismo formato que el webhook de Supabase');
  perform tst.ok(c.body -> 'record' ->> 'community' = 'ZZZ_TEST_alerta' and c.body -> 'record' ->> 'level' = 'error'
                 and c.body -> 'record' ->> 'fn' = 'kardex_save_product' and c.body -> 'record' ->> 'message' = 'Datos incompletos'
                 and c.body -> 'record' ->> 'app_version' = 'abc1234' and c.body -> 'record' ->> 'code' = 'P0001', 'el registro viaja completo');

  -- Claves opcionales: la anon va en Authorization (verificación de JWT) y la publicable en apikey; vacías o ausentes, no se mandan.
  perform tst.reset();
  insert into vault.decrypted_secrets values ('alert_anon_key', 'eyJ-anon');
  perform tst.row_();
  perform tst.ok((select headers ->> 'Authorization' from tst.calls) = 'Bearer eyJ-anon', 'con clave anon manda Authorization: Bearer');
  perform tst.ok(not (select headers ? 'apikey' from tst.calls), 'y sin clave publicable no manda apikey');
  insert into vault.decrypted_secrets values ('alert_api_key', 'sb_publishable_prueba');
  perform tst.reset();
  perform tst.row_();
  perform tst.ok((select headers ->> 'apikey' from tst.calls) = 'sb_publishable_prueba' and (select headers ->> 'Authorization' from tst.calls) = 'Bearer eyJ-anon', 'con las dos manda las dos cabeceras');
  update vault.decrypted_secrets set decrypted_secret = '' where name in ('alert_anon_key', 'alert_api_key');
  perform tst.reset();
  perform tst.row_();
  perform tst.ok(not (select headers ? 'apikey' or headers ? 'Authorization' from tst.calls), 'claves vacías: no manda ni apikey ni Authorization');

  -- Una llamada por fila; actualizar o borrar no avisa.
  perform tst.reset();
  perform tst.row_(); perform tst.row_(); perform tst.row_();
  perform tst.ok(tst.n() = 3, 'una llamada por cada fila nueva');
  update system_error_logs set resolved_at = now() where community = 'ZZZ_TEST_alerta';
  delete from system_error_logs where community = 'ZZZ_TEST_alerta' and message = 'sin vault';
  perform tst.ok(tst.n() = 3, 'actualizar o borrar no llama a la función');
end $$;

-- 4) Un fallo de pg_net no impide guardar el reporte.
do $$
declare antes int;
begin
  select count(*) into antes from system_error_logs where community = 'ZZZ_TEST_alerta';
  update tst.flags set fail = true;
  perform tst.row_();
  update tst.flags set fail = false;
  perform tst.ok((select count(*) from system_error_logs where community = 'ZZZ_TEST_alerta') = antes + 1, 'si pg_net falla, el reporte se guarda igual');
end $$;

-- 5) Camino real: la comunidad (anon) reporta con su token y el trigger avisa, aunque anon no pueda ni leer la Vault.
\i tests/db/provision_key.sql
select tst.reset();
set role anon;
do $$
begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_alerta_B', '4321');
  perform set_config('tst.b', login_community('ZZZ_TEST_alerta_B', '4321'), false);
  perform tst.raises('select * from vault.decrypted_secrets', 'permission denied', 'anon no lee la Vault');
  perform tst.raises('select dev_alert_notify()', 'permission denied', 'anon no llama a la función del trigger');
  perform dev_report_client_error(current_setting('tst.b'), 'rpc', 'error', 'kardex_save_product', 'P0001', 'desde anon', 'abc1234');
end $$;
reset role;
do $$
begin
  perform tst.ok(tst.n() = 1, 'un reporte real de la comunidad dispara una llamada (hubo ' || tst.n() || ')');
  perform tst.ok((select body -> 'record' ->> 'community' from tst.calls) = 'ZZZ_TEST_alerta_B', 'la comunidad del aviso sale del token');
end $$;

-- 6) Reejecutar el script deja un solo trigger.
\i supabase/dev_alerts_2.sql
do $$
begin
  perform tst.ok((select count(*) from pg_trigger where tgname = 'dev_alert_notify_trg' and not tgisinternal) = 1, 'queda un solo trigger');
end $$;

-- Limpieza: sin Vault ni pg_net falsos, el trigger sigue sin romper los demás scripts de prueba.
delete from system_error_logs where community like 'ZZZ_TEST_alerta%';
drop schema vault cascade;
drop schema net cascade;
\echo dev_alerts_2: OK
