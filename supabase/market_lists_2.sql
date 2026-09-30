-- Lista de mercado (plan 003, Fase A) — archivo 2 de 5: funciones internas.
-- Correr los 5 EN ORDEN (1 a 5) en el SQL Editor, después de week_submissions.sql, y luego
-- los market_seed_N.sql. Va en archivos chicos: el editor no deja pegar más de ~100 líneas.
-- Es seguro repetirlos. No hay precios (plan 003).

-- ---------------------------------------------------------------------------
-- Piezas internas (no se exponen por la API)
-- ---------------------------------------------------------------------------

-- La semana debe ser un lunes y estar en un rango razonable.
create or replace function _market_check_week(p_week_start date)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_week_start is null
     or extract(isodow from p_week_start) <> 1
     or extract(year from p_week_start) not between 2000 and 2100 then
    raise exception 'Semana inválida';
  end if;
end;
$$;

-- Plazo de envío del viernes de pedido: el del calendario y, si ese viernes no
-- está sembrado (p. ej. un año futuro), viernes 5 pm hora de Bogotá.
create or replace function _market_deadline(p_friday date)
returns timestamptz
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (select c.deadline_at from market_calendar c where c.friday = p_friday),
    (p_friday + time '17:00') at time zone 'America/Bogota'
  );
$$;

-- Valida y limpia las cantidades de un tipo: debe ser un objeto {item_id: número}
-- con ítems activos de ESE tipo y cantidades >= 0. Los ceros se descartan.
create or replace function _market_clean_quantities(p_kind text, p_quantities jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key   text;
  v_value jsonb;
  v_num   numeric;
  v_clean jsonb := '{}'::jsonb;
begin
  if p_kind is null or p_kind not in ('fruver', 'carnes', 'abarrotes', 'aseo') then
    raise exception 'Tipo de lista inválido';
  end if;
  if p_quantities is null or jsonb_typeof(p_quantities) <> 'object' then
    raise exception 'Cantidades inválidas';
  end if;

  for v_key, v_value in select * from jsonb_each(p_quantities) loop
    if not exists (
      select 1 from market_items i
       where i.id = v_key and i.kind = p_kind and i.is_active
    ) then
      raise exception 'Producto inválido';
    end if;
    if jsonb_typeof(v_value) <> 'number' then
      raise exception 'Cantidades inválidas';
    end if;
    v_num := (v_value #>> '{}')::numeric;
    if v_num < 0 or v_num > 100000 then
      raise exception 'Cantidades inválidas';
    end if;
    if v_num <> 0 then
      v_clean := v_clean || jsonb_build_object(v_key, v_num);
    end if;
  end loop;

  return v_clean;
end;
$$;

revoke execute on function _market_check_week(date)                from public, anon, authenticated;
revoke execute on function _market_deadline(date)                  from public, anon, authenticated;
revoke execute on function _market_clean_quantities(text, jsonb)   from public, anon, authenticated;
