-- Ejecutar una sola vez en el SQL Editor del proyecto de Supabase.
-- Guarda los nombres de comunidad que las personas van escribiendo,
-- para que la próxima vez aparezcan como sugerencia en vez de tener
-- que volver a teclearlos.

create table if not exists communities (
  name text primary key,
  created_at timestamptz not null default now()
);

alter table communities enable row level security;

-- El anon key ya puede leer/escribir kardex_records sin login individual;
-- se replica el mismo criterio aquí para no romper el flujo de "sin contraseñas".
create policy "Allow anon read communities" on communities
  for select
  to anon
  using (true);

create policy "Allow anon insert communities" on communities
  for insert
  to anon
  with check (true);

-- Necesaria para que el upsert (INSERT ... ON CONFLICT DO UPDATE) funcione
-- cuando alguien escribe el nombre de una comunidad que ya existe.
create policy "Allow anon update communities" on communities
  for update
  to anon
  using (true)
  with check (true);
