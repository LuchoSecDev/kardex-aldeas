-- Pruebas de supabase/kardex_version_1.sql (plan 012): control de versión al guardar un producto.
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

create function tst.arr(n int, sets jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_agg(coalesce(sets -> i::text, '0'::jsonb) order by i) from generate_series(1, n) i
$$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text), tst.arr(int, jsonb) to anon;

\i tests/db/provision_key.sql
set role anon;
do $$ begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_ver_A', '4321');
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_ver_B', '4321');
  perform set_config('tst.a', login_community('ZZZ_TEST_ver_A', '4321'), false);
  perform set_config('tst.b', login_community('ZZZ_TEST_ver_B', '4321'), false);
end $$;

-- ===========================================================================
-- Una sola función (si hubiera dos con el mismo nombre PostgREST no sabría cuál llamar) y con permisos
-- ===========================================================================
do $$
begin
  perform tst.ok((select count(*) from pg_proc where proname = 'kardex_save_product') = 1, 'hay UNA sola kardex_save_product (sin sobrecargas ambiguas)');
  perform tst.ok(has_function_privilege('anon', 'kardex_save_product(text,int,int,text,jsonb,jsonb,jsonb,boolean,timestamptz)', 'execute'), 'anon la puede ejecutar');
end $$;

-- ===========================================================================
-- Con versión: fila nueva, guardado correcto, conflicto
-- ===========================================================================
do $$
declare
  v_a text := current_setting('tst.a');
  v1 timestamptz; v2 timestamptz; v3 timestamptz;
  loaded timestamptz;
begin
  -- Fila nueva: se espera «ninguna fila» (null) y devuelve la versión.
  v1 := kardex_save_product(v_a, 2026, 9, 'p1', tst.arr(35, '{"1": 2}'), tst.arr(5), tst.arr(5), true, null);
  perform tst.ok(v1 is not null, 'guardar una fila nueva devuelve su versión');
  select r.updated_at into loaded from kardex_load_month(v_a, 2026, 9) r where r.product_id = 'p1';
  perform tst.ok(loaded = v1, 'la versión devuelta es la updated_at guardada (la misma que lee la carga del mes)');

  -- Guardado correcto con la versión vigente: devuelve otra, mayor.
  v2 := kardex_save_product(v_a, 2026, 9, 'p1', tst.arr(35, '{"1": 3}'), tst.arr(5), tst.arr(5), true, v1);
  perform tst.ok(v2 > v1, 'guardar con la versión vigente da una versión nueva y mayor (aun dentro de la misma transacción)');

  -- Versión vieja: conflicto, y NO cambia nada.
  perform tst.raises(format('select kardex_save_product(%L, 2026, 9, ''p1'', %L, %L, %L, true, %L)', v_a, tst.arr(35, '{"1": 99}'), tst.arr(5), tst.arr(5), v1),
                     'CONFLICTO_VERSION', 'una versión vieja se rechaza');
  perform tst.ok((select (r.exits ->> 0)::numeric = 3 from kardex_load_month(v_a, 2026, 9) r where r.product_id = 'p1'), 'el conflicto no pisó el dato (sigue el 3)');
  perform tst.ok((select r.updated_at = v2 from kardex_load_month(v_a, 2026, 9) r where r.product_id = 'p1'), 'ni cambió la versión');

  -- «No había fila» pero ya existe (alguien la creó): conflicto.
  perform tst.raises(format('select kardex_save_product(%L, 2026, 9, ''p1'', %L, %L, %L, true, null)', v_a, tst.arr(35), tst.arr(5), tst.arr(5)),
                     'CONFLICTO_VERSION', 'esperar «ninguna fila» cuando ya existe se rechaza');

  -- Se esperaba una fila que no existe (alguien la borró): conflicto, y no se crea.
  perform tst.raises(format('select kardex_save_product(%L, 2026, 9, ''p2'', %L, %L, %L, true, %L)', v_a, tst.arr(35), tst.arr(5), tst.arr(5), v1),
                     'CONFLICTO_VERSION', 'esperar una fila que no existe se rechaza');
  perform tst.ok(not exists (select 1 from kardex_load_month(v_a, 2026, 9) r where r.product_id = 'p2'), 'y no se creó la fila');

  -- El guardado siguiente con la versión devuelta sigue funcionando (varios seguidos).
  v3 := kardex_save_product(v_a, 2026, 9, 'p1', tst.arr(35, '{"1": 4}'), tst.arr(5), tst.arr(5), true, v2);
  perform tst.ok(v3 > v2, 'varios guardados seguidos con la versión que devolvió el anterior');
end $$;

-- ===========================================================================
-- Formato de 6 semanas, validaciones intactas, aislamiento y cliente anterior
-- ===========================================================================
do $$
declare
  v_a text := current_setting('tst.a');
  v_b text := current_setting('tst.b');
  v1 timestamptz; vb timestamptz; legacy timestamptz;
begin
  v1 := kardex_save_product(v_a, 2026, 2, 'p1', tst.arr(42, '{"36": 1}'), tst.arr(6), tst.arr(6), true, null);
  perform tst.ok((select jsonb_array_length(r.exits) = 42 from kardex_load_month(v_a, 2026, 2) r where r.product_id = 'p1'), 'el formato 42/6/6 también se guarda con versión');
  perform kardex_save_product(v_a, 2026, 2, 'p1', tst.arr(42, '{"36": 2}'), tst.arr(6), tst.arr(6), true, v1);

  -- Las validaciones siguen aplicando con versión (y se revisan antes que la versión).
  perform tst.raises(format('select kardex_save_product(%L, 2026, 8, ''p1'', %L, %L, %L, true, null)', v_a, tst.arr(30), tst.arr(5), tst.arr(5)), 'Datos incompletos', 'tamaño inválido con versión');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 8, ''p1'', %L, %L, %L, true, null)', v_a, tst.arr(35, '{"1": -1}'), tst.arr(5), tst.arr(5)), 'Valores inválidos', 'negativos con versión');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 8, ''zzz'', %L, %L, %L, true, null)', v_a, tst.arr(35), tst.arr(5), tst.arr(5)), 'Producto inválido', 'producto inexistente con versión');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 8, ''p1'', %L, %L, %L, true, null)', 'token-falso', tst.arr(35), tst.arr(5), tst.arr(5)), 'SESION_INVALIDA', 'token falso con versión');

  -- Cada comunidad tiene su propia fila y su propia versión.
  vb := kardex_save_product(v_b, 2026, 9, 'p1', tst.arr(35), tst.arr(5), tst.arr(5), true, null);
  perform tst.ok(vb is not null, 'la comunidad B puede crear su fila del mismo producto y mes sin choque con la de A');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 9, ''p1'', %L, %L, %L, true, %L)', v_b, tst.arr(35), tst.arr(5), tst.arr(5), (select r.updated_at from kardex_load_month(v_a, 2026, 9) r where r.product_id = 'p1')),
                     'CONFLICTO_VERSION', 'la versión de A no vale para la fila de B');

  -- Cliente anterior (7 argumentos, sin versión): sigue guardando como antes y devuelve la versión.
  legacy := kardex_save_product(v_a, 2026, 9, 'p1', tst.arr(35, '{"1": 7}'), tst.arr(5), tst.arr(5));
  perform tst.ok(legacy is not null, 'sin versión (cliente viejo) guarda y devuelve la versión');
  perform tst.ok((select (r.exits ->> 0)::numeric = 7 from kardex_load_month(v_a, 2026, 9) r where r.product_id = 'p1'), 'y pisa como antes (comportamiento anterior conservado)');
  -- Pero la versión de antes ya no sirve: el guardado del cliente viejo la cambió.
  perform tst.raises(format('select kardex_save_product(%L, 2026, 9, ''p1'', %L, %L, %L, true, %L)', v_a, tst.arr(35), tst.arr(5), tst.arr(5), v1),
                     'CONFLICTO_VERSION', 'un guardado sin versión también cambia la versión (los nuevos lo notan)');
  -- Con el cliente viejo, p_check_version en falso ignora la versión esperada que se le pase.
  perform kardex_save_product(v_a, 2026, 9, 'p1', tst.arr(35, '{"1": 8}'), tst.arr(5), tst.arr(5), false, v1);
  perform tst.ok((select (r.exits ->> 0)::numeric = 8 from kardex_load_month(v_a, 2026, 9) r where r.product_id = 'p1'), 'p_check_version en falso no compara');
end $$;

reset role;
delete from kardex_records where community like 'ZZZ\_TEST\_ver\_%';
delete from communities where name like 'ZZZ\_TEST\_ver\_%';
drop schema tst cascade;
\echo 'kardex_version: OK'
