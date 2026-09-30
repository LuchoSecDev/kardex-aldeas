-- Resumen semanal para el pedido a proveedores: plan 002.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- week_submissions.sql. Es aditivo y SOLO LECTURA.
--
-- Devuelve, para UNA semana de UN mes, una fila por (comunidad, producto) con
-- el saldo anterior, las entradas y las salidas de esa semana. La suma por
-- producto entre comunidades y el saldo final los calcula la aplicación.
--
-- p_only_sent = true  → solo las comunidades que YA ENVIARON esa semana (lo
--                       habitual: la nutricionista revisa lo que le llegó).
-- p_only_sent = false → todas las comunidades con datos, hayan enviado o no.
--
-- Solo se devuelven filas con algún valor distinto de cero.
-- Exige el token de administradora (no sirve un token de comunidad).

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
     or p_week_index not between 0 and 4 then
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
