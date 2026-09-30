-- Cierra el acceso directo a las tablas de datos: a partir de aquí, la única
-- forma de leer o escribir kardex_records / ajustes es con un token de
-- sesión, a través de las funciones de session_access.sql.
--
-- !!! ORDEN DE DESPLIEGUE — IMPORTANTE !!!
-- La versión ANTERIOR de la app accede directo a las tablas: si corres este
-- archivo antes de desplegar la versión nueva, la app en producción deja de
-- cargar y guardar datos. El orden correcto es:
--   1. Correr session_access.sql (aditivo, no rompe nada).
--   2. Desplegar la versión nueva de la app (push a main) y esperar a que
--      Vercel termine.
--   3. Correr ESTE archivo.
-- Si algo sale mal, el bloque de reversa de abajo devuelve el acceso directo.

-- Las funciones security definer corren con los privilegios del dueño de las
-- tablas, así que no dependen de estos permisos ni de las políticas.
revoke all on public.kardex_records from anon, authenticated;
revoke all on public.ajustes        from anon, authenticated;

drop policy if exists "kardex_records anon select" on public.kardex_records;
drop policy if exists "kardex_records anon insert" on public.kardex_records;
drop policy if exists "kardex_records anon update" on public.kardex_records;
drop policy if exists "ajustes anon select" on public.ajustes;
drop policy if exists "ajustes anon insert" on public.ajustes;

alter table public.kardex_records enable row level security;
alter table public.ajustes        enable row level security;

-- verify_community_pin queda solo como pieza interna de login_community; el
-- cliente ya no necesita llamarla directamente.
revoke execute on function verify_community_pin(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- REVERSA (solo si hay que volver a la versión anterior de la app):
--
-- grant select, insert, update on public.kardex_records to anon;
-- grant select, insert          on public.ajustes        to anon;
-- create policy "kardex_records anon select" on public.kardex_records for select to anon using (true);
-- create policy "kardex_records anon insert" on public.kardex_records for insert to anon with check (true);
-- create policy "kardex_records anon update" on public.kardex_records for update to anon using (true) with check (true);
-- create policy "ajustes anon select" on public.ajustes for select to anon using (true);
-- create policy "ajustes anon insert" on public.ajustes for insert to anon with check (true);
-- grant execute on function verify_community_pin(text, text) to anon;
-- ---------------------------------------------------------------------------
