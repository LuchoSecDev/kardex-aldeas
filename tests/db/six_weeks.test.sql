-- Pruebas de supabase/six_weeks_1..5.sql (plan 004, semana 6 de cierre) contra un Postgres local.
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

-- Arreglo de n ceros en JSON, con posiciones (1-based) en `sets` = '{"36":1.5}'.
create function tst.arr(n int, sets jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_agg(coalesce(sets -> i::text, '0'::jsonb) order by i) from generate_series(1, n) i
$$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text), tst.arr(int, jsonb) to anon;

insert into admin_account (id, password_hash, must_change) values (1, 'no-se-usa', false)
  on conflict (id) do update set must_change = false;
insert into admin_sessions (token_hash, expires_at)
  values (encode(sha256(convert_to('token-admin-6sem', 'UTF8')), 'hex'), now() + interval '1 hour');

\i tests/db/provision_key.sql
set role anon;
do $$ begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_6s_A', '4321');
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_6s_B', '4321');
  perform set_config('tst.a', login_community('ZZZ_TEST_6s_A', '4321'), false);
  perform set_config('tst.b', login_community('ZZZ_TEST_6s_B', '4321'), false);
  perform set_config('tst.adm', 'token-admin-6sem', false);
end $$;

-- ===========================================================================
-- Guardar: acepta 35/5/5 (anterior) y 42/6/6 (con semana 6); rechaza mezclas
-- ===========================================================================
do $$
declare
  v_a text := current_setting('tst.a');
  v jsonb;
begin
  -- Formato anterior (5 semanas): sigue aceptado (clientes y filas viejas).
  perform kardex_save_product(v_a, 2026, 7, 'p1', tst.arr(35), tst.arr(5), tst.arr(5));
  v := (select to_jsonb(r) from kardex_load_month(v_a, 2026, 7) r where r.product_id = 'p1');
  perform tst.ok(jsonb_array_length(v -> 'exits') = 35, 'la fila de 5 semanas se guarda y se lee tal cual (35)');

  -- Formato nuevo (6 semanas).
  perform kardex_save_product(v_a, 2026, 2, 'p1',
    tst.arr(42, '{"36": 1, "37": 0.5}'), tst.arr(6, '{"6": 3}'), tst.arr(6, '{"1": 0, "6": 10}'));
  v := (select to_jsonb(r) from kardex_load_month(v_a, 2026, 2) r where r.product_id = 'p1');
  perform tst.ok(jsonb_array_length(v -> 'exits') = 42 and jsonb_array_length(v -> 'entries') = 6 and jsonb_array_length(v -> 'prev_balances') = 6, 'la fila de 6 semanas se guarda completa (42/6/6)');
  perform tst.ok((v -> 'exits' ->> 35)::numeric = 1 and (v -> 'exits' ->> 36)::numeric = 0.5, 'el 30 y el 31 de marzo quedan en las posiciones 35 y 36');
  perform tst.ok((v -> 'entries' ->> 5)::numeric = 3, 'la entrada de la semana 6');

  -- Mezclas y tamaños inválidos.
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', tst.arr(36), tst.arr(5), tst.arr(5)),  'Datos incompletos', '36 salidas');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', tst.arr(35), tst.arr(6), tst.arr(6)),  'Datos incompletos', '35 salidas con 6 entradas');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', tst.arr(42), tst.arr(5), tst.arr(6)),  'Datos incompletos', '42/5/6');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', tst.arr(42), tst.arr(6), tst.arr(5)),  'Datos incompletos', '42/6/5');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', tst.arr(43), tst.arr(6), tst.arr(6)),  'Datos incompletos', '43 salidas');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', '"hola"'::jsonb, tst.arr(6), tst.arr(6)), 'Datos incompletos', 'no es un arreglo');
  -- Los valores se siguen validando en las posiciones nuevas.
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', tst.arr(42, '{"40": -1}'), tst.arr(6), tst.arr(6)), 'Valores inválidos', 'salida negativa en la semana 6');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', tst.arr(42), tst.arr(6, '{"6": -2}'), tst.arr(6)), 'Valores inválidos', 'entrada negativa en la semana 6');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'p1', tst.arr(42), tst.arr(6), tst.arr(6, '{"6": "x"}')), 'Valores inválidos', 'saldo no numérico');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', 'token-falso', 'p1', tst.arr(42), tst.arr(6), tst.arr(6)), 'SESION_INVALIDA', 'sin sesión');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 2, %L, %L, %L, %L)', v_a, 'no-existe', tst.arr(42), tst.arr(6), tst.arr(6)), 'Producto inválido', 'producto inexistente');
  -- Una fila guardada con 35 se puede reemplazar por una de 42 (el mes pasa a tener la semana 6).
  perform kardex_save_product(v_a, 2026, 7, 'p1', tst.arr(42, '{"36": 2}'), tst.arr(6), tst.arr(6));
  v := (select to_jsonb(r) from kardex_load_month(v_a, 2026, 7) r where r.product_id = 'p1');
  perform tst.ok(jsonb_array_length(v -> 'exits') = 42, 'una fila de 35 se reemplaza por una de 42');
end $$;

-- ===========================================================================
-- Ajustes auditados: la semana 6 (índice 5) sí; la 7 no
-- ===========================================================================
do $$
declare v_a text := current_setting('tst.a');
begin
  perform kardex_insert_ajuste(v_a, 'p1', 2026, 2, 5, 10, 8, 'conteo de cierre');
  perform tst.ok((select count(*) from kardex_load_ajustes(v_a, 2026, 2) where week_index = 5) = 1, 'el ajuste de la semana 6 se guarda');
  perform tst.raises(format('select kardex_insert_ajuste(%L, %L, 2026, 2, 6, 1, 1, %L)', v_a, 'p1', 'x'), 'Fecha inválida', 'semana 7 (índice 6)');
  perform tst.raises(format('select kardex_insert_ajuste(%L, %L, 2026, 2, -1, 1, 1, %L)', v_a, 'p1', 'x'), 'Fecha inválida', 'semana negativa');
  perform tst.raises(format('select kardex_insert_ajuste(%L, %L, 2026, 2, 5, 1, 1, %L)', v_a, 'p1', '   '), 'Motivo inválido', 'el motivo sigue siendo obligatorio');
end $$;

reset role;
do $$ begin
  perform tst.raises($q$insert into ajustes (community, product_id, year, month, week_index, saldo_anterior, saldo_nuevo, motivo) values ('ZZZ_TEST_6s_A', 'p1', 2026, 2, 6, 1, 1, 'x')$q$, 'violates check constraint', 'la tabla de ajustes también rechaza la semana 7');
  perform tst.raises($q$insert into week_submissions (community, year, month, week_index, snapshot) values ('ZZZ_TEST_6s_A', 2026, 2, 6, '{}')$q$, 'violates check constraint', 'la tabla de envíos también rechaza la semana 7');
  perform tst.ok((select count(*) from pg_constraint where contype = 'c' and conrelid in ('ajustes'::regclass, 'week_submissions'::regclass) and pg_get_constraintdef(oid) ilike '%week_index%') = 2, 'queda un solo CHECK de week_index por tabla');
end $$;
set role anon;

-- ===========================================================================
-- Enviar la semana 6
-- ===========================================================================
do $$
declare
  v_a text := current_setting('tst.a');
  v_b text := current_setting('tst.b');
  r jsonb;
begin
  -- B: marzo sin nada en la semana 6 (solo la semana 1) => la semana 6 está vacía.
  perform kardex_save_product(v_b, 2026, 2, 'p1', tst.arr(42, '{"2": 1}'), tst.arr(6, '{"1": 5}'), tst.arr(6));
  perform tst.raises(format('select kardex_submit_week(%L, 2026, 2, 5)', v_b), 'SEMANA_VACIA', 'una semana 6 sin movimientos no se envía');
  perform tst.raises(format('select kardex_submit_week(%L, 2026, 2, 6)', v_b), 'Fecha inválida', 'semana 7');

  -- A: marzo con salidas el 30 y 31 => se puede enviar.
  r := kardex_submit_week(v_a, 2026, 2, 5);
  perform tst.ok((r ->> 'submit_count')::int = 1, 'la semana 6 de A se envía');
  perform tst.ok((select not modified and week_index = 5 from kardex_week_submissions(v_a, 2026, 2)), 'y aparece como enviada, sin modificar');

  -- Cambiar OTRA semana no la marca; cambiar la semana 6 sí.
  perform kardex_save_product(v_a, 2026, 2, 'p1', tst.arr(42, '{"36": 1, "37": 0.5, "2": 4}'), tst.arr(6, '{"6": 3}'), tst.arr(6, '{"6": 10}'));
  perform tst.ok((select not modified from kardex_week_submissions(v_a, 2026, 2) where week_index = 5), 'editar la semana 1 no marca modificada la 6');
  perform kardex_save_product(v_a, 2026, 2, 'p1', tst.arr(42, '{"36": 2, "37": 0.5}'), tst.arr(6, '{"6": 3}'), tst.arr(6, '{"6": 10}'));
  perform tst.ok((select modified from kardex_week_submissions(v_a, 2026, 2) where week_index = 5), 'editar el 30 de marzo sí la marca modificada');
  r := kardex_submit_week(v_a, 2026, 2, 5);
  perform tst.ok((r ->> 'submit_count')::int = 2, 'reenviar sube el contador');
  perform tst.ok((select not modified from kardex_week_submissions(v_a, 2026, 2) where week_index = 5), 'y limpia la marca');
end $$;

-- ===========================================================================
-- Nutricionista: resumen de comunidades y resumen semanal con la semana 6
-- ===========================================================================
do $$
declare
  v_adm text := current_setting('tst.adm');
  ra boolean[]; rb boolean[];
begin
  select o.weeks_active into ra from admin_communities_overview(v_adm, 2026, 2) o where o.name = 'ZZZ_TEST_6s_A';
  select o.weeks_active into rb from admin_communities_overview(v_adm, 2026, 2) o where o.name = 'ZZZ_TEST_6s_B';
  perform tst.ok(array_length(ra, 1) = 6, 'el resumen trae 6 banderas de semana');
  perform tst.ok(ra = array[false, false, false, false, false, true], 'A: solo la semana 6 (el 30 y 31 de marzo) tiene movimiento');
  perform tst.ok(rb = array[true, false, false, false, false, false], 'B: solo la semana 1; la 6 sin movimiento');

  -- Semana 6 (índice 5) de marzo: saldo anterior = prev_balances[5] (10), entradas = 3, salidas = 2 + 0.5
  perform tst.ok((select t.prev_balance = 10 and t.entries = 3 and t.exits = 2.5 from admin_weekly_totals(v_adm, 2026, 2, 5, true) t where t.community = 'ZZZ_TEST_6s_A' and t.product_id = 'p1'), 'el resumen semanal de la semana 6 suma bien');
  perform tst.ok(not exists (select 1 from admin_weekly_totals(v_adm, 2026, 2, 5, true) t where t.community = 'ZZZ_TEST_6s_B'), 'con solo-enviadas, B (no envió la 6) no aparece');
  perform tst.ok(not exists (select 1 from admin_weekly_totals(v_adm, 2026, 2, 5, false) t where t.community = 'ZZZ_TEST_6s_B'), 'y sin filtro tampoco: no tiene movimiento en la semana 6');
  perform tst.raises(format('select * from admin_weekly_totals(%L, 2026, 2, 6, true)', v_adm), 'Fecha inválida', 'semana 7 en el resumen semanal');
  perform tst.ok(not exists (select 1 from admin_weekly_totals(v_adm, 2026, 7, 5, false) t where t.community = 'ZZZ_TEST_6s_B'), 'una fila anterior sin datos de semana 6 no rompe nada');
  -- La fila de agosto de A se reemplazó por una de 42 con salida en la posición 36 (31 de agosto)
  perform tst.ok((select t.exits = 2 from admin_weekly_totals(v_adm, 2026, 7, 5, false) t where t.community = 'ZZZ_TEST_6s_A'), 'agosto: el 31 de agosto aparece en la semana 6');
end $$;

reset role;
delete from communities where name like 'ZZZ\_TEST\_6s\_%';
delete from admin_sessions where token_hash = encode(sha256(convert_to('token-admin-6sem', 'UTF8')), 'hex');
delete from admin_account where id = 1;
drop schema tst cascade;
\echo 'six_weeks: OK'
