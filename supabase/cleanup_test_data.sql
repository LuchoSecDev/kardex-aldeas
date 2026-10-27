-- Limpieza de TODOS los datos de prueba (manuales y de las pruebas
-- automáticas de tests/). Correr en el SQL Editor de Supabase cuando quieras
-- (usa privilegios de administrador, no el anon key, así que sí puede borrar
-- aunque la app ya no pueda).
--
-- Borra cualquier comunidad cuyo nombre empiece por ZZZ_TEST_ (el prefijo
-- obligatorio para toda comunidad de prueba), así ya no hay que agregar cada
-- nombre nuevo a mano. Las sesiones, intentos de PIN, envíos de semana y listas de
-- mercado (market_lists) de esas comunidades se borran solos (on delete cascade).
--
-- CUIDADO: ninguna comunidad real debe llamarse ZZZ_TEST_...

delete from kardex_records where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';
delete from ajustes where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';

do $$
begin
  -- system_error_logs (requiere dev_errors_1.sql; si no existe, no falla)
  if to_regclass('public.system_error_logs') is not null then
    delete from system_error_logs where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';
  end if;

  -- dev_audit_log (requiere dev_auth_1.sql; si no existe, no falla)
  if to_regclass('public.dev_audit_log') is not null then
    delete from dev_audit_log where detail->>'community' ilike 'ZZZ\_TEST\_%' or detail->>'community' ilike 'ZZZ_TEST%';
  end if;

  -- kardex_corrections (requiere kardex_chain_5.sql; desactiva el disparador solo durante la limpieza)
  if to_regclass('public.kardex_corrections') is not null then
    alter table kardex_corrections disable trigger kardex_corrections_no_update;
    delete from kardex_corrections where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';
    alter table kardex_corrections enable trigger kardex_corrections_no_update;
  end if;
end $$;

-- Limpieza de tablas con posibles relaciones foráneas
delete from week_submissions where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';
delete from community_sessions where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';
delete from community_pin_attempts where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';

do $$
begin
  if to_regclass('public.market_replies') is not null then
    delete from market_replies where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';
  end if;
  if to_regclass('public.market_lists') is not null then
    delete from market_lists where community ilike 'ZZZ\_TEST\_%' or community ilike 'ZZZ_TEST%';
  end if;
end $$;

delete from communities where btrim(name) ilike 'ZZZ\_TEST\_%' or btrim(name) ilike 'ZZZ_TEST%';

-- Quedó de una verificación anterior.
delete from ajustes where community = '__diagnostic_test__';

-- Comprobación: debe devolver 0 filas.
select name from communities where name ilike 'ZZZ\_TEST\_%' or name ilike 'ZZZ_TEST%';
