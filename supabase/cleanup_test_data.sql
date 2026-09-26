-- Limpieza de todos los datos de prueba generados durante la verificación
-- del ajuste auditado y de las políticas RLS. Correr una sola vez en el
-- SQL Editor de Supabase (usa privilegios de administrador, no el anon key,
-- así que sí puede borrar aunque la app ya no pueda).

delete from kardex_records where community in ('ZZZ_TEST_BORRAR', 'ZZZ_TEST_BORRAR2', 'ZZZ_TEST_BORRAR3', 'ZZZ_TEST_BORRAR4', 'ZZZ_TEST_BORRAR5', 'ZZZ_TEST_PROD_VERIFY', 'ZZZ_TEST_BORRAR_DEPLOY', 'ZZZ_TEST_BORRAR_FASE3', 'ZZZ_TEST_BORRAR_FASE5', 'ZZZ_TEST_BORRAR_AUDIO', 'ZZZ_TEST_BORRAR_AUDIO2', 'ZZZ_TEST_BORRAR_VIBRA', 'ZZZ_TEST_BORRAR_FRUVER');
delete from ajustes where community in ('ZZZ_TEST_BORRAR', 'ZZZ_TEST_BORRAR2', 'ZZZ_TEST_BORRAR3', 'ZZZ_TEST_BORRAR4', 'ZZZ_TEST_BORRAR5', 'ZZZ_TEST_PROD_VERIFY', 'ZZZ_TEST_BORRAR_DEPLOY', 'ZZZ_TEST_BORRAR_FASE3', 'ZZZ_TEST_BORRAR_FASE5', 'ZZZ_TEST_BORRAR_AUDIO', 'ZZZ_TEST_BORRAR_AUDIO2', 'ZZZ_TEST_BORRAR_VIBRA', 'ZZZ_TEST_BORRAR_FRUVER');
delete from communities where name in ('ZZZ_TEST_BORRAR', 'ZZZ_TEST_BORRAR2', 'ZZZ_TEST_BORRAR3', 'ZZZ_TEST_BORRAR4', 'ZZZ_TEST_BORRAR5', 'ZZZ_TEST_PROD_VERIFY', 'ZZZ_TEST_BORRAR_DEPLOY', 'ZZZ_TEST_BORRAR_FASE3', 'ZZZ_TEST_BORRAR_FASE5', 'ZZZ_TEST_BORRAR_AUDIO', 'ZZZ_TEST_BORRAR_AUDIO2', 'ZZZ_TEST_BORRAR_VIBRA', 'ZZZ_TEST_BORRAR_FRUVER');

-- Quedó de una verificación anterior (antes de este ajuste auditado).
delete from ajustes where community = '__diagnostic_test__';
