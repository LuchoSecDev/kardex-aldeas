-- Historial de ajustes (correcciones auditadas al saldo).
--
-- Un ajuste registra que, en una semana determinada, el conteo físico real
-- no coincidía con el saldo calculado, y guarda el motivo. El saldo anterior
-- de esa semana en adelante se recalcula a partir del valor nuevo; las
-- semanas anteriores a esa NO se tocan (ya quedaron "cerradas").
--
-- Es una tabla de auditoría: debe quedar append-only, nadie (ni siquiera
-- la propia app) debería poder editar o borrar un ajuste ya guardado.

create table if not exists ajustes (
  id uuid primary key default gen_random_uuid(),
  community text not null,
  product_id text not null,
  year int not null,
  month int not null,
  week_index int not null check (week_index between 0 and 4),
  saldo_anterior numeric not null,
  saldo_nuevo numeric not null,
  motivo text not null,
  created_at timestamptz not null default now()
);

alter table public.ajustes enable row level security;

-- Doble capa (misma lección aprendida con kardex_records): quitar el
-- permiso a nivel de tabla Y no crear política de update/delete.
revoke update, delete on public.ajustes from anon;

drop policy if exists "ajustes anon select" on public.ajustes;
drop policy if exists "ajustes anon insert" on public.ajustes;

create policy "ajustes anon select" on public.ajustes
  for select
  to anon
  using (true);

create policy "ajustes anon insert" on public.ajustes
  for insert
  to anon
  with check (true);
