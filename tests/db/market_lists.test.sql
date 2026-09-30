-- Pruebas de supabase/market_lists.sql y market_seed.sql (plan 003, Fase A)
-- contra un Postgres local. Cada prueba que falla aborta con "FALLÓ: ...".
-- Las llamadas se hacen como el rol `anon`, igual que la app con la anon key.

\set ON_ERROR_STOP on
\set QUIET on

-- Ayudantes de aserción (visibles para anon).
drop schema if exists tst cascade;
create schema tst;
grant usage on schema tst to anon;

create function tst.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', msg; end if;
end $$;

-- Ejecuta `stmt` y exige que falle con un mensaje que contenga `expected`.
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

-- Comunidades de prueba: A y B con participantes, C sin participantes.
set role anon;
do $$ begin
  perform create_community_with_pin('ZZZ_TEST_mkt_A', '4321');
  perform create_community_with_pin('ZZZ_TEST_mkt_B', '4321');
  perform create_community_with_pin('ZZZ_TEST_mkt_C', '4321');
  perform set_config('tst.tok_a', login_community('ZZZ_TEST_mkt_A', '4321'), false);
  perform set_config('tst.tok_b', login_community('ZZZ_TEST_mkt_B', '4321'), false);
  perform set_config('tst.tok_c', login_community('ZZZ_TEST_mkt_C', '4321'), false);
  -- Semana futura (lunes) sin calendario sembrado: plazo por defecto, nunca vencido.
  perform set_config('tst.future', (date_trunc('week', now() + interval '400 days'))::date::text, false);
end $$;

-- ===========================================================================
-- Permisos: anon no toca las tablas ni las funciones internas
-- ===========================================================================
do $$ begin
  perform tst.raises('select * from market_items',    'permission denied', 'anon no lee market_items');
  perform tst.raises('select * from market_calendar', 'permission denied', 'anon no lee market_calendar');
  perform tst.raises('select * from market_lists',    'permission denied', 'anon no lee market_lists');
  perform tst.raises($q$insert into market_lists (community, week_start, kind) values ('x', '2026-10-05', 'fruver')$q$,
                     'permission denied', 'anon no escribe market_lists');
  perform tst.raises($q$select _market_deadline('2026-10-02')$q$,         'permission denied', '_market_deadline no es pública');
  perform tst.raises($q$select _market_check_week('2026-10-05')$q$,       'permission denied', '_market_check_week no es pública');
  perform tst.raises($q$select _market_clean_quantities('fruver', '{}')$q$, 'permission denied', '_market_clean_quantities no es pública');
  -- participants no está en el grant por columnas de communities
  perform tst.raises('select participants from communities', 'permission denied', 'anon no lee communities.participants');
end $$;

-- ===========================================================================
-- Sesión: sin token válido no hay nada
-- ===========================================================================
do $$ begin
  perform tst.raises($q$select * from market_catalog('token-falso')$q$,              'SESION_INVALIDA', 'catálogo con token falso');
  perform tst.raises($q$select market_list_load('token-falso', '2026-10-05')$q$,     'SESION_INVALIDA', 'load con token falso');
  perform tst.raises($q$select market_list_save('token-falso', '2026-10-05', 'fruver', '{}')$q$, 'SESION_INVALIDA', 'save con token falso');
  perform tst.raises($q$select market_set_participants('token-falso', 5)$q$,         'SESION_INVALIDA', 'participantes con token falso');
  perform tst.raises($q$select market_list_submit('token-falso', '2026-10-05')$q$,   'SESION_INVALIDA', 'submit con token falso');
  perform tst.raises($q$select * from market_catalog(null)$q$,                       'SESION_INVALIDA', 'catálogo sin token');
end $$;

-- ===========================================================================
-- Catálogo
-- ===========================================================================
do $$
declare
  v_tok text := current_setting('tst.tok_a');
  v_n int;
begin
  select count(*) into v_n from market_catalog(v_tok);
  perform tst.ok(v_n = 285, format('el catálogo trae 285 ítems, trae %s', v_n));
  perform tst.ok((select count(*) from market_catalog(v_tok) where kind = 'fruver')    = 117, '117 de fruver y lácteos');
  perform tst.ok((select count(*) from market_catalog(v_tok) where kind = 'carnes')    = 35,  '35 de carnes');
  perform tst.ok((select count(*) from market_catalog(v_tok) where kind = 'abarrotes') = 80,  '80 de abarrotes');
  perform tst.ok((select count(*) from market_catalog(v_tok) where kind = 'aseo')      = 53,  '53 de aseo');
  perform tst.ok((select name from market_catalog(v_tok) where id = 'mc1') = 'CARNE ASAR PORCION', 'primer ítem de carnes');
  perform tst.ok((select array_agg(column_name::text order by ordinal_position)
                    from information_schema.columns where table_name = 'market_items'
                     and column_name ~* 'price|precio|valor|iva') is null, 'el catálogo no tiene columnas de precio');
end $$;

-- ===========================================================================
-- Calendario sembrado (se mira como dueño: anon no lo lee)
-- ===========================================================================
reset role;
do $$ begin
  perform tst.ok((select count(*) from market_calendar) = 52, 'el calendario 2026 tiene 52 viernes');
  perform tst.ok((select kinds from market_calendar where friday = '2026-10-02') = array['fruver','carnes','abarrotes'], '2 oct: F/L/C/A');
  perform tst.ok((select kinds from market_calendar where friday = '2026-10-16') = array['fruver','carnes','abarrotes','aseo'], '16 oct: F/L/C/A/AS');
  perform tst.ok((select kinds from market_calendar where friday = '2026-09-25') = array['fruver','carnes'], '25 sep: solo F/L/C');
  perform tst.ok((select deadline_at from market_calendar where friday = '2026-10-02') = '2026-10-02 22:00:00+00', 'plazo normal: viernes 5 pm Bogotá');
  perform tst.ok((select deadline_at from market_calendar where friday = '2026-04-03') = '2026-04-01 22:00:00+00', 'Viernes Santo: plazo el miércoles 1');
  perform tst.ok((select deadline_at from market_calendar where friday = '2026-12-25') = '2026-12-24 22:00:00+00', 'Navidad: plazo el jueves 24');
  perform tst.raises($q$insert into market_calendar values ('2026-10-03', '{fruver}', now())$q$, 'violates check constraint', 'solo viernes');
  perform tst.raises($q$insert into market_calendar values ('2027-01-01', '{panaderia}', now())$q$, 'violates check constraint', 'tipos válidos');
  perform tst.raises($q$insert into market_lists (community, week_start, kind) values ('ZZZ_TEST_mkt_A', '2026-10-06', 'fruver')$q$, 'violates check constraint', 'la semana es un lunes');
  perform tst.ok(_market_deadline('2027-01-01') = '2027-01-01 22:00:00+00', 'sin calendario: viernes 5 pm Bogotá por defecto');
end $$;
set role anon;

-- ===========================================================================
-- Cargar una semana
-- ===========================================================================
do $$
declare
  v_tok text := current_setting('tst.tok_a');
  v jsonb;
begin
  v := market_list_load(v_tok, '2026-10-05');
  perform tst.ok(v ->> 'friday' = '2026-10-02', 'el viernes de pedido es el lunes - 3');
  perform tst.ok(v -> 'kinds_due' = '["fruver","carnes","abarrotes"]'::jsonb, 'kinds_due del calendario');
  perform tst.ok((v ->> 'deadline_at')::timestamptz = '2026-10-02 22:00:00+00', 'plazo del calendario');
  perform tst.ok(v -> 'participants' = 'null'::jsonb, 'sin participantes al inicio');
  perform tst.ok(v -> 'lists' = '[]'::jsonb, 'sin listas al inicio');

  v := market_list_load(v_tok, '2027-01-04');
  perform tst.ok(v -> 'kinds_due' = 'null'::jsonb, 'viernes no sembrado: kinds_due nulo');
  perform tst.ok((v ->> 'deadline_at')::timestamptz = '2027-01-01 22:00:00+00', 'viernes no sembrado: plazo por defecto');

  perform tst.raises(format('select market_list_load(%L, %L)', v_tok, '2026-10-06'), 'Semana inválida', 'martes no es semana');
  perform tst.raises(format('select market_list_load(%L, %L)', v_tok, '1999-01-04'), 'Semana inválida', 'año fuera de rango');
  perform tst.raises(format('select market_list_load(%L, null)', v_tok), 'Semana inválida', 'semana nula');
end $$;

-- ===========================================================================
-- Participantes
-- ===========================================================================
do $$
declare
  v_a text := current_setting('tst.tok_a');
begin
  perform tst.raises(format('select market_set_participants(%L, 0)', v_a),   'Participantes inválidos', '0 participantes');
  perform tst.raises(format('select market_set_participants(%L, 501)', v_a), 'Participantes inválidos', '501 participantes');
  perform tst.raises(format('select market_set_participants(%L, null)', v_a), 'Participantes inválidos', 'participantes nulos');
  perform market_set_participants(v_a, 11);
  perform market_set_participants(current_setting('tst.tok_b'), 9);
  perform tst.ok((market_list_load(v_a, '2026-10-05') ->> 'participants')::int = 11, 'A tiene 11');
  perform tst.ok((market_list_load(current_setting('tst.tok_b'), '2026-10-05') ->> 'participants')::int = 9, 'B tiene 9 (no se mezclan)');
  perform tst.ok((market_list_load(current_setting('tst.tok_c'), '2026-10-05') ->> 'participants') is null, 'C sigue sin participantes');
end $$;

-- ===========================================================================
-- Guardar borrador
-- ===========================================================================
do $$
declare
  v_a text := current_setting('tst.tok_a');
  v_w text := current_setting('tst.future');
  v jsonb;
begin
  perform market_list_save(v_a, v_w::date, 'fruver', '{"mf1": 2.5, "mf2": 0, "mf3": 0.25}');
  v := market_list_load(v_a, v_w::date) -> 'lists' -> 0;
  perform tst.ok(v ->> 'kind' = 'fruver', 'la lista guardada es fruver');
  perform tst.ok(v -> 'quantities' = '{"mf1": 2.5, "mf3": 0.25}'::jsonb, 'los ceros se descartan y los decimales se conservan');
  perform tst.ok((v ->> 'sent')::boolean = false and (v ->> 'modified')::boolean = false, 'un borrador no está enviado');

  -- Guardar de nuevo reemplaza (no mezcla)
  perform market_list_save(v_a, v_w::date, 'fruver', '{"mf1": 4}');
  perform tst.ok(market_list_load(v_a, v_w::date) -> 'lists' -> 0 -> 'quantities' = '{"mf1": 4}'::jsonb, 'guardar reemplaza lo anterior');

  -- Validaciones
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, v_w, 'fruver', '{"mc1": 1}'),   'Producto inválido', 'ítem de otro tipo');
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, v_w, 'fruver', '{"nada": 1}'),  'Producto inválido', 'ítem inexistente');
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, v_w, 'fruver', '{"mf1": -1}'),  'Cantidades inválidas', 'cantidad negativa');
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, v_w, 'fruver', '{"mf1": "2"}'), 'Cantidades inválidas', 'cantidad como texto');
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, v_w, 'fruver', '{"mf1": 100001}'), 'Cantidades inválidas', 'cantidad absurda');
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, v_w, 'fruver', '[1,2]'),         'Cantidades inválidas', 'arreglo en vez de objeto');
  perform tst.raises(format('select market_list_save(%L, %L, %L, null)', v_a, v_w, 'fruver'),                'Cantidades inválidas', 'cantidades nulas');
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, v_w, 'panaderia', '{}'),        'Tipo de lista inválido', 'la panadería no es un tipo de lista');
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, '2026-10-06', 'fruver', '{}'),  'Semana inválida', 'semana que no es lunes');
end $$;

-- Un ítem desactivado ya no se ofrece ni se acepta.
reset role;
update market_items set is_active = false where id = 'mf3';
set role anon;
do $$
declare v_a text := current_setting('tst.tok_a'); v_w text := current_setting('tst.future');
begin
  perform tst.ok((select count(*) from market_catalog(v_a)) = 284, 'el ítem desactivado sale del catálogo');
  perform tst.raises(format('select market_list_save(%L, %L, %L, %L)', v_a, v_w, 'fruver', '{"mf3": 1}'), 'Producto inválido', 'ítem desactivado');
end $$;
reset role;
update market_items set is_active = true where id = 'mf3';
set role anon;

-- ===========================================================================
-- Enviar
-- ===========================================================================
do $$
declare
  v_a text := current_setting('tst.tok_a');
  v_c text := current_setting('tst.tok_c');
  v_w date := current_setting('tst.future')::date;
begin
  -- C no tiene participantes
  perform market_list_save(v_c, v_w, 'fruver', '{"mf1": 1}');
  perform tst.raises(format('select market_list_submit(%L, %L)', v_c, v_w), 'PARTICIPANTES_REQUERIDOS', 'enviar sin participantes');
  -- Sin nada pedido en ninguna lista
  perform tst.raises(format('select market_list_submit(%L, %L)', v_a, '2099-01-05'), 'LISTA_VACIA', 'enviar con las 4 listas vacías');
  perform tst.raises(format('select market_list_submit(%L, %L)', v_a, '2026-10-06'), 'Semana inválida', 'enviar una semana que no es lunes');
end $$;

reset role;
do $$ begin
  perform tst.ok((select count(*) from market_lists where community = 'ZZZ_TEST_mkt_A' and week_start = '2099-01-05') = 0,
                 'un envío vacío rechazado no deja filas a medias');
end $$;
set role anon;

do $$
declare
  v_a text := current_setting('tst.tok_a');
  v_w date := current_setting('tst.future')::date;
  r jsonb;
begin
  -- A pide fruver (ya guardado: {"mf1": 4}) y carnes.
  perform market_list_save(v_a, v_w, 'carnes', '{"mc1": 12, "mc13": 1}');
  r := market_list_submit(v_a, v_w);
  perform tst.ok((r ->> 'late')::boolean = false, 'un envío dentro del plazo no es tardío');
  perform tst.ok((r ->> 'changed_after_deadline')::boolean = false, 'no cambió después del plazo');

  r := market_list_load(v_a, v_w);
  perform tst.ok(jsonb_array_length(r -> 'lists') = 4, 'el envío registra las 4 listas (las vacías como "no pedí")');
  perform tst.ok((select bool_and((e ->> 'sent')::boolean) from jsonb_array_elements(r -> 'lists') e), 'las 4 quedan enviadas');
  perform tst.ok((select bool_and((e ->> 'submit_count')::int = 1) from jsonb_array_elements(r -> 'lists') e), 'contador en 1');
  perform tst.ok((select bool_and(not (e ->> 'modified')::boolean) from jsonb_array_elements(r -> 'lists') e), 'nada modificado');
  perform tst.ok((select e -> 'quantities' from jsonb_array_elements(r -> 'lists') e where e ->> 'kind' = 'abarrotes') = '{}'::jsonb, 'abarrotes va vacío');
end $$;

-- La copia de participantes se hace al enviar: cambiarlos después no altera lo enviado.
reset role;
do $$ begin
  perform tst.ok((select bool_and(participants = 11) from market_lists
                   where community = 'ZZZ_TEST_mkt_A' and week_start = current_setting('tst.future')::date),
                 'las listas enviadas guardan los 11 participantes vigentes');
  update market_lists set reviewed_at = now() where community = 'ZZZ_TEST_mkt_A' and week_start = current_setting('tst.future')::date;
end $$;
set role anon;

do $$
declare
  v_a text := current_setting('tst.tok_a');
  v_w date := current_setting('tst.future')::date;
  r jsonb;
begin
  perform market_set_participants(v_a, 12);
  -- Editar después de enviar: queda "modificada" pero lo enviado no cambia.
  perform market_list_save(v_a, v_w, 'carnes', '{"mc1": 24, "mc13": 1}');
  r := market_list_load(v_a, v_w);
  perform tst.ok((select (e ->> 'modified')::boolean from jsonb_array_elements(r -> 'lists') e where e ->> 'kind' = 'carnes'), 'carnes quedó modificada');
  perform tst.ok((select not (e ->> 'modified')::boolean from jsonb_array_elements(r -> 'lists') e where e ->> 'kind' = 'fruver'), 'fruver no');

  -- Reenviar: sube el contador, aplica los cambios, sigue a tiempo.
  r := market_list_submit(v_a, v_w);
  perform tst.ok((r ->> 'late')::boolean = false and (r ->> 'changed_after_deadline')::boolean = false, 'reenvío en plazo: ni tardío ni cambiado tras el plazo');
  r := market_list_load(v_a, v_w);
  perform tst.ok((select bool_and((e ->> 'submit_count')::int = 2) from jsonb_array_elements(r -> 'lists') e), 'contador en 2');
  perform tst.ok((select bool_and(not (e ->> 'modified')::boolean) from jsonb_array_elements(r -> 'lists') e), 'ya nada modificado');
end $$;

reset role;
do $$
declare
  v_w date := current_setting('tst.future')::date;
begin
  perform tst.ok((select bool_and(participants = 12) from market_lists where community = 'ZZZ_TEST_mkt_A' and week_start = v_w),
                 'al reenviar se copian los participantes nuevos (12)');
  -- carnes cambió -> se limpió su revisión; fruver no cambió -> conserva la revisión
  perform tst.ok((select reviewed_at is null from market_lists where community = 'ZZZ_TEST_mkt_A' and week_start = v_w and kind = 'carnes'),
                 'reenviar con cambios vuelve a "sin revisar"');
  perform tst.ok((select reviewed_at is not null from market_lists where community = 'ZZZ_TEST_mkt_A' and week_start = v_w and kind = 'fruver'),
                 'reenviar sin cambios conserva la revisión');
end $$;
set role anon;

-- ===========================================================================
-- Envíos tardíos (semana pasada del calendario: viernes 2 ene 2026, plazo vencido)
-- ===========================================================================
do $$
declare
  v_b text := current_setting('tst.tok_b');
  r jsonb;
begin
  perform market_list_save(v_b, '2026-01-05', 'fruver', '{"mf1": 1}');
  r := market_list_submit(v_b, '2026-01-05');
  perform tst.ok((r ->> 'late')::boolean = true, 'el primer envío después del plazo es tardío');
  perform tst.ok((r ->> 'changed_after_deadline')::boolean = false, 'el primer envío no es "cambiado tras el plazo"');

  -- Reenviar SIN cambios no agrega nada
  r := market_list_submit(v_b, '2026-01-05');
  perform tst.ok((r ->> 'changed_after_deadline')::boolean = false, 'reenviar igual no es un cambio');

  -- Reenviar CON cambios después del plazo sí se marca
  perform market_list_save(v_b, '2026-01-05', 'fruver', '{"mf1": 3}');
  r := market_list_submit(v_b, '2026-01-05');
  perform tst.ok((r ->> 'changed_after_deadline')::boolean = true, 'reenviar con cambios tras el plazo se marca');
  perform tst.ok((r ->> 'late')::boolean = true, 'sigue siendo tardía');
end $$;

-- Una lista a tiempo no se vuelve tardía al reenviarla después (se juzga el primer envío).
reset role;
update market_lists set late = false, first_submitted_at = now() - interval '2 days'
 where community = 'ZZZ_TEST_mkt_B' and week_start = '2026-01-05';
set role anon;
do $$
declare v_b text := current_setting('tst.tok_b'); r jsonb;
begin
  r := market_list_submit(v_b, '2026-01-05');
  perform tst.ok((r ->> 'late')::boolean = false, 'un reenvío tardío no vuelve tardía una lista que llegó a tiempo');
end $$;

-- ===========================================================================
-- Aislamiento entre comunidades y borrado
-- ===========================================================================
do $$
declare
  v_b text := current_setting('tst.tok_b');
  v_w date := current_setting('tst.future')::date;
  r jsonb;
begin
  r := market_list_load(v_b, v_w);
  perform tst.ok(r -> 'lists' = '[]'::jsonb, 'B no ve las listas de A');
  perform market_list_save(v_b, v_w, 'aseo', '{"ms1": 2}');
  r := market_list_load(current_setting('tst.tok_a'), v_w);
  perform tst.ok(not exists (select 1 from jsonb_array_elements(r -> 'lists') e where e ->> 'kind' = 'aseo' and e -> 'quantities' <> '{}'::jsonb),
                 'lo que guarda B no aparece en A');
end $$;

reset role;
do $$ begin
  perform tst.ok((select count(*) from market_lists where community like 'ZZZ\_TEST\_mkt\_%') > 0, 'hay listas de prueba');
  delete from communities where name like 'ZZZ\_TEST\_mkt\_%';
  perform tst.ok((select count(*) from market_lists where community like 'ZZZ\_TEST\_mkt\_%') = 0, 'borrar la comunidad borra sus listas (cleanup_test_data.sql)');
end $$;

drop schema tst cascade;
\echo 'market_lists: OK'
