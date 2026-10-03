-- DIAGNÓSTICO 1 de 5 (plan 013, Fase 0) — SOLO LECTURA: cómo es de verdad el esquema en producción.
-- Pega y corre TODO en el SQL Editor. No crea, cambia ni borra nada: es un solo `select`. Devuelve una tabla de tres columnas
-- (tipo, objeto, detalle) con las columnas, restricciones, disparadores, índices, seguridad y permisos de las tablas del kardex.
-- Qué mirar: que `kardex_records.updated_at` sea timestamptz, que NO haya disparadores inesperados, que anon NO tenga permisos
-- sobre las tablas (solo sobre funciones) y que exista UNA sola kardex_save_product.

select * from (
  select 'columna' as tipo, c.table_name::text as objeto,
         c.column_name || ' ' || c.data_type
           || case when c.is_nullable = 'NO' then ' not null' else '' end
           || coalesce(' default ' || c.column_default, '') as detalle
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name in ('kardex_records', 'ajustes', 'week_submissions')

  union all
  select 'restricción', cl.relname::text, co.conname || ': ' || pg_get_constraintdef(co.oid)
    from pg_constraint co join pg_class cl on cl.oid = co.conrelid
   where cl.relnamespace = 'public'::regnamespace and cl.relname in ('kardex_records', 'ajustes', 'week_submissions')

  union all
  select 'disparador', cl.relname::text, pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class cl on cl.oid = t.tgrelid
   where not t.tgisinternal and cl.relnamespace = 'public'::regnamespace
     and cl.relname in ('kardex_records', 'ajustes', 'week_submissions')

  union all
  select 'índice', i.tablename::text, i.indexdef
    from pg_indexes i
   where i.schemaname = 'public' and i.tablename in ('kardex_records', 'ajustes', 'week_submissions')

  union all
  select 'seguridad (RLS)', cl.relname::text,
         'rls activo: ' || cl.relrowsecurity || ', rls forzado: ' || cl.relforcerowsecurity
    from pg_class cl
   where cl.relnamespace = 'public'::regnamespace and cl.relname in ('kardex_records', 'ajustes', 'week_submissions')

  union all
  select 'permiso sobre tabla', g.table_name::text, g.grantee || ': ' || g.privilege_type
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name in ('kardex_records', 'ajustes', 'week_submissions')
     and g.grantee in ('anon', 'authenticated', 'PUBLIC')

  union all
  select 'función', p.proname::text, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') devuelve '
         || pg_get_function_result(p.oid)
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('kardex_save_product', 'kardex_insert_ajuste', 'kardex_load_month', 'kardex_load_ajustes')
) t
order by tipo, objeto, detalle;
