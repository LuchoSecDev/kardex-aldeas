-- Pruebas de supabase/market_replies_1..4.sql (plan 008, Fase D: la nutricionista responde a los cambios y la comunidad
-- recibe una campanita) contra un Postgres local. Las llamadas se hacen como el rol `anon`, igual que la app.

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

-- La nota `id` de la lista `kind` de una semana, tal como la ve la nutricionista (con su respuesta).
create function tst.admin_note(adm text, community text, wk date, p_kind text, nid text) returns jsonb language sql as $$
  select c from jsonb_array_elements(
           (select l -> 'changes' from jsonb_array_elements(admin_market_list(adm, community, wk) -> 'lists') l where l ->> 'kind' = p_kind)
         ) c where c ->> 'id' = nid
$$;
-- Las respuestas de una lista, tal como las ve la comunidad.
create function tst.my_replies(tok text, wk date, p_kind text) returns jsonb language sql as $$
  select l -> 'replies' from jsonb_array_elements(market_list_load(tok, wk) -> 'lists') l where l ->> 'kind' = p_kind
$$;
create function tst.unseen(tok text) returns int language sql as $$ select count(*)::int from market_replies_unseen(tok) $$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text), tst.admin_note(text, text, date, text, text),
  tst.my_replies(text, date, text), tst.unseen(text) to anon;

insert into admin_account (id, password_hash, must_change) values (1, 'no-se-usa', false)
  on conflict (id) do update set must_change = false;
insert into admin_sessions (token_hash, expires_at)
  values (encode(sha256(convert_to('token-admin-respuestas', 'UTF8')), 'hex'), now() + interval '1 hour');

\i tests/db/provision_key.sql
set role anon;
do $$
begin
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_rep_A', '4321');
  perform provision_community('clave-de-prueba', 'ZZZ_TEST_rep_B', '4321');
  perform set_config('tst.a', login_community('ZZZ_TEST_rep_A', '4321'), false);
  perform set_config('tst.b', login_community('ZZZ_TEST_rep_B', '4321'), false);
  perform set_config('tst.adm', 'token-admin-respuestas', false);
  perform market_set_participants(current_setting('tst.a'), 10);
  perform market_set_participants(current_setting('tst.b'), 8);
  perform set_config('tst.wk', (date_trunc('week', now() + interval '400 days'))::date::text, false);
  perform set_config('tst.wk2', (date_trunc('week', now() + interval '407 days'))::date::text, false);
  perform set_config('tst.carne', (select c.id from market_catalog(current_setting('tst.a')) c where c.kind = 'carnes' order by c.sort_order limit 1), false);
  -- A envía su lista con dos notas (una con producto) en carnes; B envía una nota en carnes.
  perform market_list_save(current_setting('tst.a'), current_setting('tst.wk')::date, 'carnes', jsonb_build_object(current_setting('tst.carne'), 2));
  perform market_list_save_changes(current_setting('tst.a'), current_setting('tst.wk')::date, 'carnes', jsonb_build_array(
    jsonb_build_object('id', 'n1', 'item_id', current_setting('tst.carne'), 'text', 'Cambiar pescado por pechuga'),
    jsonb_build_object('id', 'n2', 'item_id', null, 'text', 'Entregar temprano')));
  perform market_list_submit(current_setting('tst.a'), current_setting('tst.wk')::date);
  perform market_list_save(current_setting('tst.b'), current_setting('tst.wk')::date, 'carnes', jsonb_build_object(current_setting('tst.carne'), 1));
  perform market_list_save_changes(current_setting('tst.b'), current_setting('tst.wk')::date, 'carnes', jsonb_build_array(jsonb_build_object('id', 'n1', 'item_id', null, 'text', 'Nota de B')));
  perform market_list_submit(current_setting('tst.b'), current_setting('tst.wk')::date);
end $$;

-- ===========================================================================
-- Permisos y sesión
-- ===========================================================================
do $$
declare
  w text := current_setting('tst.wk');
  q text := 'select admin_market_reply(%L, %L, %L, %L, %L, %L)';
begin
  perform tst.raises('select * from market_change_replies', 'permission denied', 'anon no lee la tabla de respuestas');
  perform tst.raises(format(q, 'token-falso', 'ZZZ_TEST_rep_A', w, 'carnes', 'n1', 'ok'), 'SESION_ADMIN_INVALIDA', 'token falso');
  perform tst.raises(format(q, current_setting('tst.a'), 'ZZZ_TEST_rep_A', w, 'carnes', 'n1', 'ok'), 'SESION_ADMIN_INVALIDA', 'un token de COMUNIDAD no puede responder');
  perform tst.raises(format('select * from market_replies_unseen(%L)', current_setting('tst.adm')), 'SESION_INVALIDA', 'un token de administradora no abre la campanita de una comunidad');
  perform tst.raises($q$select * from market_replies_unseen('token-falso')$q$, 'SESION_INVALIDA', 'token falso en la campanita');
  perform tst.raises(format('select market_replies_mark_seen(%L, %L)', current_setting('tst.adm'), w), 'SESION_INVALIDA', 'un token de administradora no marca leídas');
end $$;

-- ===========================================================================
-- Responder: solo a notas ENVIADAS que existen
-- ===========================================================================
do $$
declare
  adm text := current_setting('tst.adm');
  w text := current_setting('tst.wk');
  q text := 'select admin_market_reply(%L, %L, %L, %L, %L, %L)';
begin
  perform tst.raises(format(q, adm, 'ZZZ_TEST_rep_A', w, 'carnes', 'no-existe', 'ok'), 'Cambio no encontrado', 'nota inexistente');
  perform tst.raises(format(q, adm, 'ZZZ_TEST_rep_A', w, 'fruver', 'n1', 'ok'), 'Cambio no encontrado', 'la nota es de otro tipo de lista');
  perform tst.raises(format(q, adm, 'ZZZ_TEST_rep_B', w, 'carnes', 'n2', 'ok'), 'Cambio no encontrado', 'la nota es de otra comunidad');
  perform tst.raises(format(q, adm, 'ZZZ_TEST_rep_A', w, 'panaderia', 'n1', 'ok'), 'Tipo de lista inválido', 'tipo inválido');
  perform tst.raises(format(q, adm, 'ZZZ_TEST_rep_A', (current_setting('tst.wk')::date + 1)::text, 'carnes', 'n1', 'ok'), 'Semana inválida', 'semana que no es lunes');
  perform tst.raises(format(q, adm, 'ZZZ_TEST_rep_A', w, 'carnes', 'n1', repeat('a', 201)), 'Respuesta inválida', 'respuesta de 201 caracteres');
  -- Una nota escrita pero NO enviada todavía no se puede responder.
  perform market_list_save_changes(current_setting('tst.a'), w::date, 'carnes', jsonb_build_array(
    jsonb_build_object('id', 'n1', 'item_id', current_setting('tst.carne'), 'text', 'Cambiar pescado por pechuga'),
    jsonb_build_object('id', 'n2', 'item_id', null, 'text', 'Entregar temprano'),
    jsonb_build_object('id', 'n3', 'item_id', null, 'text', 'Borrador sin enviar')));
  perform tst.raises(format(q, adm, 'ZZZ_TEST_rep_A', w, 'carnes', 'n3', 'ok'), 'Cambio no encontrado', 'una nota sin enviar no se responde');
  perform market_list_save_changes(current_setting('tst.a'), w::date, 'carnes', jsonb_build_array(
    jsonb_build_object('id', 'n1', 'item_id', current_setting('tst.carne'), 'text', 'Cambiar pescado por pechuga'),
    jsonb_build_object('id', 'n2', 'item_id', null, 'text', 'Entregar temprano')));
end $$;

-- ===========================================================================
-- Flujo completo: responde la nutricionista, la ve la comunidad, la campanita, marcar leída
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  b text := current_setting('tst.b');
  adm text := current_setting('tst.adm');
  w text := current_setting('tst.wk');
  n jsonb;
  u record;
begin
  perform tst.ok(tst.unseen(a) = 0, 'sin respuestas, la campanita está vacía');
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n1', E'  Se envía   pechuga,\nno hay pescado  ');

  n := tst.admin_note(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n1');
  perform tst.ok(n -> 'reply' ->> 'text' = 'Se envía pechuga, no hay pescado', 'la nutricionista ve su respuesta, con el texto limpio');
  perform tst.ok(jsonb_typeof(tst.admin_note(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n2') -> 'reply') = 'null', 'la nota sin respuesta trae reply null');

  perform tst.ok(jsonb_array_length(tst.my_replies(a, w::date, 'carnes')) = 1, 'la comunidad ve 1 respuesta en su lista de carnes');
  perform tst.ok(tst.my_replies(a, w::date, 'carnes') -> 0 ->> 'change_id' = 'n1' and tst.my_replies(a, w::date, 'carnes') -> 0 ->> 'text' = 'Se envía pechuga, no hay pescado', 'es la de la nota n1');
  perform tst.ok((tst.my_replies(a, w::date, 'carnes') -> 0 ->> 'seen')::boolean is false, 'y llega sin leer');
  perform tst.ok(tst.my_replies(a, w::date, 'carnes') -> 0 ->> 'change_text' = 'Cambiar pescado por pechuga', 'guarda el texto de la nota a la que respondió');
  perform tst.ok(jsonb_array_length(tst.my_replies(b, w::date, 'carnes')) = 0, 'otra comunidad NO ve las respuestas de A');

  select * into u from market_replies_unseen(a);
  perform tst.ok(tst.unseen(a) = 1 and u.change_id = 'n1' and u.kind = 'carnes' and u.week_start = w::date, 'la campanita muestra esa respuesta');
  perform tst.ok(u.change_text = 'Cambiar pescado por pechuga' and u.reply_text = 'Se envía pechuga, no hay pescado' and u.item_name is not null, 'con la nota, el producto y la respuesta');
  perform tst.ok(tst.unseen(b) = 0, 'la campanita de otra comunidad no la ve');

  perform market_replies_mark_seen(b, w::date);
  perform tst.ok(tst.unseen(a) = 1, 'marcar leídas en OTRA comunidad no toca las de A');
  perform market_replies_mark_seen(a, (w::date + 7));
  perform tst.ok(tst.unseen(a) = 1, 'marcar leídas de OTRA semana no toca esta');
  perform market_replies_mark_seen(a, w::date);
  perform tst.ok(tst.unseen(a) = 0, 'marcar leída vacía la campanita');
  perform tst.ok((tst.my_replies(a, w::date, 'carnes') -> 0 ->> 'seen')::boolean is true, 'y la respuesta queda como leída');
  perform tst.raises(format('select market_replies_mark_seen(%L, %L)', a, (w::date + 1)::text), 'Semana inválida', 'semana que no es lunes');
end $$;

-- ===========================================================================
-- Editar la respuesta, quitarla y casos de borde
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  adm text := current_setting('tst.adm');
  w text := current_setting('tst.wk');
begin
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n1', 'Se envía pechuga, no hay pescado');
  perform tst.ok(tst.unseen(a) = 0, 'repetir EXACTAMENTE la misma respuesta no la vuelve «sin leer»');
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n1', 'Se envía pavo, no hay pescado ni pechuga');
  perform tst.ok(tst.unseen(a) = 1, 'editar la respuesta la deja «sin leer» otra vez');
  perform tst.ok(tst.admin_note(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n1') -> 'reply' ->> 'text' = 'Se envía pavo, no hay pescado ni pechuga', 'la edición reemplaza (no hay dos respuestas)');
  perform tst.ok((select count(*) from market_replies_unseen(a)) = 1, 'sigue habiendo una sola respuesta por nota');

  -- 200 caracteres exactos se aceptan.
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n2', repeat('a', 200));
  perform tst.ok(tst.unseen(a) = 2, 'una respuesta de 200 caracteres se acepta');

  -- Si la comunidad cambia el texto de la nota, la respuesta conserva el de la versión a la que respondió.
  perform market_list_save_changes(a, w::date, 'carnes', jsonb_build_array(
    jsonb_build_object('id', 'n1', 'item_id', current_setting('tst.carne'), 'text', 'Otra cosa distinta'),
    jsonb_build_object('id', 'n2', 'item_id', null, 'text', 'Entregar temprano')));
  perform tst.ok(tst.my_replies(a, w::date, 'carnes') -> 0 ->> 'change_text' = 'Cambiar pescado por pechuga', 'la respuesta recuerda la versión anterior de la nota');

  -- Si la comunidad BORRA la nota, su respuesta deja de contar en la campanita.
  perform market_list_save_changes(a, w::date, 'carnes', jsonb_build_array(jsonb_build_object('id', 'n2', 'item_id', null, 'text', 'Entregar temprano')));
  perform tst.ok(tst.unseen(a) = 1, 'una nota borrada ya no suma a la campanita');

  -- Un texto vacío quita la respuesta; quitar una que no existe no falla.
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n2', '   ');
  perform tst.ok(jsonb_typeof(tst.admin_note(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n2') -> 'reply') = 'null', 'un texto vacío quita la respuesta');
  perform tst.ok(tst.unseen(a) = 0, 'y sale de la campanita');
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w::date, 'carnes', 'n2', null);
end $$;

-- ===========================================================================
-- Marcar leídas por tipo de lista: ver las de carnes no marca las de fruver
-- ===========================================================================
do $$
declare
  a text := current_setting('tst.a');
  adm text := current_setting('tst.adm');
  w date := current_setting('tst.wk')::date;
begin
  perform market_list_save_changes(a, w, 'fruver', jsonb_build_array(jsonb_build_object('id', 'f1', 'item_id', null, 'text', 'Fruta madura')));
  perform market_list_submit(a, w);
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w, 'carnes', 'n2', 'Llega a las 8');
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w, 'fruver', 'f1', 'Se envía madura');
  perform tst.ok(tst.unseen(a) = 2, 'una respuesta en carnes y otra en fruver: 2 sin leer');

  perform market_replies_mark_seen(a, w, 'carnes');
  perform tst.ok(tst.unseen(a) = 1 and (select kind from market_replies_unseen(a)) = 'fruver', 'marcar leídas SOLO de carnes deja la de fruver sin leer');
  perform market_replies_mark_seen(a, w, 'fruver');
  perform tst.ok(tst.unseen(a) = 0, 'y luego la de fruver');

  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w, 'carnes', 'n2', 'Llega a las 9');
  perform admin_market_reply(adm, 'ZZZ_TEST_rep_A', w, 'fruver', 'f1', 'Se envía verde');
  perform market_replies_mark_seen(a, w);
  perform tst.ok(tst.unseen(a) = 0, 'sin indicar el tipo se marcan las de toda la semana');
end $$;

-- ===========================================================================
-- Solo se muestran los últimos 120 días
-- ===========================================================================
reset role;
insert into market_lists (community, week_start, kind, quantities, sent_quantities, changes, sent_changes)
values ('ZZZ_TEST_rep_B', (date_trunc('week', now() - interval '200 days'))::date, 'carnes', '{}', '{}',
        '[{"id":"v1","item_id":null,"text":"vieja"}]', '[{"id":"v1","item_id":null,"text":"vieja"}]');
insert into market_change_replies (community, week_start, kind, change_id, change_text, text)
values ('ZZZ_TEST_rep_B', (date_trunc('week', now() - interval '200 days'))::date, 'carnes', 'v1', 'vieja', 'respuesta vieja');
set role anon;
do $$ begin
  perform tst.ok(tst.unseen(current_setting('tst.b')) = 0, 'una respuesta de hace más de 120 días no aparece en la campanita');
end $$;
reset role;

delete from market_lists where community like 'ZZZ_TEST_rep_%';
delete from communities where name like 'ZZZ_TEST_rep_%';
do $$ begin
  if exists (select 1 from market_change_replies where community like 'ZZZ_TEST_rep_%') then
    raise exception 'FALLÓ: al borrar la comunidad deben borrarse sus respuestas';
  end if;
end $$;
drop schema tst cascade;
\echo market_replies: OK
