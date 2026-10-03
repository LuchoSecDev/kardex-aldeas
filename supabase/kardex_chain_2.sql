-- Cadena de saldos en el servidor (plan 013, fase 1) — 2 de 6: base heredada, ajustes vigentes, regla de meses cerrados y validación.
-- Requiere kardex_chain_1.sql. Es seguro repetirlo y no cambia nada por sí solo: son funciones internas.

-- Ajuste vigente de cada semana de un mes: el último por fecha (como lee hoy la pantalla). {"semana": saldo_nuevo}
create or replace function _kardex_overrides(p_community text, p_product text, p_year int, p_month int) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(jsonb_object_agg(t.week_index::text, t.saldo_nuevo), '{}'::jsonb)
    from (select distinct on (a.week_index) a.week_index, a.saldo_nuevo
            from ajustes a
           where a.community = p_community and a.product_id = p_product and a.year = p_year and a.month = p_month
           order by a.week_index, a.created_at desc, a.id desc) t
$$;

-- Saldo con el que parte un mes: el cierre de la fila MÁS RECIENTE anterior del producto (D14: aunque haya meses sin fila en medio,
-- el saldo físico no desaparece). Sin ninguna fila anterior, 0.
create or replace function _kardex_base(p_community text, p_product text, p_year int, p_month int) returns numeric
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce((select round(_kardex_closing(r.prev_balances, r.entries, r.exits), 4)
                     from kardex_records r
                    where r.community = p_community and r.product_id = p_product
                      and (r.year * 12 + r.month) < (p_year * 12 + p_month)
                    order by r.year desc, r.month desc limit 1), 0)
$$;

-- ¿Ese mes requiere la ventana de corrección? (hora de Bogotá). Se necesita si el producto YA tiene filas en un mes posterior (incluye
-- llenar por adelantado); si no, el mes actual y los futuros se editan normal; el mes anterior, solo del día 1 al 5; y desde el
-- día 6 todo mes anterior al actual.
create or replace function _kardex_month_closed(p_community text, p_product text, p_year int, p_month int) returns boolean
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_today date := _kardex_today();
  v_cur   int  := extract(year from v_today)::int * 12 + extract(month from v_today)::int - 1;
  v_t     int  := p_year * 12 + p_month;
begin
  if exists (select 1 from kardex_records r where r.community = p_community and r.product_id = p_product
                and (r.year * 12 + r.month) > v_t) then
    return true;
  end if;
  if v_t >= v_cur then return false; end if;
  return not (v_t = v_cur - 1 and extract(day from v_today) <= 5);
end;
$$;

-- Validación de una fila (las mismas reglas de siempre): fecha, producto, tamaños 35/5 o 42/6, entradas y salidas números >= 0.
-- Los saldos (p_prev) pueden ser negativos; se revisan solo si se mandan.
create or replace function _kardex_check_row(
  p_year int, p_month int, p_product text, p_exits jsonb, p_entries jsonb, p_prev jsonb default null
) returns void
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11 then raise exception 'Fecha inválida'; end if;
  if not exists (select 1 from products where id = p_product) then raise exception 'Producto inválido'; end if;
  if jsonb_typeof(p_exits) is distinct from 'array' or jsonb_typeof(p_entries) is distinct from 'array'
     or (p_prev is not null and jsonb_typeof(p_prev) is distinct from 'array') then
    raise exception 'Datos incompletos';
  end if;
  if not ((jsonb_array_length(p_exits) = 35 and jsonb_array_length(p_entries) = 5)
       or (jsonb_array_length(p_exits) = 42 and jsonb_array_length(p_entries) = 6))
     or (p_prev is not null and jsonb_array_length(p_prev) <> jsonb_array_length(p_entries)) then
    raise exception 'Datos incompletos';
  end if;
  if exists (select 1 from jsonb_array_elements(p_exits) e
              where case when jsonb_typeof(e) = 'number' then (e #>> '{}')::numeric < 0 else true end)
     or exists (select 1 from jsonb_array_elements(p_entries) e
              where case when jsonb_typeof(e) = 'number' then (e #>> '{}')::numeric < 0 else true end)
     or (p_prev is not null and exists (select 1 from jsonb_array_elements(p_prev) e where jsonb_typeof(e) <> 'number')) then
    raise exception 'Valores inválidos';
  end if;
end;
$$;

revoke execute on function _kardex_overrides(text, text, int, int)                          from public, anon, authenticated;
revoke execute on function _kardex_base(text, text, int, int)                               from public, anon, authenticated;
revoke execute on function _kardex_month_closed(text, text, int, int)                       from public, anon, authenticated;
revoke execute on function _kardex_check_row(int, int, text, jsonb, jsonb, jsonb)           from public, anon, authenticated;
