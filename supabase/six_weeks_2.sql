-- Semana 6 de cierre (plan 004, hallazgo H1) — archivo 2 de 5: guardar un producto con 5 o 6 semanas.
-- Correr los 5 EN ORDEN en el SQL Editor, ANTES de desplegar la versión nueva de la app. Es seguro
-- repetirlos y NO rompe la app actual: el servidor sigue aceptando los arreglos de 5 semanas (35/5/5).
-- Va en archivos chicos: el editor no deja pegar más de ~100 líneas.

-- Acepta los dos formatos: 35 salidas / 5 entradas / 5 saldos (5 semanas, clientes y filas
-- anteriores) o 42 / 6 / 6 (con la semana 6 de cierre). Mezclas como 42/5/6 se rechazan.
create or replace function kardex_save_product(
  p_token text, p_year int, p_month int, p_product_id text,
  p_exits jsonb, p_entries jsonb, p_prev_balances jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11 then
    raise exception 'Fecha inválida';
  end if;
  if not exists (select 1 from products where id = p_product_id) then
    raise exception 'Producto inválido';
  end if;
  if jsonb_typeof(p_exits) is distinct from 'array'
     or jsonb_typeof(p_entries) is distinct from 'array'
     or jsonb_typeof(p_prev_balances) is distinct from 'array' then
    raise exception 'Datos incompletos';
  end if;
  if not (
       (jsonb_array_length(p_exits) = 35 and jsonb_array_length(p_entries) = 5
        and jsonb_array_length(p_prev_balances) = 5)
    or (jsonb_array_length(p_exits) = 42 and jsonb_array_length(p_entries) = 6
        and jsonb_array_length(p_prev_balances) = 6)
  ) then
    raise exception 'Datos incompletos';
  end if;
  -- Salidas y entradas: números >= 0. Saldos: cualquier número (pueden ser negativos).
  if exists (
       select 1 from jsonb_array_elements(p_exits) e
        where case when jsonb_typeof(e) = 'number' then (e #>> '{}')::numeric < 0 else true end)
     or exists (
       select 1 from jsonb_array_elements(p_entries) e
        where case when jsonb_typeof(e) = 'number' then (e #>> '{}')::numeric < 0 else true end)
     or exists (
       select 1 from jsonb_array_elements(p_prev_balances) e
        where jsonb_typeof(e) <> 'number') then
    raise exception 'Valores inválidos';
  end if;

  insert into kardex_records
    (community, year, month, product_id, exits, entries, prev_balances, updated_at)
  values
    (v_community, p_year, p_month, p_product_id, p_exits, p_entries, p_prev_balances, now())
  on conflict (community, year, month, product_id) do update
    set exits         = excluded.exits,
        entries       = excluded.entries,
        prev_balances = excluded.prev_balances,
        updated_at    = excluded.updated_at;
end;
$$;

grant execute on function kardex_save_product(text, int, int, text, jsonb, jsonb, jsonb) to anon;
