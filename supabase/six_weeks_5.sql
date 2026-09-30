-- Semana 6 de cierre (plan 004, hallazgo H1) — archivo 5 de 5: resumen semanal con la semana 6.
-- Correr los 5 EN ORDEN en el SQL Editor, ANTES de desplegar la versión nueva de la app. Es seguro
-- repetirlos y NO rompe la app actual: el servidor sigue aceptando los arreglos de 5 semanas (35/5/5).
-- Va en archivos chicos: el editor no deja pegar más de ~100 líneas.

-- Resumen semanal para el pedido a proveedores (plan 002): ahora acepta la semana 6 (índice 5).
-- Devuelve una fila por (comunidad, producto) con el saldo anterior, las entradas y las salidas
-- de esa semana. Solo lectura; exige el token de administradora.
create or replace function admin_weekly_totals(
  p_token text, p_year int, p_month int, p_week_index int, p_only_sent boolean default true
)
returns table (
  community    text,
  product_id   text,
  prev_balance numeric,
  entries      numeric,
  exits        numeric
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _admin_session(p_token);

  if p_year not between 2000 and 2100 or p_month not between 0 and 11
     or p_week_index not between 0 and 5 then
    raise exception 'Fecha inválida';
  end if;

  return query
    select t.community, t.product_id, t.prev_balance, t.entries, t.exits
      from (
        select r.community,
               r.product_id,
               coalesce((r.prev_balances ->> p_week_index)::numeric, 0) as prev_balance,
               coalesce((r.entries ->> p_week_index)::numeric, 0)       as entries,
               coalesce((
                 select sum((e.val #>> '{}')::numeric)
                   from jsonb_array_elements(r.exits) with ordinality as e(val, idx)
                  where e.idx between p_week_index * 7 + 1 and p_week_index * 7 + 7
               ), 0) as exits
          from kardex_records r
         where r.year = p_year and r.month = p_month
           and (
             not p_only_sent
             or exists (
               select 1 from week_submissions s
                where s.community = r.community
                  and s.year = r.year and s.month = r.month
                  and s.week_index = p_week_index
             )
           )
      ) t
     where t.prev_balance <> 0 or t.entries <> 0 or t.exits <> 0
     order by t.product_id, t.community;
end;
$$;

grant execute on function admin_weekly_totals(text, int, int, int, boolean) to anon;
