-- Bloquea el DELETE del rol anon sobre kardex_records, en dos capas
-- independientes (así funciona sin importar cuál era la causa real).
--
-- Los dos intentos anteriores (quitar políticas DELETE, luego también
-- las de tipo ALL) no bastaron: el DELETE seguía funcionando después de
-- correrlos. Eso indica que Row Level Security probablemente nunca se
-- activó en esta tabla (a diferencia de communities, donde sí se activó
-- desde el primer script) — y sin RLS, las políticas no se aplican en
-- absoluto: Supabase le da por defecto permisos amplios de SELECT/
-- INSERT/UPDATE/DELETE al rol anon a nivel de tabla.

-- Capa 1: quitar el permiso de DELETE directamente a nivel de tabla.
-- Esto por sí solo ya bloquea el borrado, tenga RLS activo o no.
revoke delete on public.kardex_records from anon;

-- Capa 2: activar RLS (si no lo estaba) y dejar políticas explícitas
-- solo para lo que la app realmente usa (select en carga, insert/update
-- en el guardado automático). Sin política de delete, RLS lo niega por
-- defecto en cuanto está activo.
alter table public.kardex_records enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'kardex_records'
      and cmd in ('DELETE', 'ALL')
  loop
    execute format('drop policy %I on public.kardex_records', pol.policyname);
  end loop;
end $$;

drop policy if exists "kardex_records anon select" on public.kardex_records;
drop policy if exists "kardex_records anon insert" on public.kardex_records;
drop policy if exists "kardex_records anon update" on public.kardex_records;

create policy "kardex_records anon select" on public.kardex_records
  for select
  to anon
  using (true);

create policy "kardex_records anon insert" on public.kardex_records
  for insert
  to anon
  with check (true);

create policy "kardex_records anon update" on public.kardex_records
  for update
  to anon
  using (true)
  with check (true);
