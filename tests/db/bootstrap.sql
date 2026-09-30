-- Imita lo mínimo de Supabase para correr supabase/*.sql en un Postgres LOCAL
-- desechable (ver tests/db/run.sh). NO se usa contra el proyecto real.

-- Roles que Supabase ya trae. Tienen NOLOGIN: las pruebas entran como el dueño
-- y cambian de rol con `set role anon`, igual que hace la API con la anon key.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;

grant usage on schema public, extensions to anon, authenticated;

-- Supabase da por defecto permisos amplios a anon sobre todo lo nuevo de `public`
-- (por eso los scripts hacen `revoke all`). Se reproduce para que las pruebas
-- detecten un `revoke` olvidado.
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- La tabla principal del kardex se creó a mano en Supabase (no hay .sql en el
-- repo que la cree); aquí va un equivalente para que los demás scripts carguen.
create table if not exists kardex_records (
  id            uuid primary key default gen_random_uuid(),
  community     text not null,
  year          int  not null,
  month         int  not null,
  product_id    text not null,
  prev_balances jsonb not null default '[0,0,0,0,0]',
  entries       jsonb not null default '[0,0,0,0,0]',
  exits         jsonb not null default '[]',
  updated_at    timestamptz not null default now(),
  unique (community, year, month, product_id)
);
