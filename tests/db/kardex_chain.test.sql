-- Pruebas de supabase/kardex_chain_1..6.sql (plan 013, fase 1): el servidor como autoridad de los saldos, la regla de meses cerrados,
-- el historial y la corrección de un producto en varios meses. Las llamadas se hacen como el rol `anon`, igual que la app.
-- OJO: se reemplaza _kardex_today() para simular fechas y se encienden los interruptores de kardex_settings; al final se restauran.

\set ON_ERROR_STOP on
\set QUIET on
\i tests/db/cascade_vectors.sql

-- Por si una corrida anterior quedó a medias: restaura la función real, apaga los interruptores y borra lo de esta prueba.
delete from kardex_settings;      -- se vuelven a sembrar con los valores de fábrica al correr el script 1
\i supabase/kardex_chain_1.sql
alter table kardex_corrections disable trigger kardex_corrections_no_update;
delete from kardex_corrections where community like 'ZZZ\_TEST\_ch\_%';
alter table kardex_corrections enable trigger kardex_corrections_no_update;
delete from kardex_records where community like 'ZZZ\_TEST\_ch\_%';
delete from ajustes where community like 'ZZZ\_TEST\_ch\_%';
delete from communities where name like 'ZZZ\_TEST\_ch\_%';
delete from admin_sessions where token_hash = encode(sha256(convert_to('token-admin-chain', 'UTF8')), 'hex');
delete from admin_account where id = 1;

-- La función REAL antes de reemplazarla: hoy en Bogotá, y los bordes del día (23:59 en Bogotá = 04:59 UTC del día siguiente).
do $$
begin
  if _kardex_today() <> _kardex_today_at(now()) then raise exception 'FALLÓ: _kardex_today() no es _kardex_today_at(now())'; end if;
  if _kardex_today_at(timestamptz '2026-10-06 04:59:00+00') <> date '2026-10-05' then raise exception 'FALLÓ: 23:59 en Bogotá sigue siendo el 5'; end if;
  if _kardex_today_at(timestamptz '2026-10-06 05:00:00+00') <> date '2026-10-06' then raise exception 'FALLÓ: 00:00 en Bogotá ya es el 6'; end if;
  if _kardex_today_at(timestamptz '2027-01-01 04:59:00+00') <> date '2026-12-31' then raise exception 'FALLÓ: cambio de año en Bogotá'; end if;
  if (select count(*) from kardex_settings where not enabled) <> 2 then raise exception 'FALLÓ: los dos interruptores nacen apagados'; end if;
end $$;

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

-- Ayudas que corren como dueño (las tablas están cerradas a anon): sembrar filas, leerlas y probar funciones internas.
create function tst.seed(c text, p text, y int, m int, ex jsonb, en jsonb, pv jsonb) returns void
language sql security definer set search_path = public as $$
  insert into kardex_records (community, year, month, product_id, exits, entries, prev_balances)
  values (c, y, m, p, ex, en, pv)
  on conflict (community, year, month, product_id) do update set exits = excluded.exits, entries = excluded.entries,
    prev_balances = excluded.prev_balances, updated_at = clock_timestamp()
$$;
create function tst.row(c text, p text, y int, m int) returns jsonb language sql security definer set search_path = public as $$
  select to_jsonb(r) from kardex_records r where r.community = c and r.product_id = p and r.year = y and r.month = m
$$;
create function tst.closed(c text, p text, y int, m int) returns boolean language sql security definer set search_path = public as $$
  select _kardex_month_closed(c, p, y, m)
$$;
create function tst.audits(c text) returns int language sql security definer set search_path = public as $$
  select count(*)::int from kardex_corrections where community = c
$$;
create function tst.audit(c text, n int) returns jsonb language sql security definer set search_path = public as $$
  select to_jsonb(a) from kardex_corrections a where a.community = c order by a.id offset n - 1 limit 1
$$;
create function tst.pid(i int) returns text language sql security definer set search_path = public as $$
  select id from products order by id offset i - 1 limit 1
$$;
create function tst.today(d text) returns text language sql as $$ select set_config('tst.today', d, false) $$;
create function tst.setting(k text, v boolean) returns void language sql security definer set search_path = public as $$
  update kardex_settings set enabled = v where key = k
$$;
create function tst.internal(stmt text) returns text language plpgsql security invoker as $$
begin execute stmt; return 'ejecutó'; exception when insufficient_privilege then return 'sin permiso'; end $$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text), tst.arr(int, jsonb),
  tst.seed(text, text, int, int, jsonb, jsonb, jsonb), tst.row(text, text, int, int), tst.closed(text, text, int, int),
  tst.audits(text), tst.audit(text, int), tst.pid(int), tst.today(text), tst.setting(text, boolean), tst.internal(text) to anon;

-- Fecha simulada, interruptores encendidos y sesión de la nutricionista (para el resumen semanal).
create or replace function _kardex_today() returns date language sql stable as $$ select current_setting('tst.today')::date $$;
select set_config('tst.today', '2026-10-20', false) \gset
update kardex_settings set enabled = true;
select set_config('tst.vectors', :'vectors', false) \gset
insert into admin_account (id, password_hash, must_change) values (1, 'no-se-usa', false) on conflict (id) do update set must_change = false;
insert into admin_sessions (token_hash, expires_at) values (encode(sha256(convert_to('token-admin-chain', 'UTF8')), 'hex'), now() + interval '1 hour');

\i tests/db/provision_key.sql
set role anon;
do $$ begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_ch_A', '4321');
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_ch_B', '4321');
  perform set_config('tst.a', login_community('ZZZ_TEST_ch_A', '4321'), false);
  perform set_config('tst.b', login_community('ZZZ_TEST_ch_B', '4321'), false);
end $$;
reset role;

-- ===========================================================================
-- 1. Paridad: la función del servidor da lo mismo que los vectores compartidos (los mismos que computeCascade en TypeScript)
-- ===========================================================================
do $$
declare
  v jsonb;
  n int := 0;
begin
  for v in select * from jsonb_array_elements(current_setting('tst.vectors')::jsonb) loop
    n := n + 1;
    perform tst.ok(_kardex_cascade((v ->> 'base')::numeric, v -> 'overrides', v -> 'entries', v -> 'exits') = v -> 'expected',
                   'paridad del encadenado: ' || (v ->> 'name'));
    perform tst.ok(round(_kardex_closing(v -> 'expected', v -> 'entries', v -> 'exits'), 4) = (v ->> 'closing')::numeric,
                   'paridad del cierre: ' || (v ->> 'name'));
  end loop;
  perform tst.ok(n >= 50, 'se probaron todos los vectores (' || n || ')');
  -- Redondeo a 4 decimales de los saldos calculados (Q6) y sin ceros de más en el JSON.
  perform tst.ok(_kardex_cascade(0, '{}', tst.arr(5, '{"1": 0.123456}'), tst.arr(35)) -> 1 = '0.1235'::jsonb, 'los saldos se redondean a 4 decimales');
  perform tst.ok(_kardex_cascade(7, '{}', tst.arr(5), tst.arr(35)) -> 0 = '7'::jsonb, 'sin ceros de más');
end $$;

-- ===========================================================================
-- 2. Base heredada (D14): el último cierre existente, aunque haya meses sin fila en medio; ajustes vigentes
-- ===========================================================================
do $$
declare
  c text := 'ZZZ_TEST_ch_A';
begin
  -- Septiembre 2026 (mes 8): entra 10, salen 3 el día 1; cierra en 7. Octubre sin fila. Noviembre (10) hereda 7.
  perform tst.seed(c, 'p1', 2026, 8, tst.arr(35, '{"1": 3}'), '[10,0,0,0,0]', '[0,7,7,7,7]');
  perform tst.ok(_kardex_base(c, 'p1', 2026, 8) = 0, 'sin fila anterior parte de 0');
  perform tst.ok(_kardex_base(c, 'p1', 2026, 9) = 7, 'el mes siguiente hereda el cierre');
  perform tst.ok(_kardex_base(c, 'p1', 2026, 10) = 7, 'D14: un mes sin fila en medio NO reinicia el saldo en 0');
  perform tst.ok(_kardex_base(c, 'p1', 2027, 3) = 7, 'ni siquiera con muchos meses de diferencia');
  perform tst.ok(_kardex_base('ZZZ_TEST_ch_B', 'p1', 2026, 10) = 0, 'otra comunidad no hereda lo mío');
  perform tst.ok(_kardex_base(c, 'p2', 2026, 10) = 0, 'otro producto tampoco');
  -- Con VARIAS filas anteriores manda la más reciente (agosto cierra en 2, septiembre en 6: octubre hereda 6).
  perform tst.seed(c, 'p3', 2026, 7, tst.arr(35), '[2,0,0,0,0]', '[0,2,2,2,2]');
  perform tst.seed(c, 'p3', 2026, 8, tst.arr(35), '[4,0,0,0,0]', '[2,6,6,6,6]');
  perform tst.ok(_kardex_base(c, 'p3', 2026, 9) = 6, 'con varias filas anteriores hereda la más reciente, no la más antigua');
  perform tst.ok(_kardex_base(c, 'p3', 2026, 8) = 2, 'y cada mes la suya');
  -- Ajuste vigente: el último por fecha de cada semana.
  insert into ajustes (community, product_id, year, month, week_index, saldo_anterior, saldo_nuevo, motivo, created_at) values
    (c, 'p1', 2026, 10, 2, 1, 5, 'primer conteo', now() - interval '2 days'),
    (c, 'p1', 2026, 10, 2, 1, 9, 'segundo conteo', now() - interval '1 day'),
    (c, 'p1', 2026, 10, 0, 1, 4, 'otro', now());
  perform tst.ok(_kardex_overrides(c, 'p1', 2026, 10) = '{"0": 4, "2": 9}'::jsonb, 'el ajuste vigente de cada semana es el último');
  perform tst.ok(_kardex_overrides(c, 'p1', 2026, 9) = '{}'::jsonb, 'sin ajustes, objeto vacío');
  delete from ajustes where community = c;
end $$;

-- ===========================================================================
-- 3. Regla de meses cerrados (D1, hora de Bogotá): matriz de fechas
-- ===========================================================================
do $$
declare
  c text := 'ZZZ_TEST_ch_A';
  k jsonb; i int := 0; pid text; ym int;
  cases jsonb := '[
   {"t":"2026-10-01","y":2026,"m":9,"later":false,"closed":false,"n":"mes actual, día 1"},
   {"t":"2026-10-01","y":2026,"m":8,"later":false,"closed":false,"n":"mes anterior, día 1, sin filas posteriores"},
   {"t":"2026-10-01","y":2026,"m":8,"later":true,"closed":true,"n":"mes anterior, día 1, CON fila en el mes siguiente"},
   {"t":"2026-10-05","y":2026,"m":8,"later":false,"closed":false,"n":"mes anterior, día 5, sin filas posteriores"},
   {"t":"2026-10-06","y":2026,"m":8,"later":false,"closed":true,"n":"mes anterior, día 6"},
   {"t":"2027-01-03","y":2026,"m":11,"later":false,"closed":false,"n":"cambio de año: diciembre desde el 3 de enero"},
   {"t":"2027-01-03","y":2026,"m":11,"later":true,"closed":true,"n":"cambio de año con fila en enero"},
   {"t":"2027-01-03","y":2026,"m":10,"later":false,"closed":true,"n":"cambio de año: noviembre es de dos meses atrás"},
   {"t":"2026-10-20","y":2026,"m":7,"later":false,"closed":true,"n":"agosto estando en octubre"},
   {"t":"2026-10-20","y":2026,"m":9,"later":false,"closed":false,"n":"mes actual a mitad de mes"},
   {"t":"2026-10-20","y":2026,"m":10,"later":false,"closed":false,"n":"mes futuro sin filas posteriores"},
   {"t":"2026-10-20","y":2026,"m":9,"later":true,"closed":true,"n":"mes actual con fila por adelantado en el siguiente (Q2)"},
   {"t":"2026-10-05","y":2026,"m":9,"later":false,"closed":false,"n":"mes actual el día 5"},
   {"t":"2026-10-06","y":2025,"m":11,"later":false,"closed":true,"n":"un año atrás"}
  ]';
begin
  for k in select * from jsonb_array_elements(cases) loop
    i := i + 1;
    pid := tst.pid(i);
    if (k ->> 'later')::boolean then
      ym := (k ->> 'y')::int * 12 + (k ->> 'm')::int + 1;
      perform tst.seed(c, pid, ym / 12, ym % 12, tst.arr(35), tst.arr(5), tst.arr(5));
    end if;
    perform set_config('tst.today', k ->> 't', false);
    perform tst.ok(tst.closed(c, pid, (k ->> 'y')::int, (k ->> 'm')::int) = (k ->> 'closed')::boolean, k ->> 'n');
  end loop;
  perform set_config('tst.today', '2026-10-20', false);
end $$;

-- ===========================================================================
-- 4. kardex_save_product: meses cerrados (7 y 9 parámetros), saldos del servidor, interruptores apagados
-- ===========================================================================
set role anon;
do $$
declare
  a text := current_setting('tst.a');
  c text := 'ZZZ_TEST_ch_A';
  p text := tst.pid(30);
  v timestamptz;
  r jsonb;
begin
  perform tst.today('2026-10-20');
  -- Mes cerrado (agosto estando en octubre): se rechaza con el RPC de 7 parámetros (cliente anterior) y con el de 9.
  perform tst.raises(format('select kardex_save_product(%L, 2026, 7, %L, %L, %L, %L)', a, p, tst.arr(35), tst.arr(5), tst.arr(5)),
                     'MES_CERRADO', 'el RPC anterior (7 parámetros) no elude la regla');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 7, %L, %L, %L, %L, true, null)', a, p, tst.arr(35), tst.arr(5), tst.arr(5)),
                     'MES_CERRADO', 'el RPC con versión (9 parámetros) tampoco');
  perform tst.ok(tst.row(c, p, 2026, 7) is null, 'y no se guardó nada');
  -- Mes actual: se guarda, y el servidor IGNORA los saldos del cliente (manda 99) y calcula los suyos (base 0, entrada 10, salida 3).
  v := kardex_save_product(a, 2026, 9, p, tst.arr(35, '{"1": 3}'), '[10,0,0,0,0]', '[99,99,99,99,99]', true, null);
  r := tst.row(c, p, 2026, 9);
  perform tst.ok(r -> 'prev_balances' = '[0,7,7,7,7]'::jsonb, 'el servidor calcula los saldos anteriores (no los 99 del cliente)');
  -- Con un ajuste en la semana 3 (saldo 8), los saldos de esa semana en adelante parten de él.
  perform kardex_insert_ajuste(a, p, 2026, 9, 2, 7, 8, 'conteo físico');
  v := kardex_save_product(a, 2026, 9, p, tst.arr(35, '{"1": 3}'), '[10,0,0,0,0]', '[0,0,0,0,0]', true, (tst.row(c, p, 2026, 9) ->> 'updated_at')::timestamptz);
  perform tst.ok(tst.row(c, p, 2026, 9) -> 'prev_balances' = '[0,7,8,8,8]'::jsonb, 'el ajuste vigente manda en el guardado normal');
  -- Herencia en el guardado: noviembre (mes futuro, sin fila posterior) hereda el cierre de octubre (8).
  v := kardex_save_product(a, 2026, 10, p, tst.arr(35), tst.arr(5), '[0,0,0,0,0]', true, null);
  perform tst.ok(tst.row(c, p, 2026, 10) -> 'prev_balances' = '[8,8,8,8,8]'::jsonb, 'noviembre hereda el último cierre (8)');
  -- Un mes con fila POSTERIOR pasa a cerrado: octubre ya no se guarda normal (hay fila de noviembre).
  perform tst.raises(format('select kardex_save_product(%L, 2026, 9, %L, %L, %L, %L)', a, p, tst.arr(35), tst.arr(5), tst.arr(5)),
                     'MES_CERRADO', 'con filas posteriores, el mes necesita la ventana');
  -- Formato de 6 semanas (42 salidas, 6 entradas, saldos de 6 semanas): se guarda y se calcula con 6 semanas; mezclas se rechazan.
  v := kardex_save_product(a, 2026, 9, tst.pid(33), tst.arr(42, '{"36": 1}'), '[0,0,0,0,0,3]', '[0,0,0,0,0,0]', true, null);
  perform tst.ok(tst.row(c, tst.pid(33), 2026, 9) -> 'prev_balances' = '[0,0,0,0,0,0]'::jsonb and jsonb_array_length(tst.row(c, tst.pid(33), 2026, 9) -> 'exits') = 42, 'una fila de 6 semanas se guarda');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 9, %L, %L, %L, %L)', a, tst.pid(34), tst.arr(42), tst.arr(5), tst.arr(5)), 'Datos incompletos', '42 salidas con 5 entradas');
  -- Validaciones intactas.
  perform tst.raises(format('select kardex_save_product(%L, 2026, 10, %L, %L, %L, %L)', a, p, tst.arr(30), tst.arr(5), tst.arr(5)), 'Datos incompletos', 'tamaño inválido');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 10, %L, %L, %L, %L)', a, p, tst.arr(35, '{"1": -1}'), tst.arr(5), tst.arr(5)), 'Valores inválidos', 'salida negativa');
  perform tst.raises(format('select kardex_save_product(%L, 2026, 10, %L, %L, %L, %L)', 'token-falso', p, tst.arr(35), tst.arr(5), tst.arr(5)), 'SESION_INVALIDA', 'token falso');
  -- Saldos negativos calculados SÍ se aceptan (la salida supera al saldo).
  v := kardex_save_product(a, 2026, 10, tst.pid(31), tst.arr(35, '{"1": 4}'), '[0,0,0,0,0]', '[0,0,0,0,0]', true, null);
  perform tst.ok(tst.row(c, tst.pid(31), 2026, 10) -> 'prev_balances' = '[0,-4,-4,-4,-4]'::jsonb, 'los saldos negativos calculados se guardan');
  -- Interruptores APAGADOS: vuelve el comportamiento anterior (mes cerrado se guarda y los saldos del cliente se respetan).
  perform tst.setting('closed_month_rule', false);
  perform tst.setting('server_chain', false);
  perform kardex_save_product(a, 2026, 7, tst.pid(32), tst.arr(35), tst.arr(5), '[4,4,4,4,4]');
  perform tst.ok(tst.row(c, tst.pid(32), 2026, 7) -> 'prev_balances' = '[4,4,4,4,4]'::jsonb, 'apagado: se guardan los saldos del cliente y el mes cerrado se acepta');
  perform tst.setting('closed_month_rule', true);
  perform tst.setting('server_chain', true);
end $$;
reset role;

-- ===========================================================================
-- 5. kardex_insert_ajuste: atómico (recalcula la fila), versión nueva, meses cerrados y reglas intactas
-- ===========================================================================
set role anon;
do $$
declare
  a text := current_setting('tst.a');
  c text := 'ZZZ_TEST_ch_A';
  p text := tst.pid(40);
  v1 timestamptz; v2 timestamptz;
begin
  perform tst.today('2026-10-20');
  v1 := kardex_save_product(a, 2026, 9, p, tst.arr(35, '{"1": 2}'), '[6,0,0,0,0]', '[0,0,0,0,0]', true, null);
  perform tst.ok(tst.row(c, p, 2026, 9) -> 'prev_balances' = '[0,4,4,4,4]'::jsonb, 'saldos de partida');
  v2 := kardex_insert_ajuste(a, p, 2026, 9, 1, 4, 10, 'conteo');
  perform tst.ok(v2 is not null and v2 > v1, 'el ajuste devuelve la versión nueva de la fila');
  perform tst.ok(tst.row(c, p, 2026, 9) -> 'prev_balances' = '[0,10,10,10,10]'::jsonb, 'la fila se recalculó en la misma transacción');
  perform tst.ok((tst.row(c, p, 2026, 9) ->> 'updated_at')::timestamptz = v2, 'y la versión devuelta es la de la fila');
  -- Sin fila del mes: solo inserta el ajuste y devuelve null.
  perform tst.ok(kardex_insert_ajuste(a, tst.pid(41), 2026, 9, 1, 0, 3, 'sin fila') is null, 'sin fila no hay versión que devolver');
  -- Mes cerrado: el ajuste también necesita la ventana.
  perform tst.raises(format('select kardex_insert_ajuste(%L, %L, 2026, 7, 1, 0, 3, %L)', a, p, 'tarde'), 'MES_CERRADO', 'ajuste en mes cerrado');
  -- Reglas de siempre.
  perform tst.raises(format('select kardex_insert_ajuste(%L, %L, 2026, 9, 1, 0, -1, %L)', a, p, 'x'), 'Saldo inválido', 'saldo nuevo negativo');
  perform tst.raises(format('select kardex_insert_ajuste(%L, %L, 2026, 9, 1, 0, 3, %L)', a, p, '   '), 'Motivo inválido', 'motivo vacío');
  perform tst.raises(format('select kardex_insert_ajuste(%L, %L, 2026, 9, 6, 0, 3, %L)', a, p, 'x'), 'Fecha inválida', 'semana 7');
  -- Interruptor apagado: solo inserta (devuelve null) y no toca la fila.
  perform tst.setting('server_chain', false);
  perform tst.ok(kardex_insert_ajuste(a, p, 2026, 9, 2, 0, 1, 'apagado') is null, 'apagado: no devuelve versión');
  perform tst.ok(tst.row(c, p, 2026, 9) -> 'prev_balances' = '[0,10,10,10,10]'::jsonb, 'apagado: no recalcula la fila');
  perform tst.setting('server_chain', true);
end $$;
reset role;

-- Ayudas para las secciones siguientes: un ajuste sembrado (como dueño) y el armado de p_months a partir del historial.
create function tst.ajuste(c text, p text, y int, m int, w int, nuevo numeric) returns void
language sql security definer set search_path = public as $$
  insert into ajustes (community, product_id, year, month, week_index, saldo_anterior, saldo_nuevo, motivo)
  values (c, p, y, m, w, 0, nuevo, 'sembrado')
$$;
-- over = {"2026-2": {"exits": [...]}}: cambia las salidas o entradas de esos meses; lo demás queda igual, con su versión leída.
create function tst.build(h jsonb, over jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object(
           'year', r -> 'year', 'month', r -> 'month',
           'exits',   coalesce((over -> ((r ->> 'year') || '-' || (r ->> 'month'))) -> 'exits', r -> 'exits'),
           'entries', coalesce((over -> ((r ->> 'year') || '-' || (r ->> 'month'))) -> 'entries', r -> 'entries'),
           'expected_updated_at', r -> 'updated_at') order by (r ->> 'year')::int, (r ->> 'month')::int)
    from jsonb_array_elements(h -> 'rows') r
$$;
grant execute on function tst.ajuste(text, text, int, int, int, numeric), tst.build(jsonb, jsonb) to anon;

-- ===========================================================================
-- 6. Historial, token de cadena y bases heredadas (la comunidad sale solo del token)
-- ===========================================================================
set role anon;
do $$
declare
  a text := current_setting('tst.a');
  b text := current_setting('tst.b');
  c text := 'ZZZ_TEST_ch_A';
  p text := tst.pid(20);
  h jsonb; hb jsonb; t1 text; t2 text;
begin
  perform tst.today('2026-10-20');
  perform tst.seed(c, p, 2026, 2, tst.arr(35, '{"1": 3}'), '[10,0,0,0,0]', '[0,7,7,7,7]');
  perform tst.seed(c, p, 2026, 3, tst.arr(35, '{"8": 1}'), '[0,0,0,0,0]', '[7,7,6,6,6]');
  perform tst.seed(c, p, 2026, 4, tst.arr(35), '[0,0,0,0,0]', '[6,6,6,6,6]');
  h := kardex_product_history(a, p, 2026, 2);
  perform tst.ok((h ->> 'base')::numeric = 0 and jsonb_array_length(h -> 'rows') = 3, 'el historial trae la base y los 3 meses');
  perform tst.ok((h -> 'rows' -> 0 ->> 'month')::int = 2 and (h -> 'rows' -> 2 ->> 'month')::int = 4, 'en orden cronológico');
  perform tst.ok(h -> 'rows' -> 0 ? 'updated_at' and h -> 'rows' -> 0 ? 'overrides', 'cada fila trae su versión y sus ajustes vigentes');
  t1 := h ->> 'chain_token';
  perform tst.ok(kardex_product_history(a, p, 2026, 2) ->> 'chain_token' = t1, 'el token es estable mientras nada cambie');
  perform tst.ok((kardex_product_history(a, p, 2026, 3) ->> 'base')::numeric = 7, 'la base de abril es el cierre de marzo');
  -- El token cambia cuando cambia una fila, aparece un mes posterior o se agrega un ajuste.
  perform tst.seed(c, p, 2026, 4, tst.arr(35, '{"2": 1}'), '[0,0,0,0,0]', '[6,6,6,6,6]');
  t2 := kardex_product_history(a, p, 2026, 2) ->> 'chain_token';
  perform tst.ok(t2 <> t1, 'una fila cambiada cambia el token');
  t1 := t2;
  -- La fila que aporta la base heredada también cuenta: si aparece o cambia una fila ANTERIOR al mes pedido, cambia el token.
  perform tst.seed(c, p, 2026, 1, tst.arr(35), '[2,0,0,0,0]', '[0,2,2,2,2]');
  t2 := kardex_product_history(a, p, 2026, 2) ->> 'chain_token';
  perform tst.ok(t2 <> t1, 'una fila anterior que aporta la base cambia el token');
  t1 := t2;
  perform tst.seed(c, p, 2026, 1, tst.arr(35), '[3,0,0,0,0]', '[0,3,3,3,3]');
  t2 := kardex_product_history(a, p, 2026, 2) ->> 'chain_token';
  perform tst.ok(t2 <> t1, 'y si esa fila cambia, también');
  t1 := t2;
  perform tst.seed(c, p, 2026, 5, tst.arr(35), '[0,0,0,0,0]', '[6,6,6,6,6]');
  t2 := kardex_product_history(a, p, 2026, 2) ->> 'chain_token';
  perform tst.ok(t2 <> t1, 'un mes posterior nuevo cambia el token');
  t1 := t2;
  perform tst.ajuste(c, p, 2026, 4, 1, 3);
  t2 := kardex_product_history(a, p, 2026, 2) ->> 'chain_token';
  perform tst.ok(t2 <> t1, 'un ajuste nuevo cambia el token');
  -- Aislamiento: otra comunidad no ve nada de este producto y su token es otro.
  hb := kardex_product_history(b, p, 2026, 2);
  perform tst.ok(jsonb_array_length(hb -> 'rows') = 0 and (hb ->> 'chain_token') <> t2, 'otra comunidad no ve mis filas');
  perform tst.raises(format('select kardex_product_history(%L, %L, 2026, 2)', 'token-falso', p), 'SESION_INVALIDA', 'token falso');
  perform tst.raises(format('select kardex_product_history(%L, %L, 2026, 12)', a, p), 'Fecha inválida', 'mes inválido');
  perform tst.raises(format('select kardex_product_history(%L, %L, 2026, 2)', a, 'zzz'), 'Producto inválido', 'producto inexistente');
  -- Bases heredadas para un mes: una por producto con filas anteriores.
  perform tst.ok((select base from kardex_inherited_bases(a, 2026, 3) where product_id = p) = 7, 'base heredada de abril = cierre de marzo');
  perform tst.ok((select base from kardex_inherited_bases(a, 2026, 9) where product_id = p) = 6, 'base heredada de octubre = cierre del último mes con fila (mayo)');
  perform tst.ok((select base from kardex_inherited_bases(a, 2026, 2) where product_id = p) = 3, 'la base de marzo es el cierre de febrero');
  perform tst.ok(not exists (select 1 from kardex_inherited_bases(a, 2026, 1) where product_id = p), 'sin filas anteriores no hay base');
  perform tst.ok(not exists (select 1 from kardex_inherited_bases(b, 2026, 9) where product_id = p), 'otra comunidad no hereda lo mío');
end $$;
reset role;

-- ===========================================================================
-- 7. kardex_save_months: simulacro, guardado, auditoría, conflictos, alcance, tope, atomicidad, motivo, aislamiento
-- ===========================================================================
set role anon;
do $$
declare
  a text := current_setting('tst.a');
  adm text := 'token-admin-chain';
  c text := 'ZZZ_TEST_ch_A';
  p text := tst.pid(21);
  q text := tst.pid(22);
  h jsonb; ms jsonb; res jsonb; tok text; over jsonb;
begin
  perform tst.today('2026-10-20');
  -- Marzo, abril y mayo de 2026 de un producto, con la cadena consistente; más febrero de OTRO producto (fuera del alcance).
  perform tst.seed(c, p, 2026, 2, tst.arr(35, '{"1": 3}'), '[10,0,0,0,0]', '[0,7,7,7,7]');
  perform tst.seed(c, p, 2026, 3, tst.arr(35, '{"8": 1}'), '[0,0,0,0,0]', '[7,7,6,6,6]');
  perform tst.seed(c, p, 2026, 4, tst.arr(35), '[0,0,0,0,0]', '[6,6,6,6,6]');
  perform tst.seed(c, q, 2026, 1, tst.arr(35, '{"1": 1}'), '[5,0,0,0,0]', '[0,4,4,4,4]');
  perform kardex_submit_week(a, 2026, 3, 1);   -- abril, semana 2 (tiene la salida del día 8)
  perform kardex_submit_week(a, 2026, 1, 0);   -- febrero, semana 1, de otro producto y fuera del alcance
  perform tst.ok((select prev_balance from admin_weekly_totals(adm, 2026, 3, 1, false) where community = c and product_id = p) = 7,
                 'resumen semanal antes: saldo anterior de abril = 7');

  h := kardex_product_history(a, p, 2026, 2);
  tok := h ->> 'chain_token';
  over := jsonb_build_object('2026-2', jsonb_build_object('exits', tst.arr(35, '{"1": 5}')));   -- marzo: salen 5 en vez de 3
  ms := tst.build(h, over);

  -- Simulacro: calcula y devuelve lo que se guardaría, sin escribir nada ni auditar.
  res := kardex_save_months(a, p, 2026, 2, 'corrección de prueba', ms, tok, true);
  perform tst.ok((res ->> 'changed')::int = 3, 'el simulacro cuenta los 3 meses que cambian');
  perform tst.ok(res -> 'months' -> 0 -> 'prev_balances' = '[0,5,5,5,5]'::jsonb and (res -> 'months' -> 0 ->> 'closing')::numeric = 5, 'marzo');
  perform tst.ok(res -> 'months' -> 1 -> 'prev_balances' = '[5,5,4,4,4]'::jsonb, 'abril se recalcula con el cierre nuevo de marzo');
  perform tst.ok(res -> 'months' -> 2 -> 'prev_balances' = '[4,4,4,4,4]'::jsonb, 'mayo también');
  perform tst.ok(jsonb_array_length(res -> 'sent_weeks') = 1 and res -> 'sent_weeks' -> 0 ->> 'month' = '3'
                 and res -> 'sent_weeks' -> 0 -> 'weeks' = '[1]'::jsonb, 'avisa de la semana ya enviada de abril, no de febrero');
  perform tst.ok(tst.row(c, p, 2026, 3) -> 'prev_balances' = '[7,7,6,6,6]'::jsonb and tst.row(c, p, 2026, 2) -> 'exits' -> 0 = '3'::jsonb,
                 'el simulacro NO escribe');
  perform tst.ok(tst.audits(c) = 0, 'ni audita');

  -- Guardado real (con el motivo recortado).
  res := kardex_save_months(a, p, 2026, 2, '  corrección de prueba  ', ms, tok, false);
  perform tst.ok(tst.row(c, p, 2026, 2) -> 'prev_balances' = '[0,5,5,5,5]'::jsonb, 'marzo guardado');
  perform tst.ok(tst.row(c, p, 2026, 3) -> 'prev_balances' = '[5,5,4,4,4]'::jsonb, 'abril guardado con la cadena corregida');
  perform tst.ok(tst.row(c, p, 2026, 4) -> 'prev_balances' = '[4,4,4,4,4]'::jsonb, 'mayo guardado con la cadena corregida');
  perform tst.ok(tst.audits(c) = 1, 'una fila de auditoría');
  perform tst.ok(tst.audit(c, 1) ->> 'reason' = 'corrección de prueba' and jsonb_array_length(tst.audit(c, 1) -> 'months') = 3, 'auditoría: motivo y 3 meses');
  perform tst.ok(tst.audit(c, 1) -> 'months' -> 0 -> 'before' -> 'exits' -> 0 = '3'::jsonb
                 and tst.audit(c, 1) -> 'months' -> 0 -> 'after' -> 'exits' -> 0 = '5'::jsonb, 'auditoría: antes y después');
  perform tst.ok(tst.audit(c, 1) ->> 'chain_before' = tok and tst.audit(c, 1) ->> 'chain_after' = res ->> 'chain_token'
                 and res ->> 'chain_token' = kardex_product_history(a, p, 2026, 2) ->> 'chain_token', 'tokens de la auditoría y token nuevo');
  -- Resumen semanal y semanas enviadas tras corregir un mes anterior.
  perform tst.ok((select prev_balance from admin_weekly_totals(adm, 2026, 3, 1, false) where community = c and product_id = p) = 5,
                 'resumen semanal: el saldo anterior de abril ya es 5');
  perform tst.ok((select modified from kardex_week_submissions(a, 2026, 3) where week_index = 1), 'la semana enviada de abril queda modificada');
  perform tst.ok(not (select modified from kardex_week_submissions(a, 2026, 1) where week_index = 0), 'la de febrero (fuera del alcance) no');

  -- Sin cambios y token viejo.
  h := kardex_product_history(a, p, 2026, 2);
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'sin cambios', tst.build(h), h ->> 'chain_token'),
                     'SIN_CAMBIOS', 'no hay nada que cambiar');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'token viejo', ms, tok),
                     'CONFLICTO_VERSION', 'el token anterior ya no vale');
end $$;
reset role;

-- Conflictos, alcance, atomicidad, motivo y aislamiento (cada caso toma un historial nuevo).
create function tst.hist(tok text, p text) returns jsonb language sql as $$
  select kardex_product_history(tok, p, 2026, 2)
$$;
grant execute on function tst.hist(text, text) to anon;
set role anon;
do $$
declare
  a text := current_setting('tst.a');
  b text := current_setting('tst.b');
  c text := 'ZZZ_TEST_ch_A';
  p text := tst.pid(21);
  h jsonb; ms jsonb; tok text; before_rows jsonb; n_audits int;
  cambio jsonb := jsonb_build_object('2026-2', jsonb_build_object('exits', tst.arr(35, '{"1": 1}')));
begin
  perform tst.today('2026-10-20');
  -- Un mes posterior aparece después de leer el historial.
  h := tst.hist(a, p);  tok := h ->> 'chain_token';  ms := tst.build(h, cambio);
  before_rows := tst.row(c, p, 2026, 2);
  perform tst.seed(c, p, 2026, 6, tst.arr(35), '[0,0,0,0,0]', '[4,4,4,4,4]');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'mes nuevo', ms, tok), 'CONFLICTO_VERSION', 'un mes posterior nuevo');
  perform tst.ok(tst.row(c, p, 2026, 2) = before_rows, 'y no se guardó nada');
  -- Aparece un ajuste.
  h := tst.hist(a, p);  tok := h ->> 'chain_token';  ms := tst.build(h, cambio);
  perform tst.ajuste(c, p, 2026, 4, 2, 9);
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'ajuste nuevo', ms, tok), 'CONFLICTO_VERSION', 'un ajuste nuevo');
  -- Otra persona cambia una fila.
  h := tst.hist(a, p);  tok := h ->> 'chain_token';  ms := tst.build(h, cambio);
  perform tst.seed(c, p, 2026, 3, tst.arr(35, '{"9": 1}'), '[0,0,0,0,0]', '[5,5,4,4,4]');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'fila cambiada', ms, tok), 'CONFLICTO_VERSION', 'una fila cambiada');
  -- Versión de una fila equivocada con el token vigente.
  h := tst.hist(a, p);  tok := h ->> 'chain_token';  ms := tst.build(h, cambio);
  ms := jsonb_set(ms, '{1,expected_updated_at}', '"2000-01-01T00:00:00+00:00"');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'versión mala', ms, tok), 'CONFLICTO_VERSION', 'versión de fila equivocada');

  -- Alcance: faltante, repetido, sobrante y vacío.
  h := tst.hist(a, p);  tok := h ->> 'chain_token';  ms := tst.build(h, cambio);
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'falta uno', ms - 3, tok), 'ALCANCE_INCOMPLETO', 'falta un mes');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'repetido', (ms - 3) || jsonb_build_array(ms -> 0), tok), 'ALCANCE_INCOMPLETO', 'un mes repetido y otro faltante');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'sobra uno', ms || jsonb_build_array(ms -> 0), tok), 'ALCANCE_INCOMPLETO', 'un mes de más');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'vacío', '[]', tok), 'ALCANCE_INCOMPLETO', 'sin meses');

  -- Atomicidad: el último mes trae una salida negativa; ningún mes anterior queda guardado ni se audita.
  n_audits := tst.audits(c);
  before_rows := tst.row(c, p, 2026, 2) || tst.row(c, p, 2026, 3);
  ms := tst.build(h, cambio || jsonb_build_object('2026-6', jsonb_build_object('exits', tst.arr(35, '{"1": -1}'))));
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, p, 'a mitad', ms, tok), 'Valores inválidos', 'un mes inválido al final');
  perform tst.ok(before_rows = tst.row(c, p, 2026, 2) || tst.row(c, p, 2026, 3) and tst.audits(c) = n_audits, 'todo o nada: no quedó ninguna parte ni auditoría');

  -- Motivo (en el servidor).
  ms := tst.build(h, cambio);
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L, true)', a, p, '', ms, tok), 'Motivo inválido', 'motivo vacío');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L, true)', a, p, 'abc', ms, tok), 'Motivo inválido', 'motivo de 3 caracteres');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L, true)', a, p, '!!!!!', ms, tok), 'Motivo inválido', 'motivo sin letras ni dígitos');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L, true)', a, p, 'ab' || chr(10) || 'cdef', ms, tok), 'Motivo inválido', 'motivo con salto de línea');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L, true)', a, p, repeat('a', 501), ms, tok), 'Motivo inválido', 'motivo de 501');
  perform tst.ok((kardex_save_months(a, p, 2026, 2, 'error', ms, tok, true) ->> 'changed')::int >= 1, 'un motivo válido de 5 caracteres pasa (simulacro)');
  perform tst.ok((kardex_save_months(a, p, 2026, 2, repeat('a', 500), ms, tok, true) ->> 'changed')::int >= 1, 'y uno de 500');

  -- Aislamiento: otra comunidad no toca nada; token falso y producto inexistente se rechazan.
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', b, p, 'ajeno', ms, tok), 'CONFLICTO_VERSION', 'otra comunidad con mi token de cadena');
  perform tst.ok(tst.audits('ZZZ_TEST_ch_B') = 0, 'sin auditoría en la otra comunidad');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', 'token-falso', p, 'falso', ms, tok), 'SESION_INVALIDA', 'token falso');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 2, %L, %L, %L)', a, 'zzz', 'producto', ms, tok), 'Producto inválido', 'producto inexistente');
end $$;
reset role;

-- Solo se reescriben las filas que cambian (sus versiones no se mueven) y la base de la corrección sale del último cierre anterior.
set role anon;
do $$
declare
  a text := current_setting('tst.a');
  c text := 'ZZZ_TEST_ch_A';
  r text := tst.pid(24);
  h jsonb; ms jsonb; res jsonb; v_mar text;
begin
  perform tst.today('2026-10-20');
  perform tst.seed(c, r, 2026, 1, tst.arr(35, '{"1": 1}'), '[5,0,0,0,0]', '[0,4,4,4,4]');   -- febrero: cierra en 4
  perform tst.seed(c, r, 2026, 2, tst.arr(35), '[0,0,0,0,0]', '[4,4,4,4,4]');                 -- marzo: sin movimiento
  perform tst.seed(c, r, 2026, 3, tst.arr(35, '{"8": 1}'), '[0,0,0,0,0]', '[4,4,3,3,3]');     -- abril: sale 1 la semana 2
  h := kardex_product_history(a, r, 2026, 2);
  perform tst.ok((h ->> 'base')::numeric = 4, 'la base de marzo es el cierre de febrero');
  v_mar := tst.row(c, r, 2026, 2) ->> 'updated_at';
  ms := tst.build(h, jsonb_build_object('2026-3', jsonb_build_object('exits', tst.arr(35, '{"8": 2}'))));
  res := kardex_save_months(a, r, 2026, 2, 'solo abril', ms, h ->> 'chain_token');
  perform tst.ok((res ->> 'changed')::int = 1 and not (res -> 'months' -> 0 ->> 'changed')::boolean and (res -> 'months' -> 1 ->> 'changed')::boolean,
                 'solo cambia abril (marzo parte de la base 4 y queda igual)');
  perform tst.ok(tst.row(c, r, 2026, 3) -> 'prev_balances' = '[4,4,2,2,2]'::jsonb, 'abril recalculado');
  perform tst.ok(tst.row(c, r, 2026, 2) ->> 'updated_at' = v_mar, 'la fila que no cambió NO se reescribe (su versión no se mueve)');
  perform tst.ok(jsonb_array_length(tst.audit(c, 2) -> 'months') = 1 and tst.audit(c, 2) -> 'months' -> 0 ->> 'month' = '3', 'la auditoría solo trae el mes que cambió');
end $$;
reset role;

-- ===========================================================================
-- 8. Tope de 120 meses (solo la ESCRITURA; la lectura no tiene tope), auditoría append-only y permisos
-- ===========================================================================
set role anon;
do $$
declare
  a text := current_setting('tst.a');
  c text := 'ZZZ_TEST_ch_A';
  p text := tst.pid(23);
  k int;
  h jsonb;
begin
  perform tst.today('2026-10-20');
  for k in 0 .. 120 loop     -- 121 meses seguidos desde enero de 2026
    perform tst.seed(c, p, 2026 + k / 12, k % 12, tst.arr(35), '[0,0,0,0,0]', '[0,0,0,0,0]');
  end loop;
  h := kardex_product_history(a, p, 2026, 0);
  perform tst.ok(jsonb_array_length(h -> 'rows') = 121, 'la LECTURA del historial no tiene tope (121 meses)');
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 0, %L, %L, %L)', a, p, 'tope de meses', tst.build(h), h ->> 'chain_token'),
                     'CORRECCION_FUERA_DE_TOPE', '121 meses superan el tope');
  h := kardex_product_history(a, p, 2026, 1);
  perform tst.ok(jsonb_array_length(h -> 'rows') = 120, 'desde febrero son 120');
  -- Con 120 meses ya no es el tope: el error pasa a ser otro (aquí no hay nada que cambiar).
  perform tst.raises(format('select kardex_save_months(%L, %L, 2026, 1, %L, %L, %L)', a, p, 'justo el tope', tst.build(h), h ->> 'chain_token'),
                     'SIN_CAMBIOS', 'con 120 meses pasa el tope');
end $$;
reset role;

-- La auditoría es append-only incluso para el dueño, y las tablas e internas están cerradas a anon.
do $$
begin
  perform tst.raises('update kardex_corrections set reason = ''cambiado'' where true', 'solo de inserción', 'no se actualiza');
  perform tst.raises('delete from kardex_corrections where true', 'solo de inserción', 'no se borra');
  perform tst.raises('truncate kardex_corrections', 'solo de inserción', 'no se vacía');
  perform tst.ok((select count(*) from kardex_corrections) >= 1, 'la auditoría sigue intacta');
  perform tst.ok((select count(*) from pg_proc where proname = 'kardex_save_product') = 1, 'una sola kardex_save_product');
  perform tst.ok((select count(*) from pg_proc where proname = 'kardex_insert_ajuste') = 1, 'una sola kardex_insert_ajuste');
  perform tst.ok((select count(*) from pg_proc where proname = 'kardex_save_months') = 1, 'una sola kardex_save_months');
end $$;
set role anon;
do $$
begin
  perform tst.ok(tst.internal('select * from kardex_corrections') = 'sin permiso', 'anon no lee la auditoría');
  perform tst.ok(tst.internal('select * from kardex_settings') = 'sin permiso', 'anon no lee los interruptores');
  perform tst.ok(tst.internal('update kardex_settings set enabled = false where true') = 'sin permiso', 'anon no apaga los interruptores');
  perform tst.ok(tst.internal('select _kardex_cascade(0, ''{}'', ''[0]'', ''[0]'')') = 'sin permiso', 'anon no llama a _kardex_cascade');
  perform tst.ok(tst.internal('select _kardex_base(''x'', ''y'', 2026, 1)') = 'sin permiso', 'ni a _kardex_base');
  perform tst.ok(tst.internal('select _kardex_lock(''x'', ''y'')') = 'sin permiso', 'ni a _kardex_lock');
  perform tst.ok(tst.internal('select _kardex_chain_token(''x'', ''y'', 1)') = 'sin permiso', 'ni a _kardex_chain_token');
  perform tst.ok(tst.internal('select _kardex_month_closed(''x'', ''y'', 2026, 1)') = 'sin permiso', 'ni a _kardex_month_closed');
  perform tst.ok(tst.internal('select kardex_save_months(''t'', ''p'', 2026, 1, ''motivo'', ''[]'', ''x'')') <> 'sin permiso', 'las funciones públicas sí se pueden llamar');
exception when others then
  if sqlerrm like '%SESION_INVALIDA%' then null; else raise; end if;
end $$;
reset role;

-- ===========================================================================
-- Limpieza y restauración de la función real y de los interruptores
-- ===========================================================================
alter table kardex_corrections disable trigger kardex_corrections_no_update;
delete from kardex_corrections where community like 'ZZZ\_TEST\_ch\_%';
alter table kardex_corrections enable trigger kardex_corrections_no_update;
delete from kardex_records where community like 'ZZZ\_TEST\_ch\_%';
delete from ajustes where community like 'ZZZ\_TEST\_ch\_%';
delete from communities where name like 'ZZZ\_TEST\_ch\_%';
delete from admin_sessions where token_hash = encode(sha256(convert_to('token-admin-chain', 'UTF8')), 'hex');
delete from admin_account where id = 1;
drop schema tst cascade;
\i supabase/kardex_chain_1.sql
update kardex_settings set enabled = false;
do $$
begin
  if _kardex_today() <> _kardex_today_at(now()) then raise exception 'FALLÓ: no se restauró _kardex_today()'; end if;
  if (select count(*) from kardex_settings where enabled) <> 0 then raise exception 'FALLÓ: los interruptores deben quedar apagados'; end if;
end $$;
\echo 'kardex_chain: OK'
