-- Pruebas de supabase/perf_1.sql y perf_2.sql: el atajo de "modificada" debe dar SIEMPRE el
-- mismo resultado que comparar la foto completa (_week_snapshot), solo que más barato.

\set ON_ERROR_STOP on
\set QUIET on

drop schema if exists tst cascade;
create schema tst;
grant usage on schema tst to anon;

create function tst.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function tst.arr(n int, sets jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_agg(coalesce(sets -> i::text, '0'::jsonb) order by i) from generate_series(1, n) i
$$;

-- Lo que debería decir la comparación completa (la definición original).
create function tst.truth(p_community text, p_year int, p_month int, p_week int) returns boolean
language sql security definer as $$
  select s.snapshot is distinct from _week_snapshot(s.community, s.year, s.month, s.week_index)
    from week_submissions s
   where s.community = p_community and s.year = p_year and s.month = p_month and s.week_index = p_week
$$;

grant execute on function tst.ok(boolean, text), tst.arr(int, jsonb) to anon;

insert into admin_account (id, password_hash, must_change) values (1, 'no-se-usa', false)
  on conflict (id) do update set must_change = false;
insert into admin_sessions (token_hash, expires_at)
  values (encode(sha256(convert_to('token-admin-perf', 'UTF8')), 'hex'), now() + interval '1 hour');

-- Las comprobaciones comparan el atajo contra la verdad tras cada paso.
create function tst.check_all(p_step text) returns void language plpgsql as $$
declare
  v_a text := current_setting('tst.a');
  v_kard boolean; v_adm boolean; v_bell boolean; v_truth boolean;
begin
  v_truth := (select tst.truth('ZZZ_TEST_perf', 2026, 7, 0));
  v_kard := (select modified from kardex_week_submissions(v_a, 2026, 7) where week_index = 0);
  v_adm  := (select modified from admin_week_statuses('token-admin-perf', 2026, 7) where community = 'ZZZ_TEST_perf' and week_index = 0);
  v_bell := coalesce((select n.modified from admin_notifications('token-admin-perf') n where n.community = 'ZZZ_TEST_perf'), false);
  perform tst.ok(v_kard = v_truth, p_step || ': kardex_week_submissions coincide con la comparación completa');
  perform tst.ok(v_adm = v_truth,  p_step || ': admin_week_statuses coincide con la comparación completa');
  if v_truth then perform tst.ok(v_bell, p_step || ': la campanita avisa la modificación'); end if;
end $$;
grant execute on function tst.truth(text, int, int, int), tst.check_all(text) to anon;

set role anon;
do $$ begin
  perform create_community_with_pin('ZZZ_TEST_perf', '4321');
  perform set_config('tst.a', login_community('ZZZ_TEST_perf', '4321'), false);
end $$;


-- 1) Enviar → no modificada; guardar cambios → modificada; volver al valor original → no modificada.
do $$
declare v_a text := current_setting('tst.a');
begin
  perform kardex_save_product(v_a, 2026, 7, 'p1', tst.arr(35, '{"1":2}'), tst.arr(5, '{"1":10}'), tst.arr(5));
  perform kardex_save_product(v_a, 2026, 7, 'p2', tst.arr(35), tst.arr(5, '{"1":4}'), tst.arr(5));
  perform kardex_submit_week(v_a, 2026, 7, 0);
  perform tst.check_all('recién enviada');
  perform tst.ok(not tst.truth('ZZZ_TEST_perf', 2026, 7, 0), 'recién enviada no figura modificada');

  perform kardex_save_product(v_a, 2026, 7, 'p1', tst.arr(35, '{"1":3}'), tst.arr(5, '{"1":10}'), tst.arr(5));
  perform tst.check_all('tras editar una salida');
  perform tst.ok(tst.truth('ZZZ_TEST_perf', 2026, 7, 0), 'editar una salida la marca modificada');

  perform kardex_save_product(v_a, 2026, 7, 'p1', tst.arr(35, '{"1":2}'), tst.arr(5, '{"1":10}'), tst.arr(5));
  perform tst.check_all('tras volver al valor original');
  perform tst.ok(not tst.truth('ZZZ_TEST_perf', 2026, 7, 0), 'volver al valor original la deja sin modificar');

  -- guardar el MISMO valor (solo cambia updated_at) no la marca modificada
  perform kardex_save_product(v_a, 2026, 7, 'p1', tst.arr(35, '{"1":2}'), tst.arr(5, '{"1":10}'), tst.arr(5));
  perform tst.check_all('tras guardar sin cambios');

  -- cambios en OTRA semana del mismo mes no afectan a la semana 0
  perform kardex_save_product(v_a, 2026, 7, 'p1', tst.arr(35, '{"1":2,"9":5}'), tst.arr(5, '{"1":10}'), tst.arr(5));
  perform tst.check_all('tras editar otra semana');
  perform tst.ok(not tst.truth('ZZZ_TEST_perf', 2026, 7, 0), 'editar otra semana no modifica la 0');

  -- una fila nueva (producto que antes no tenía movimiento) en la semana enviada
  perform kardex_save_product(v_a, 2026, 7, 'p3', tst.arr(35), tst.arr(5, '{"1":1}'), tst.arr(5));
  perform tst.check_all('tras un producto nuevo');
  perform tst.ok(tst.truth('ZZZ_TEST_perf', 2026, 7, 0), 'un producto nuevo con movimiento la marca modificada');
end $$;

-- 2) Revisar actualiza la foto y deja de estar modificada; editar de nuevo la vuelve a marcar.
do $$
declare
  v_a text := current_setting('tst.a');
  v_id uuid;
begin
  select n.id into v_id from admin_notifications('token-admin-perf') n where n.community = 'ZZZ_TEST_perf';
  perform admin_mark_reviewed('token-admin-perf', v_id);
  perform tst.check_all('recién revisada');
  perform tst.ok(not tst.truth('ZZZ_TEST_perf', 2026, 7, 0), 'revisada no figura modificada');
  perform tst.ok(not exists (select 1 from admin_notifications('token-admin-perf') n where n.community = 'ZZZ_TEST_perf'),
                 'revisada y sin cambios sale de la campanita');

  perform kardex_save_product(v_a, 2026, 7, 'p2', tst.arr(35, '{"2":1}'), tst.arr(5, '{"1":4}'), tst.arr(5));
  perform tst.check_all('editada tras la revisión');
  perform tst.ok(tst.truth('ZZZ_TEST_perf', 2026, 7, 0), 'editar tras revisar la marca modificada');
  perform tst.ok(exists (select 1 from admin_notifications('token-admin-perf') n where n.community = 'ZZZ_TEST_perf' and n.modified),
                 'y vuelve a la campanita');
end $$;

-- 3) Semana 6 (índice 5) también funciona con el atajo.
do $$
declare v_a text := current_setting('tst.a');
begin
  perform kardex_save_product(v_a, 2026, 11, 'p1', tst.arr(42, '{"36":2}'), tst.arr(6, '{"6":5}'), tst.arr(6));
  perform kardex_submit_week(v_a, 2026, 11, 5);
  perform tst.ok(not (select modified from kardex_week_submissions(v_a, 2026, 11) where week_index = 5), 'semana 6 recién enviada');
  perform kardex_save_product(v_a, 2026, 11, 'p1', tst.arr(42, '{"36":3}'), tst.arr(6, '{"6":5}'), tst.arr(6));
  perform tst.ok((select modified from kardex_week_submissions(v_a, 2026, 11) where week_index = 5), 'semana 6 editada figura modificada');
end $$;

-- 4) Prueba de que el atajo de verdad se salta la comparación cuando nada se guardó después:
--    si se adultera la foto y se "envejece" todo, el atajo dice false sin comparar.
reset role;
update kardex_records set updated_at = now() - interval '1 day' where community = 'ZZZ_TEST_perf' and month = 7;
update week_submissions set submitted_at = now(), reviewed_at = null, snapshot = '{"x":[1]}'::jsonb
 where community = 'ZZZ_TEST_perf' and month = 7 and week_index = 0;
do $$ begin
  perform tst.ok(tst.truth('ZZZ_TEST_perf', 2026, 7, 0), 'la comparación completa vería la foto adulterada');
  perform tst.ok(not _week_modified('ZZZ_TEST_perf', 2026, 7, 0, '{"x":[1]}'::jsonb, now()),
                 'pero sin guardados posteriores el atajo responde false sin comparar');
end $$;

drop schema tst cascade;
delete from week_submissions where community = 'ZZZ_TEST_perf';
delete from kardex_records where community = 'ZZZ_TEST_perf';
delete from communities where name = 'ZZZ_TEST_perf';
\echo 'perf: OK'
