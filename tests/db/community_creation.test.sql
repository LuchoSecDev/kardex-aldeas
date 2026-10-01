-- Pruebas de supabase/fixed_communities.sql y lock_down_community_creation_1..2.sql (plan 005):
-- las 8 comunidades fijas, creación solo con clave de aprovisionamiento y login sin PIN cerrado.
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

-- ===========================================================================
-- Las 8 comunidades fijas existen, todas con PIN, y repetir el script no cambia nada
-- ===========================================================================
do $$
declare
  v_nombres text[] := array['Casa Blanca','Esmeralda','Fortaleza','Leones','Maná','Primavera','Renacer','Shalom'];
begin
  perform tst.ok((select array_agg(name order by name) from communities where name = any(v_nombres)) = v_nombres,
                 'las 8 comunidades existen con esos nombres exactos');
  perform tst.ok((select count(*) from communities where name = any(v_nombres) and pin_hash is not null) = 8,
                 'las 8 tienen PIN (hash) puesto por el script');
  perform tst.ok((select count(*) from communities where name = any(v_nombres) and pin_hash !~ '^\$2[aby]\$') = 0,
                 'los PIN quedan como hash bcrypt, nunca en claro');
  perform set_config('tst.hash_mana', (select pin_hash from communities where name = 'Maná'), false);
  perform set_config('tst.n', (select count(*) from communities)::text, false);
end $$;

\i supabase/fixed_communities.sql

do $$ begin
  perform tst.ok((select pin_hash from communities where name = 'Maná') = current_setting('tst.hash_mana'),
                 'repetir fixed_communities.sql NO cambia el PIN de una comunidad que ya lo tiene');
  perform tst.ok((select count(*) from communities)::text = current_setting('tst.n'),
                 'repetir fixed_communities.sql no crea comunidades de más');
end $$;

-- Una comunidad fija a la que le quitaron el PIN lo recupera al repetir el script.
update communities set pin_hash = null where name = 'Leones';
\i supabase/fixed_communities.sql
do $$ begin
  perform tst.ok((select pin_hash is not null from communities where name = 'Leones'), 'el script le vuelve a poner PIN a una de las 8 que no lo tenga');
end $$;

-- ===========================================================================
-- Como anon: ya no se puede crear ni reclamar comunidades; la clave es obligatoria
-- ===========================================================================
delete from community_provision_key;
set role anon;
do $$ begin
  perform tst.raises($q$select create_community_with_pin('ZZZ_TEST_x', '1234')$q$, 'permission denied', 'create_community_with_pin ya no es llamable por anon');
  perform tst.raises($q$select claim_pin_for_existing_community('Maná', '1234')$q$, 'permission denied', 'claim_pin_for_existing_community ya no es llamable por anon');
  perform tst.raises($q$insert into communities (name) values ('ZZZ_TEST_directo')$q$, 'permission denied', 'anon no inserta en communities directo');
  perform tst.raises($q$select * from community_provision_key$q$, 'permission denied', 'anon no lee la clave de aprovisionamiento');
  perform tst.raises($q$select provision_community('cualquiera', 'ZZZ_TEST_sinclave', '1234')$q$, 'CLAVE_INVALIDA', 'sin clave definida en la base, nadie crea');
end $$;
reset role;

\i tests/db/provision_key.sql
set role anon;
do $$ begin
  perform tst.raises($q$select provision_community('clave-equivocada', 'ZZZ_TEST_cc_malclave', '1234')$q$, 'CLAVE_INVALIDA', 'clave equivocada');
  perform tst.raises($q$select provision_community(null, 'ZZZ_TEST_cc_nula', '1234')$q$, 'CLAVE_INVALIDA', 'clave nula');
  perform tst.raises($q$select provision_community('clave-de-prueba', 'ZZZ_TEST_cc_pin', '12a4')$q$, 'PIN inválido', 'PIN que no son 4 dígitos');
  perform tst.raises($q$select provision_community('clave-de-prueba', 'x', '1234')$q$, 'Nombre de comunidad inválido', 'nombre demasiado corto');
  perform tst.ok(provision_community('clave-de-prueba', '  ZZZ_TEST_cc_ok  ', '4321') is true, 'con la clave correcta crea la comunidad');
  perform tst.ok(provision_community('clave-de-prueba', 'ZZZ_TEST_cc_ok', '9999') is false, 'una que ya existe devuelve false');
  perform tst.ok(login_community('ZZZ_TEST_cc_ok', '4321') is not null, 'la comunidad creada entra con su PIN (con espacios recortados)');
  perform tst.ok(login_community('ZZZ_TEST_cc_ok', '9999') is null, 'y el PIN de la segunda llamada NO se aplicó');
end $$;
reset role;

-- ===========================================================================
-- Login: una comunidad sin PIN ya no entra (ni sin PIN ni con uno inventado)
-- ===========================================================================
insert into communities (name) values ('ZZZ_TEST_cc_sinpin');
update communities set pin_hash = extensions.crypt('4321', extensions.gen_salt('bf')) where name = 'Maná';
set role anon;
do $$ begin
  perform tst.ok(login_community('ZZZ_TEST_cc_sinpin', null) is null, 'sin PIN guardado y sin PIN: no entra');
  perform tst.ok(login_community('ZZZ_TEST_cc_sinpin', '1234') is null, 'sin PIN guardado y con un PIN cualquiera: no entra');
  perform tst.ok(login_community('Maná', null) is null, 'con PIN guardado, sin PIN: no entra');
  perform tst.ok(login_community('Maná', '4321') is not null, 'con el PIN correcto entra');
  perform tst.ok(login_community('No existe', '4321') is null, 'una comunidad inexistente devuelve null');
end $$;
reset role;

delete from communities where name like 'ZZZ_TEST_cc_%';
drop schema tst cascade;
\echo community_creation: OK
