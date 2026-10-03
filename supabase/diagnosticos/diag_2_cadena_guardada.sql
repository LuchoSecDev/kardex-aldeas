-- DIAGNÓSTICO 2 de 5 (plan 013, Fase 0) — SOLO LECTURA: ¿el saldo anterior GUARDADO de cada semana coincide con el que da el
-- encadenado? (opción D7-A: la base de cada mes es el cierre GUARDADO del mes anterior; un ajuste manda en su semana).
-- Pega y corre TODO en el SQL Editor. Es un solo `select`: no cambia nada. Devuelve primero filas «RESUMEN» (por comunidad y mes)
-- y después hasta 300 filas «DETALLE» con lo guardado y lo esperado. Sin ninguna fila DETALLE = todo coincide.
-- Misma regla que balanceEngine.ts (computeCascade / finalBalanceOfMonth): semana 0 hereda el cierre del mes anterior (0 si no
-- hay fila del mes anterior); semana w = anterior + entradas - salidas de la semana anterior; un ajuste (el último de esa semana) manda.

with recursive filas as (
  select k.*, (k.year * 12 + k.month) as ym, jsonb_array_length(k.prev_balances) as n
    from kardex_records k
),
sem as (  -- una fila por registro y semana: entradas, salidas y lo guardado
  select f.community, f.product_id, f.year, f.month, f.ym, f.n, s.w,
         case when jsonb_typeof(f.entries -> s.w) = 'number' then (f.entries ->> s.w)::numeric else 0 end as ent,
         coalesce((select sum(case when jsonb_typeof(e.val) = 'number' then (e.val #>> '{}')::numeric else 0 end)
                     from jsonb_array_elements(f.exits) with ordinality as e(val, idx)
                    where e.idx between s.w * 7 + 1 and s.w * 7 + 7), 0) as sal,
         case when jsonb_typeof(f.prev_balances -> s.w) = 'number' then (f.prev_balances ->> s.w)::numeric else 0 end as guardado
    from filas f cross join lateral generate_series(0, f.n - 1) as s(w)
),
cierre as (  -- cierre guardado de cada mes (finalBalanceOfMonth): última semana guardada
  select community, product_id, ym, guardado + ent - sal as cierre
    from sem s where s.w = s.n - 1
),
ajuste as (  -- ajuste vigente por semana: el último por fecha
  select distinct on (community, product_id, year, month, week_index)
         community, product_id, year, month, week_index, saldo_nuevo
    from ajustes
   order by community, product_id, year, month, week_index, created_at desc
),
esperado as (
  select s.community, s.product_id, s.year, s.month, s.ym, s.n, s.w, s.ent, s.sal, s.guardado,
         coalesce(a.saldo_nuevo, coalesce(c.cierre, 0)) as esperado
    from sem s
    left join ajuste a on (a.community, a.product_id, a.year, a.month, a.week_index) = (s.community, s.product_id, s.year, s.month, s.w)
    left join cierre c on (c.community, c.product_id, c.ym) = (s.community, s.product_id, s.ym - 1)
   where s.w = 0
  union all
  select s.community, s.product_id, s.year, s.month, s.ym, s.n, s.w, s.ent, s.sal, s.guardado,
         coalesce(a.saldo_nuevo, e.esperado + e.ent - e.sal)
    from esperado e
    join sem s on (s.community, s.product_id, s.ym, s.w) = (e.community, e.product_id, e.ym, e.w + 1)
    left join ajuste a on (a.community, a.product_id, a.year, a.month, a.week_index) = (s.community, s.product_id, s.year, s.month, s.w)
),
dif as (select * from esperado where abs(guardado - esperado) > 0.000001)
select * from (
  select 'RESUMEN' as tipo, community as comunidad, '' as producto, year as año, month + 1 as mes, null::int as semana,
         count(distinct product_id)::numeric as guardado, count(*)::numeric as esperado,
         'productos con diferencia / semanas con diferencia' as detalle
    from dif group by community, year, month
  union all
  select 'DETALLE', community, product_id, year, month + 1, w + 1, guardado, esperado,
         'guardado ' || guardado || ' y debería ser ' || esperado
    from dif
   order by 1 desc, 2, 4, 5, 3, 6
   limit 300
) r;
