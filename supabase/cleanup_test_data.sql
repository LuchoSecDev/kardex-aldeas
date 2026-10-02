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
delete from communities where name like 'ZZZ\_TEST\_%';

-- Quedó de una verificación anterior.
delete from ajustes where community = '__diagnostic_test__';

-- Comprobación: debe devolver 0 filas.
select name from communities where name like 'ZZZ\_TEST\_%';
