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

delete from kardex_records where community like 'ZZZ\_TEST\_%';
delete from ajustes where community like 'ZZZ\_TEST\_%';
delete from system_error_logs where community like 'ZZZ\_TEST\_%';
-- Las anotaciones de «resolver problema» de /dev que quedaron de comunidades de prueba (requiere dev_auth_1.sql).
delete from dev_audit_log where detail->>'community' like 'ZZZ\_TEST\_%';
-- La auditoría de correcciones es append-only (disparador): solo para esta limpieza se desactiva y se vuelve a activar (requiere
-- kardex_chain_5.sql; si todavía no está corrido, no hace nada).
do $$
begin
  if to_regclass('public.kardex_corrections') is not null then
    alter table kardex_corrections disable trigger kardex_corrections_no_update;
    delete from kardex_corrections where community like 'ZZZ\_TEST\_%';
    alter table kardex_corrections enable trigger kardex_corrections_no_update;
  end if;
end $$;
delete from communities where name like 'ZZZ\_TEST\_%';

-- Quedó de una verificación anterior.
delete from ajustes where community = '__diagnostic_test__';

-- Comprobación: debe devolver 0 filas.
select name from communities where name like 'ZZZ\_TEST\_%';
