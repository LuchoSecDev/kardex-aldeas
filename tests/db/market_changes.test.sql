-- Pruebas de supabase/market_changes_1..6.sql (plan 008, Fase A: zona de cambios de la lista de mercado)
-- contra un Postgres local. Las llamadas se hacen como el rol `anon`, igual que la app con la anon key.

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

-- Atajos: guardar notas (como JSON) y leer la lista de un tipo desde market_list_load.
create function tst.save(tok text, wk date, kind text, changes jsonb) returns void language sql as $$
  select market_list_save_changes(tok, wk, kind, changes)
$$;
create function tst.list(tok text, wk date, p_kind text) returns jsonb language sql as $$
  select l from jsonb_array_elements(market_list_load(tok, wk) -> 'lists') l where l ->> 'kind' = p_kind
$$;
create function tst.notes(n int, p_item text default null) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', 'n' || i, 'item_id', p_item, 'text', 'nota ' || i)), '[]'::jsonb)
    from generate_series(1, n) i
$$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text), tst.save(text, date, text, jsonb),
  tst.list(text, date, text), tst.notes(int, text) to anon;

insert into admin_account (id, password_hash, must_change) values (1, 'no-se-usa', false)
  on conflict (id) do update set must_change = false;
insert into admin_sessions (token_hash, expires_at)
  values (encode(sha256(convert_to('token-admin-cambios', 'UTF8')), 'hex'), now() + interval '1 hour');

\i tests/db/provision_key.sql
set role anon;
do $$
declare
  v_cat text;
begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_chg_A', '4321');
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_chg_B', '4321');
  perform set_config('tst.a', login_community('ZZZ_TEST_chg_A', '4321'), false);
  perform set_config('tst.b', login_community('ZZZ_TEST_chg_B', '4321'), false);
  perform set_config('tst.adm', 'token-admin-cambios', false);
  perform market_set_participants(current_setting('tst.a'), 10);
  perform market_set_participants(current_setting('tst.b'), 8);
  -- Semana futura (lunes): plazo nunca vencido. Semana pasada (lunes): plazo vencido.
  perform set_config('tst.wk', (date_trunc('week', now() + interval '400 days'))::date::text, false);
  perform set_config('tst.past', (date_trunc('week', now() - interval '60 days'))::date::text, false);
  perform set_config('tst.carne', (select c.id from market_catalog(current_setting('tst.a')) c where c.kind = 'carnes' order by c.sort_order limit 1), false);
  perform set_config('tst.carne2', (select c.id from market_catalog(current_setting('tst.a')) c where c.kind = 'carnes' order by c.sort_order offset 1 limit 1), false);
  perform set_config('tst.fruver', (select c.id from market_catalog(current_setting('tst.a')) c where c.kind = 'fruver' order by c.sort_order limit 1), false);
end $$;

-- ===========================================================================
-- Permisos y sesión
-- ===========================================================================
do $$ begin
  perform tst.raises($q$select _market_clean_changes('carnes', '[]', '[]')$q$, 'permission denied', 'la función interna no es pública');
  perform tst.raises('select changes from market_lists', 'permission denied', 'anon no lee las notas directo');
  perform tst.raises($q$select market_list_save_changes('token-falso', '2026-10-05', 'carnes', '[]')$q$, 'SESION_INVALIDA', 'token falso');
  perform tst.raises($q$select market_list_save_changes(null, '2026-10-05', 'carnes', '[]')$q$, 'SESION_INVALIDA', 'sin token');
  -- un token de administradora no sirve para guardar notas de una comunidad
  perform tst.raises(format('select market_list_save_changes(%L, %L, %L, %L)', current_setting('tst.adm'), current_setting('tst.wk'), 'carnes', '[]'),
                     'SESION_INVALIDA', 'token de administradora rechazado');
end $$;

-- ===========================================================================
-- Guardar: limpia el texto, pone la fecha en el servidor y la conserva al editar
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  wk date := current_setting('tst.wk')::date;
  l jsonb;
begin
  perform tst.ok((tst.list(a, wk, 'carnes')) is null, 'sin guardar nada, la semana no tiene lista');

  perform tst.save(a, wk, 'carnes', jsonb_build_array(
    jsonb_build_object('id', 'c1', 'item_id', current_setting('tst.carne'), 'text', E'  Cambiar   pescado\npor   pechuga  ', 'at', '1999-01-01T00:00:00Z'),
    jsonb_build_object('id', 'c2', 'item_id', null, 'text', 'Llega el miércoles')));
  l := tst.list(a, wk, 'carnes');
  perform tst.ok(jsonb_array_length(l -> 'changes') = 2, 'quedan las 2 notas');
  perform tst.ok(l -> 'changes' -> 0 ->> 'text' = 'Cambiar pescado por pechuga', 'el texto se limpia: sin saltos de línea ni espacios repetidos');
  perform tst.ok(l -> 'changes' -> 0 ->> 'item_id' = current_setting('tst.carne'), 'la nota con producto lo conserva');
  perform tst.ok(jsonb_typeof(l -> 'changes' -> 1 -> 'item_id') = 'null', 'la nota general queda con item_id null');
  perform tst.ok((l -> 'changes' -> 0 ->> 'at') <> '1999-01-01T00:00:00Z', 'la fecha la pone el servidor, no el cliente');
  perform tst.ok((l -> 'changes' -> 0 ->> 'at') ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z$', 'la fecha es ISO en UTC');
  perform tst.ok((l ->> 'modified')::boolean is false and (l ->> 'sent')::boolean is false, 'un borrador con notas no está enviado ni modificado');

  -- Las notas no tocan las cantidades ni al revés.
  perform market_list_save(a, wk, 'carnes', jsonb_build_object(current_setting('tst.carne'), 2));
  l := tst.list(a, wk, 'carnes');
  perform tst.ok(jsonb_array_length(l -> 'changes') = 2 and (l -> 'quantities' ->> current_setting('tst.carne'))::numeric = 2, 'guardar cantidades no borra las notas');
  perform tst.save(a, wk, 'carnes', l -> 'changes');
  perform tst.ok((tst.list(a, wk, 'carnes') -> 'quantities' ->> current_setting('tst.carne'))::numeric = 2, 'guardar notas no borra las cantidades');
end $$;

reset role;
update market_lists set changes = jsonb_set(changes, '{0,at}', '"2020-01-01T00:00:00Z"')
 where community = 'ZZZ_TEST_chg_A' and kind = 'carnes';
set role anon;

do $$
declare
  a text := current_setting('tst.a');
  wk date := current_setting('tst.wk')::date;
  l jsonb;
begin
  perform tst.save(a, wk, 'carnes', jsonb_build_array(
    jsonb_build_object('id', 'c1', 'item_id', current_setting('tst.carne'), 'text', 'Mejor pollo'),
    jsonb_build_object('id', 'c3', 'item_id', null, 'text', 'Otra')));
  l := tst.list(a, wk, 'carnes');
  perform tst.ok(l -> 'changes' -> 0 ->> 'text' = 'Mejor pollo' and l -> 'changes' -> 0 ->> 'at' = '2020-01-01T00:00:00Z', 'al editar una nota conserva su fecha original');
  perform tst.ok(l -> 'changes' -> 1 ->> 'at' <> '2020-01-01T00:00:00Z', 'una nota nueva recibe fecha nueva');
  perform tst.ok(jsonb_array_length(l -> 'changes') = 2, 'quitar una nota (c2) la elimina');
  perform tst.save(a, wk, 'carnes', '[]');
  perform tst.ok(jsonb_array_length(tst.list(a, wk, 'carnes') -> 'changes') = 0, 'se pueden quitar todas');
end $$;

-- ===========================================================================
-- Validaciones
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  wk text := current_setting('tst.wk');
  q text := 'select market_list_save_changes(%L, %L, %L, %L::jsonb)';
begin
  perform tst.save(a, wk::date, 'carnes', tst.notes(20));
  perform tst.ok(jsonb_array_length(tst.list(a, wk::date, 'carnes') -> 'changes') = 20, 'exactamente 20 notas se aceptan');
  perform tst.raises(format(q, a, wk, 'carnes', tst.notes(21)), 'DEMASIADOS_CAMBIOS', '21 notas se rechazan');
  perform tst.ok(jsonb_array_length(tst.list(a, wk::date, 'carnes') -> 'changes') = 20, 'el rechazo no cambia lo guardado');
  perform tst.save(a, wk::date, 'fruver', tst.notes(20));
  perform tst.ok(jsonb_array_length(tst.list(a, wk::date, 'fruver') -> 'changes') = 20, 'el tope es por tipo de lista: fruver tiene sus propias 20');
  perform tst.save(a, wk::date, 'carnes', '[]');
  perform tst.save(a, wk::date, 'fruver', '[]');

  perform tst.raises(format(q, a, wk, 'carnes', '[{"id":"x","text":"a"},{"id":"x","text":"b"}]'), 'Cambios inválidos', 'id repetido');
  perform tst.raises(format(q, a, wk, 'carnes', '[{"id":"con espacio","text":"a"}]'), 'Cambios inválidos', 'id con caracteres no permitidos');
  perform tst.raises(format(q, a, wk, 'carnes', '[{"text":"a"}]'), 'Cambios inválidos', 'sin id');
  perform tst.raises(format(q, a, wk, 'carnes', '[{"id":"x","text":""}]'), 'Cambios inválidos', 'texto vacío');
  perform tst.raises(format(q, a, wk, 'carnes', '[{"id":"x","text":"   "}]'), 'Cambios inválidos', 'texto solo de espacios');
  perform tst.raises(format(q, a, wk, 'carnes', jsonb_build_array(jsonb_build_object('id', 'x', 'text', repeat('a', 201)))), 'Cambios inválidos', 'texto de 201 caracteres');
  perform tst.save(a, wk::date, 'carnes', jsonb_build_array(jsonb_build_object('id', 'x', 'text', repeat('a', 200))));
  perform tst.raises(format(q, a, wk, 'carnes', '[{"id":"x","text":5}]'), 'Cambios inválidos', 'texto que no es texto');
  perform tst.raises(format(q, a, wk, 'carnes', '["hola"]'), 'Cambios inválidos', 'elemento que no es objeto');
  perform tst.raises(format(q, a, wk, 'carnes', '{"id":"x"}'), 'Cambios inválidos', 'no es un arreglo');
  perform tst.raises(format('select market_list_save_changes(%L, %L, %L, null)', a, wk, 'carnes'), 'Cambios inválidos', 'nulo');
  perform tst.raises(format(q, a, wk, 'carnes', jsonb_build_array(jsonb_build_object('id', 'x', 'item_id', current_setting('tst.fruver'), 'text', 'a'))), 'Producto inválido', 'producto de otro tipo');
  perform tst.raises(format(q, a, wk, 'carnes', '[{"id":"x","item_id":"no-existe","text":"a"}]'), 'Producto inválido', 'producto inexistente');
  perform tst.raises(format(q, a, wk, 'carnes', '[{"id":"x","item_id":"","text":"a"}]'), 'Producto inválido', 'producto vacío');
  perform tst.raises(format(q, a, wk, 'panaderia', '[]'), 'Tipo de lista inválido', 'tipo inválido');
  perform tst.raises(format(q, a, (current_setting('tst.wk')::date + 1)::text, 'carnes', '[]'), 'Semana inválida', 'semana que no es lunes');
  perform tst.save(a, wk::date, 'carnes', '[]');
end $$;

-- ===========================================================================
-- Aislamiento entre comunidades
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  b text := current_setting('tst.b');
  wk date := current_setting('tst.wk')::date;
begin
  perform tst.save(a, wk, 'carnes', tst.notes(3, current_setting('tst.carne')));
  perform tst.ok(tst.list(b, wk, 'carnes') is null, 'la comunidad B no ve las notas de A');
  perform tst.save(b, wk, 'carnes', tst.notes(1));
  perform tst.ok(jsonb_array_length(tst.list(a, wk, 'carnes') -> 'changes') = 3, 'guardar notas en B no toca las de A');
  perform tst.ok(jsonb_array_length(tst.list(b, wk, 'carnes') -> 'changes') = 1, 'B tiene solo las suyas');
  perform tst.save(b, wk, 'carnes', '[]');
  perform tst.save(a, wk, 'carnes', '[]');
end $$;

-- ===========================================================================
-- Enviar: las notas viajan con la lista y la nutricionista ve lo ENVIADO
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  adm text := current_setting('tst.adm');
  wk date := current_setting('tst.wk')::date;
  d jsonb;
begin
  -- Solo notas, sin cantidades: no es un pedido.
  perform market_list_save(a, wk, 'carnes', '{}');
  perform tst.save(a, wk, 'carnes', tst.notes(1));
  perform tst.raises(format('select market_list_submit(%L, %L)', a, wk::text), 'LISTA_VACIA', 'unas notas solas no son un pedido');

  perform market_list_save(a, wk, 'carnes', jsonb_build_object(current_setting('tst.carne'), 2));
  perform tst.save(a, wk, 'carnes', jsonb_build_array(
    jsonb_build_object('id', 'p1', 'item_id', current_setting('tst.carne'), 'text', 'Pescado por pechuga'),
    jsonb_build_object('id', 'p2', 'item_id', null, 'text', 'Entregar temprano')));
  perform market_list_submit(a, wk);

  perform tst.ok((tst.list(a, wk, 'carnes') ->> 'modified')::boolean is false, 'recién enviada: no está modificada');
  d := admin_market_list(adm, 'ZZZ_TEST_chg_A', wk);
  perform tst.ok(jsonb_array_length(d -> 'lists' -> 1 -> 'changes') = 2, 'la nutricionista ve las 2 notas enviadas en carnes');
  perform tst.ok(d -> 'lists' -> 1 -> 'changes' -> 0 ->> 'text' = 'Pescado por pechuga', 'con su texto');
  perform tst.ok(d -> 'lists' -> 1 -> 'changes' -> 0 ->> 'item_name' is not null and d -> 'lists' -> 1 -> 'changes' -> 0 ->> 'unit' is not null, 'y el nombre y la unidad del producto');
  perform tst.ok(d -> 'lists' -> 1 -> 'changes' -> 1 ->> 'item_name' is null, 'la nota general no trae producto');
  perform tst.ok(jsonb_array_length(d -> 'lists' -> 0 -> 'changes') = 0, 'los otros tipos no traen notas');
  perform tst.ok((select (x ->> 'changes_count')::int from jsonb_array_elements(admin_market_overview(adm, wk) -> 'communities') x where x ->> 'community' = 'ZZZ_TEST_chg_A') = 2, 'el resumen cuenta 2 notas enviadas');
  perform tst.ok((select (x ->> 'changes_count')::int from jsonb_array_elements(admin_market_overview(adm, wk) -> 'communities') x where x ->> 'community' = 'ZZZ_TEST_chg_B') = 0, 'y 0 para una comunidad que no envió');
  perform tst.raises(format('select admin_market_list(%L, %L, %L)', current_setting('tst.a'), 'ZZZ_TEST_chg_A', wk::text), 'SESION_ADMIN_INVALIDA', 'un token de comunidad no abre el detalle');
end $$;

-- ===========================================================================
-- Editar las notas DESPUÉS de enviar: «modificada», sin enviar, y revisada vuelve a pendiente al reenviar
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  adm text := current_setting('tst.adm');
  wk date := current_setting('tst.wk')::date;
  d jsonb;
  r jsonb;
begin
  perform admin_market_mark_reviewed(adm, 'ZZZ_TEST_chg_A', wk);
  perform tst.ok((admin_market_list(adm, 'ZZZ_TEST_chg_A', wk) ->> 'reviewed')::boolean, 'la lista quedó revisada');

  perform tst.save(a, wk, 'carnes', jsonb_build_array(
    jsonb_build_object('id', 'p1', 'item_id', current_setting('tst.carne'), 'text', 'Pescado por pavo')));
  perform tst.ok((tst.list(a, wk, 'carnes') ->> 'modified')::boolean is true, 'editar solo las notas deja carnes «modificada»');
  perform tst.ok((tst.list(a, wk, 'fruver') ->> 'modified')::boolean is false, 'los demás tipos no cambian');

  d := admin_market_list(adm, 'ZZZ_TEST_chg_A', wk);
  perform tst.ok((d ->> 'has_unsent_changes')::boolean is true, 'el detalle avisa que hay cambios sin enviar');
  perform tst.ok(jsonb_array_length(d -> 'lists' -> 1 -> 'changes') = 2 and d -> 'lists' -> 1 -> 'changes' -> 0 ->> 'text' = 'Pescado por pechuga',
                 'la nutricionista sigue viendo lo ENVIADO, no el borrador');
  perform tst.ok((select (x ->> 'has_unsent_changes')::boolean from jsonb_array_elements(admin_market_overview(adm, wk) -> 'communities') x where x ->> 'community' = 'ZZZ_TEST_chg_A'),
                 'el resumen marca cambios sin enviar');
  perform tst.ok((d ->> 'reviewed')::boolean is true, 'mientras no reenvíe, sigue revisada');

  perform market_list_submit(a, wk);
  d := admin_market_list(adm, 'ZZZ_TEST_chg_A', wk);
  perform tst.ok((d ->> 'reviewed')::boolean is false, 'reenviar con notas distintas vuelve la lista a «sin revisar»');
  perform tst.ok(jsonb_array_length(d -> 'lists' -> 1 -> 'changes') = 1 and d -> 'lists' -> 1 -> 'changes' -> 0 ->> 'text' = 'Pescado por pavo', 'y se ven las notas nuevas');
  perform tst.ok((d ->> 'submit_count')::int = 2, 'cuenta el reenvío');
  perform tst.ok((tst.list(a, wk, 'carnes') ->> 'modified')::boolean is false, 'ya no está modificada');
  perform tst.ok(exists (select 1 from admin_market_notifications(adm) n where n.community = 'ZZZ_TEST_chg_A' and n.week_start = wk), 'la campanita la vuelve a mostrar');

  perform admin_market_mark_reviewed(adm, 'ZZZ_TEST_chg_A', wk);
  perform market_list_submit(a, wk);
  perform tst.ok((admin_market_list(adm, 'ZZZ_TEST_chg_A', wk) ->> 'reviewed')::boolean is true, 'reenviar SIN cambios no la vuelve «sin revisar»');
end $$;

-- ===========================================================================
-- Después del plazo: cambiar solo las notas y reenviar marca «cambió después del plazo»
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  pw date := current_setting('tst.past')::date;
  r jsonb;
begin
  perform market_list_save(a, pw, 'carnes', jsonb_build_object(current_setting('tst.carne'), 1));
  perform tst.save(a, pw, 'carnes', tst.notes(1));
  r := market_list_submit(a, pw);
  perform tst.ok((r ->> 'late')::boolean is true and (r ->> 'changed_after_deadline')::boolean is false, 'el primer envío tardío es «tarde», no «cambió después»');
  r := market_list_submit(a, pw);
  perform tst.ok((r ->> 'changed_after_deadline')::boolean is false, 'reenviar igual no marca cambio');
  perform tst.save(a, pw, 'carnes', tst.notes(2));
  r := market_list_submit(a, pw);
  perform tst.ok((r ->> 'changed_after_deadline')::boolean is true, 'cambiar solo las notas después del plazo y reenviar sí lo marca');
end $$;

-- ===========================================================================
-- Casos de borde: filas anteriores a la función, producto desactivado y tope en la tabla
-- ===========================================================================
reset role;
insert into market_lists (community, week_start, kind, quantities, sent_quantities)
values ('ZZZ_TEST_chg_B', (select current_setting('tst.wk')::date), 'aseo', '{}', '{}');
set role anon;
do $$ begin
  perform tst.ok((tst.list(current_setting('tst.b'), current_setting('tst.wk')::date, 'aseo') ->> 'modified')::boolean is false,
                 'una lista enviada antes de existir las notas no aparece como «modificada»');
end $$;

do $$
declare
  a text := current_setting('tst.a');
  wk date := current_setting('tst.wk')::date;
begin
  perform tst.save(a, wk, 'carnes', jsonb_build_array(jsonb_build_object('id', 'z1', 'item_id', current_setting('tst.carne2'), 'text', 'nota')));
end $$;
reset role;
update market_items set is_active = false where id = current_setting('tst.carne2');
set role anon;
do $$
declare
  a text := current_setting('tst.a');
  wk date := current_setting('tst.wk')::date;
begin
  perform tst.ok(tst.list(a, wk, 'carnes') -> 'changes' -> 0 ->> 'item_id' = current_setting('tst.carne2'), 'una nota con un producto que luego se desactivó se sigue leyendo');
  perform tst.raises(format('select market_list_save_changes(%L, %L, %L, %L::jsonb)', a, wk::text, 'carnes', tst.list(a, wk, 'carnes') -> 'changes'),
                     'Producto inválido', 'pero no se puede volver a guardar con ese producto (igual que las cantidades)');
end $$;
reset role;
update market_items set is_active = true where id = current_setting('tst.carne2');

do $$ begin
  begin
    update market_lists set changes = (select jsonb_agg('{}'::jsonb) from generate_series(1, 21)) where community = 'ZZZ_TEST_chg_A';
    raise exception 'FALLÓ: la tabla aceptó 21 notas';
  exception when check_violation then null;
  end;
  begin
    update market_lists set changes = '{}'::jsonb where community = 'ZZZ_TEST_chg_A';
    raise exception 'FALLÓ: la tabla aceptó notas que no son un arreglo';
  exception when check_violation then null;
  end;
end $$;

delete from market_lists where community like 'ZZZ_TEST_chg_%';
delete from communities where name like 'ZZZ_TEST_chg_%';
drop schema tst cascade;
\echo market_changes: OK
