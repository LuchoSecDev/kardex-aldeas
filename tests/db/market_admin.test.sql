-- Pruebas de supabase/market_admin_1..3.sql (plan 003, Fase C) contra un Postgres local.
-- La nutricionista lee lo que envían las comunidades, marca revisado y ve la campanita.
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

-- Sesión de administradora (como dueño: anon no puede tocar estas tablas).
insert into admin_account (id, password_hash, must_change) values (1, 'no-se-usa', false)
  on conflict (id) do update set must_change = false;
insert into admin_sessions (token_hash, expires_at)
  values (encode(sha256(convert_to('token-admin-prueba', 'UTF8')), 'hex'), now() + interval '1 hour');

set role anon;
do $$ begin
  perform create_community_with_pin('ZZZ_TEST_adm_A', '4321');
  perform create_community_with_pin('ZZZ_TEST_adm_B', '4321');
  perform create_community_with_pin('ZZZ_TEST_adm_C', '4321');
  perform set_config('tst.tok_a', login_community('ZZZ_TEST_adm_A', '4321'), false);
  perform set_config('tst.tok_b', login_community('ZZZ_TEST_adm_B', '4321'), false);
  perform set_config('tst.tok_c', login_community('ZZZ_TEST_adm_C', '4321'), false);
  perform set_config('tst.adm', 'token-admin-prueba', false);
  -- Semana futura (lunes): el plazo nunca está vencido.
  perform set_config('tst.w', (date_trunc('week', now() + interval '400 days'))::date::text, false);
  perform market_set_participants(current_setting('tst.tok_a'), 11);
  perform market_set_participants(current_setting('tst.tok_b'), 9);
  perform market_set_participants(current_setting('tst.tok_c'), 7);
  -- A: fruver (mf1 2.5, mf3 4), carnes (mc1 12) y ENVÍA.
  perform market_list_save(current_setting('tst.tok_a'), current_setting('tst.w')::date, 'fruver', '{"mf3": 4, "mf1": 2.5}');
  perform market_list_save(current_setting('tst.tok_a'), current_setting('tst.w')::date, 'carnes', '{"mc1": 12}');
  perform market_list_submit(current_setting('tst.tok_a'), current_setting('tst.w')::date);
  -- B: solo un borrador (no envía).
  perform market_list_save(current_setting('tst.tok_b'), current_setting('tst.w')::date, 'aseo', '{"ms1": 1}');
end $$;

-- ===========================================================================
-- Acceso: solo la administradora
-- ===========================================================================
do $$
declare v_w text := current_setting('tst.w');
begin
  perform tst.raises(format('select admin_market_overview(%L, %L)', 'token-falso', v_w), 'SESION_ADMIN_INVALIDA', 'overview con token falso');
  perform tst.raises(format('select admin_market_overview(%L, %L)', current_setting('tst.tok_a'), v_w), 'SESION_ADMIN_INVALIDA', 'un token de COMUNIDAD no sirve en overview');
  perform tst.raises(format('select admin_market_list(%L, %L, %L)', current_setting('tst.tok_a'), 'ZZZ_TEST_adm_A', v_w), 'SESION_ADMIN_INVALIDA', 'un token de comunidad no sirve en el detalle');
  perform tst.raises(format('select admin_market_mark_reviewed(%L, %L, %L)', current_setting('tst.tok_a'), 'ZZZ_TEST_adm_A', v_w), 'SESION_ADMIN_INVALIDA', 'una comunidad no puede marcarse como revisada');
  perform tst.raises(format('select * from admin_market_notifications(%L)', current_setting('tst.tok_a')), 'SESION_ADMIN_INVALIDA', 'un token de comunidad no sirve en la campanita');
  perform tst.raises(format('select * from admin_market_notifications(null)'), 'SESION_ADMIN_INVALIDA', 'sin token');
  -- y al revés: el token de administradora no sirve para las funciones de la comunidad
  perform tst.raises(format('select market_list_load(%L, %L)', current_setting('tst.adm'), v_w), 'SESION_INVALIDA', 'el token de admin no sirve en la comunidad');
end $$;

-- ===========================================================================
-- Resumen de la semana
-- ===========================================================================
do $$
declare
  v_w text := current_setting('tst.w');
  v jsonb;
  ra jsonb; rb jsonb; rc jsonb;
begin
  v := admin_market_overview(current_setting('tst.adm'), v_w::date);
  perform tst.ok(v ->> 'week_start' = v_w, 'la semana del resumen');
  perform tst.ok((v ->> 'friday')::date = v_w::date - 3, 'el viernes de pedido es lunes - 3');

  select e into ra from jsonb_array_elements(v -> 'communities') e where e ->> 'community' = 'ZZZ_TEST_adm_A';
  select e into rb from jsonb_array_elements(v -> 'communities') e where e ->> 'community' = 'ZZZ_TEST_adm_B';
  select e into rc from jsonb_array_elements(v -> 'communities') e where e ->> 'community' = 'ZZZ_TEST_adm_C';

  perform tst.ok((ra ->> 'sent')::boolean, 'A envió');
  perform tst.ok(ra -> 'counts' = '{"fruver": 2, "carnes": 1, "abarrotes": 0, "aseo": 0}'::jsonb, 'A: 2 de fruver y 1 de carnes');
  perform tst.ok((ra ->> 'participants')::int = 11, 'A: 11 participantes');
  perform tst.ok(not (ra ->> 'late')::boolean and not (ra ->> 'reviewed')::boolean and not (ra ->> 'has_unsent_changes')::boolean, 'A: a tiempo, sin revisar, sin cambios');
  perform tst.ok((ra ->> 'submit_count')::int = 1, 'A: un envío');

  perform tst.ok(not (rb ->> 'sent')::boolean and (rb ->> 'has_draft')::boolean, 'B solo tiene borrador');
  perform tst.ok(rb -> 'counts' = '{"fruver": 0, "carnes": 0, "abarrotes": 0, "aseo": 0}'::jsonb, 'el borrador no cuenta: solo lo enviado');
  perform tst.ok(not (rc ->> 'sent')::boolean and not (rc ->> 'has_draft')::boolean, 'C no ha hecho nada');
  perform tst.ok((rc ->> 'participants')::int = 7, 'C muestra sus participantes vigentes');

  perform tst.raises(format('select admin_market_overview(%L, %L)', current_setting('tst.adm'), '2026-10-06'), 'Semana inválida', 'semana que no es lunes');
  perform tst.ok(jsonb_array_length(admin_market_overview(current_setting('tst.adm'), '2099-02-02') -> 'communities') >= 3, 'incluye todas las comunidades aunque nadie haya enviado');
end $$;

-- Editar después de enviar: el resumen sigue mostrando lo ENVIADO y avisa que hay cambios.
do $$
declare
  v jsonb; ra jsonb;
begin
  perform market_list_save(current_setting('tst.tok_a'), current_setting('tst.w')::date, 'carnes', '{"mc1": 24, "mc2": 6}');
  v := admin_market_overview(current_setting('tst.adm'), current_setting('tst.w')::date);
  select e into ra from jsonb_array_elements(v -> 'communities') e where e ->> 'community' = 'ZZZ_TEST_adm_A';
  perform tst.ok((ra ->> 'has_unsent_changes')::boolean, 'A tiene cambios sin enviar');
  perform tst.ok((ra -> 'counts' ->> 'carnes')::int = 1, 'pero se sigue viendo lo enviado (1 producto de carnes)');
  perform market_list_save(current_setting('tst.tok_a'), current_setting('tst.w')::date, 'carnes', '{"mc1": 12}');
end $$;

-- ===========================================================================
-- Detalle de una lista
-- ===========================================================================
do $$
declare
  v jsonb;
  fruver jsonb;
begin
  v := admin_market_list(current_setting('tst.adm'), 'ZZZ_TEST_adm_A', current_setting('tst.w')::date);
  perform tst.ok((v ->> 'sent')::boolean and (v ->> 'participants')::int = 11, 'detalle de A: enviada, 11 participantes');
  perform tst.ok(jsonb_array_length(v -> 'lists') = 4, 'siempre devuelve los 4 tipos');
  perform tst.ok((select array_agg(e ->> 'kind') from jsonb_array_elements(v -> 'lists') e) = array['fruver','carnes','abarrotes','aseo'], 'en el orden de la lista');

  fruver := v -> 'lists' -> 0 -> 'items';
  perform tst.ok(jsonb_array_length(fruver) = 2, 'solo los productos pedidos');
  perform tst.ok(fruver -> 0 ->> 'id' = 'mf1' and fruver -> 1 ->> 'id' = 'mf3', 'en el orden del catálogo (mf1 antes que mf3), no del envío');
  perform tst.ok(fruver -> 0 ->> 'name' = 'ACELGA' and fruver -> 0 ->> 'unit' = 'KG', 'con nombre y unidad');
  perform tst.ok((fruver -> 0 ->> 'quantity')::numeric = 2.5 and (fruver -> 1 ->> 'quantity')::numeric = 4, 'con las cantidades (decimales incluidos)');
  perform tst.ok(jsonb_array_length(v -> 'lists' -> 2 -> 'items') = 0, 'abarrotes: no pidió nada');
  perform tst.ok(not exists (select 1 from jsonb_array_elements(fruver) i, jsonb_object_keys(i) k where k ~* 'price|precio|valor'), 'sin precios');

  v := admin_market_list(current_setting('tst.adm'), 'ZZZ_TEST_adm_B', current_setting('tst.w')::date);
  perform tst.ok(not (v ->> 'sent')::boolean, 'B aún no envió');
  perform tst.ok(not exists (select 1 from jsonb_array_elements(v -> 'lists') l where jsonb_array_length(l -> 'items') > 0), 'y no se le ve el borrador');

  perform tst.raises(format('select admin_market_list(%L, %L, %L)', current_setting('tst.adm'), 'no-existe', current_setting('tst.w')), 'Comunidad no encontrada', 'comunidad inexistente');
end $$;

-- ===========================================================================
-- Revisar y campanita
-- ===========================================================================
do $$
declare
  v_adm text := current_setting('tst.adm');
  v_w date := current_setting('tst.w')::date;
  v_a text := current_setting('tst.tok_a');
  ra jsonb;
begin
  perform tst.ok(exists (select 1 from admin_market_notifications(v_adm) n where n.community = 'ZZZ_TEST_adm_A' and n.week_start = v_w), 'A aparece en la campanita');
  perform tst.ok(not exists (select 1 from admin_market_notifications(v_adm) n where n.community = 'ZZZ_TEST_adm_B'), 'B (solo borrador) no aparece');

  perform admin_market_mark_reviewed(v_adm, 'ZZZ_TEST_adm_A', v_w);
  perform tst.ok(not exists (select 1 from admin_market_notifications(v_adm) n where n.community = 'ZZZ_TEST_adm_A' and n.week_start = v_w), 'revisada: sale de la campanita');
  select e into ra from jsonb_array_elements(admin_market_overview(v_adm, v_w) -> 'communities') e where e ->> 'community' = 'ZZZ_TEST_adm_A';
  perform tst.ok((ra ->> 'reviewed')::boolean, 'el resumen la muestra revisada');

  -- Reenviar SIN cambios: sigue revisada.
  perform market_list_submit(v_a, v_w);
  perform tst.ok(not exists (select 1 from admin_market_notifications(v_adm) n where n.community = 'ZZZ_TEST_adm_A' and n.week_start = v_w), 'reenviar igual no vuelve a avisar');

  -- Reenviar CON cambios: vuelve a la campanita y a "sin revisar".
  perform market_list_save(v_a, v_w, 'carnes', '{"mc1": 30}');
  perform market_list_submit(v_a, v_w);
  perform tst.ok(exists (select 1 from admin_market_notifications(v_adm) n where n.community = 'ZZZ_TEST_adm_A' and n.week_start = v_w and n.submit_count = 3), 'reenviar con cambios vuelve a avisar (envío 3)');
  select e into ra from jsonb_array_elements(admin_market_overview(v_adm, v_w) -> 'communities') e where e ->> 'community' = 'ZZZ_TEST_adm_A';
  perform tst.ok(not (ra ->> 'reviewed')::boolean, 'y queda sin revisar');

  perform tst.raises(format('select admin_market_mark_reviewed(%L, %L, %L)', v_adm, 'ZZZ_TEST_adm_B', v_w), 'Envío no encontrado', 'no se puede revisar lo que no se envió');
  perform tst.raises(format('select admin_market_mark_reviewed(%L, %L, %L)', v_adm, 'no-existe', v_w), 'Envío no encontrado', 'comunidad inexistente');
end $$;

-- ===========================================================================
-- Tardías y ventana de la campanita (semana del 5 de enero de 2026: plazo vencido hace meses)
-- ===========================================================================
do $$
declare
  v_adm text := current_setting('tst.adm');
  rb jsonb;
begin
  perform market_list_save(current_setting('tst.tok_b'), '2026-01-05', 'fruver', '{"mf1": 1}');
  perform market_list_submit(current_setting('tst.tok_b'), '2026-01-05');

  select e into rb from jsonb_array_elements(admin_market_overview(v_adm, '2026-01-05') -> 'communities') e where e ->> 'community' = 'ZZZ_TEST_adm_B';
  perform tst.ok((rb ->> 'sent')::boolean and (rb ->> 'late')::boolean, 'B envió tarde: el resumen lo marca');
  perform tst.ok((admin_market_overview(v_adm, '2026-01-05') ->> 'deadline_at')::timestamptz = '2026-01-02 22:00:00+00', 'con el plazo del viernes 2 de enero');
  perform tst.ok(not exists (select 1 from admin_market_notifications(v_adm) n where n.week_start = '2026-01-05'), 'un envío de hace más de 120 días ya no va a la campanita');
end $$;

-- ===========================================================================
-- Consolidado entre comunidades y catálogo (Fase D)
-- ===========================================================================
do $$
declare
  v_adm text := current_setting('tst.adm');
  v_w date := current_setting('tst.w')::date;
  v_c text := current_setting('tst.tok_c');
begin
  perform tst.raises(format('select * from admin_market_consolidated(%L, %L)', 'token-falso', v_w), 'SESION_ADMIN_INVALIDA', 'consolidado con token falso');
  perform tst.raises(format('select * from admin_market_consolidated(%L, %L)', current_setting('tst.tok_a'), v_w), 'SESION_ADMIN_INVALIDA', 'un token de comunidad no sirve en el consolidado');
  perform tst.raises(format('select * from admin_market_catalog(%L)', current_setting('tst.tok_a')), 'SESION_ADMIN_INVALIDA', 'un token de comunidad no sirve en el catálogo de admin');
  perform tst.raises(format('select * from admin_market_catalog(null)'), 'SESION_ADMIN_INVALIDA', 'catálogo sin token');
  perform tst.raises(format('select * from admin_market_consolidated(%L, %L)', v_adm, '2026-10-06'), 'Semana inválida', 'semana que no es lunes');

  -- C envía fruver con mf1 = 1.5 (A ya envió mf1 = 2.5); B solo tiene borrador.
  perform market_list_save(v_c, v_w, 'fruver', '{"mf1": 1.5}');
  perform market_list_submit(v_c, v_w);

  perform tst.ok((select count(*) from admin_market_consolidated(v_adm, v_w) r where r.community = 'ZZZ_TEST_adm_B') = 0, 'el borrador de B no entra al consolidado');
  -- A edita SIN reenviar: el consolidado sigue mostrando lo enviado (mf3 = 4), no lo editado (9).
  perform market_list_save(current_setting('tst.tok_a'), v_w, 'fruver', '{"mf3": 9, "mf1": 2.5}');
  perform tst.ok((select sum(r.quantity) from admin_market_consolidated(v_adm, v_w) r where r.item_id = 'mf3') = 4, 'el consolidado usa lo ENVIADO, no lo editado sin enviar');
  perform market_list_save(current_setting('tst.tok_a'), v_w, 'fruver', '{"mf3": 4, "mf1": 2.5}');
  perform tst.ok((select count(*) from admin_market_consolidated(v_adm, v_w) r where r.item_id = 'mf1') = 2, 'mf1 lo pidieron dos comunidades (A y C)');
  perform tst.ok((select sum(r.quantity) from admin_market_consolidated(v_adm, v_w) r where r.item_id = 'mf1') = 4, '2,5 + 1,5 = 4');
  perform tst.ok((select array_agg(r.item_id order by r.sort_order) from (select distinct r.item_id, r.sort_order from admin_market_consolidated(v_adm, v_w) r where r.kind = 'fruver') r) = array['mf1', 'mf3'], 'en el orden del catálogo');
  perform tst.ok((select r.name || '/' || r.unit from admin_market_consolidated(v_adm, v_w) r where r.item_id = 'mf1' limit 1) = 'ACELGA/KG', 'con nombre y unidad');
  perform tst.ok((select count(*) from admin_market_consolidated(v_adm, '2099-02-02') r) = 0, 'una semana sin envíos da cero filas');
  perform tst.ok(not exists (select 1 from information_schema.columns where table_name = 'market_items' and column_name ~* 'price|precio|valor'), 'sin precios');

  perform tst.ok((select count(*) from admin_market_catalog(v_adm)) = 285, 'el catálogo de admin trae los 285 ítems');
  perform tst.ok((select count(*) from admin_market_catalog(v_adm) c where c.kind = 'aseo') = 53, '53 de aseo');
end $$;

reset role;
delete from communities where name like 'ZZZ\_TEST\_adm\_%';
delete from admin_sessions where token_hash = encode(sha256(convert_to('token-admin-prueba', 'UTF8')), 'hex');
delete from admin_account where id = 1;
drop schema tst cascade;
\echo 'market_admin: OK'
