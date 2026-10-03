-- Control de versión al guardar un producto (plan 012, hallazgo H2): evita que un guardado viejo pise lo que otra persona ya guardó.
-- Correr en el SQL Editor ANTES de desplegar la app nueva. Es seguro repetirlo y NO rompe a la app actual: sin versión se comporta como antes.
--
-- Parámetros nuevos (con valor por defecto, así los clientes viejos siguen funcionando):
--   p_check_version        verdadero = comparar la versión (la que usa la app nueva).
--   p_expected_updated_at  la updated_at que el cliente leyó; null = «no había fila».
-- Con p_check_version, si la fila cambió (o apareció o desapareció) desde que el cliente la leyó, falla con CONFLICTO_VERSION y no guarda.
-- Devuelve la updated_at nueva (antes no devolvía nada): el cliente la necesita para su siguiente guardado.
-- Cambia el tipo que devuelve, por eso se borra la función vieja y se crea de nuevo (con sus permisos) en este mismo script.

drop function if exists kardex_save_product(text, int, int, text, jsonb, jsonb, jsonb);

create or replace function kardex_save_product(
  p_token text, p_year int, p_month int, p_product_id text,
  p_exits jsonb, p_entries jsonb, p_prev_balances jsonb,
  p_check_version boolean default false, p_expected_updated_at timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_current   timestamptz;
  v_rows      int;
  -- clock_timestamp (no now): dos guardados en la misma transacción también reciben versiones distintas.
  v_now       timestamptz := clock_timestamp();
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

  if p_check_version then
    -- La fila queda bloqueada hasta el final: dos guardados a la vez no se cruzan.
    select updated_at into v_current from kardex_records
     where community = v_community and year = p_year and month = p_month and product_id = p_product_id
       for update;
    if found then
      if p_expected_updated_at is distinct from v_current then raise exception 'CONFLICTO_VERSION'; end if;
      update kardex_records
         set exits = p_exits, entries = p_entries, prev_balances = p_prev_balances, updated_at = v_now
       where community = v_community and year = p_year and month = p_month and product_id = p_product_id;
      return v_now;
    end if;
    if p_expected_updated_at is not null then raise exception 'CONFLICTO_VERSION'; end if;
    -- No había fila: si otro la creó mientras tanto, `do nothing` no inserta y se avisa del conflicto.
    insert into kardex_records (community, year, month, product_id, exits, entries, prev_balances, updated_at)
    values (v_community, p_year, p_month, p_product_id, p_exits, p_entries, p_prev_balances, v_now)
    on conflict (community, year, month, product_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'CONFLICTO_VERSION'; end if;
    return v_now;
  end if;

  -- Cliente anterior (sin versión): guarda como siempre.
  insert into kardex_records (community, year, month, product_id, exits, entries, prev_balances, updated_at)
  values (v_community, p_year, p_month, p_product_id, p_exits, p_entries, p_prev_balances, v_now)
  on conflict (community, year, month, product_id) do update
    set exits = excluded.exits, entries = excluded.entries,
        prev_balances = excluded.prev_balances, updated_at = excluded.updated_at;
  return v_now;
end;
$$;

grant execute on function kardex_save_product(text, int, int, text, jsonb, jsonb, jsonb, boolean, timestamptz) to anon;
