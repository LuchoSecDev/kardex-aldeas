-- DIAGNÓSTICO 3 de 5 (plan 013, Fase 0) — SOLO LECTURA: huecos entre meses y meses con datos por adelantado.
-- Pega y corre TODO en el SQL Editor. Es un solo `select`: no cambia nada. Devuelve filas de tres tipos:
--   HUECO   un producto con saldo de cierre distinto de cero cuyo SIGUIENTE mes con datos no es el mes inmediato. La app solo hereda el
--           cierre del mes inmediato anterior (si no hay fila, parte de 0), así que ese saldo se «pierde» en el mes siguiente.
--   FUTURO  filas de meses posteriores al mes actual (hora de Bogotá): relevante para la pregunta Q2 del plan.
--   CONTEXTO  filas, meses y productos con datos por comunidad.
-- Sin filas HUECO ni FUTURO = no hay nada de qué preocuparse en esos dos puntos.

with filas as (
  select k.community, k.product_id, k.year, k.month, (k.year * 12 + k.month) as ym,
         jsonb_array_length(k.prev_balances) as n, k.prev_balances, k.entries, k.exits
    from kardex_records k
),
cierre as (
  select f.community, f.product_id, f.year, f.month, f.ym,
         case when jsonb_typeof(f.prev_balances -> (f.n - 1)) = 'number' then (f.prev_balances ->> (f.n - 1))::numeric else 0 end
           + case when jsonb_typeof(f.entries -> (f.n - 1)) = 'number' then (f.entries ->> (f.n - 1))::numeric else 0 end
           - coalesce((select sum(case when jsonb_typeof(e.val) = 'number' then (e.val #>> '{}')::numeric else 0 end)
                         from jsonb_array_elements(f.exits) with ordinality as e(val, idx)
                        where e.idx between (f.n - 1) * 7 + 1 and (f.n - 1) * 7 + 7), 0) as saldo,
         lead(f.ym) over (partition by f.community, f.product_id order by f.ym) as siguiente
    from filas f
),
hoy as (select (extract(year from (now() at time zone 'America/Bogota')) * 12
              + extract(month from (now() at time zone 'America/Bogota')) - 1)::int as ym_actual)
select * from (
  select 'HUECO' as tipo, c.community as comunidad, c.product_id as producto, c.year as año, c.month + 1 as mes,
         c.saldo as valor,
         'cierre ' || c.saldo || '; el siguiente mes con datos está ' || (c.siguiente - c.ym) || ' meses después' as detalle
    from cierre c
   where c.siguiente is not null and c.siguiente > c.ym + 1 and c.saldo <> 0
  union all
  select 'FUTURO', f.community, f.product_id, f.year, f.month + 1, null::numeric, 'mes posterior al actual con datos'
    from filas f, hoy where f.ym > hoy.ym_actual
  union all
  select 'CONTEXTO', f.community, count(distinct f.product_id)::text || ' productos', min(f.year), min(f.month) + 1,
         count(*)::numeric,
         count(*) || ' filas en ' || count(distinct f.ym) || ' meses distintos'
    from filas f group by f.community
) r
order by tipo, comunidad, año, mes, producto
limit 500;
