-- DIAGNÓSTICO 4 de 5 (plan 013, Fase 0) — SOLO LECTURA: ¿qué diría el encadenado si se recalculara DESDE EL PRIMER MES con datos,
-- sin fiarse de ningún saldo guardado? (opción D7-B). Compara con lo guardado. Sirve para decidir si hace falta reparar datos.
-- Pega y corre TODO en el SQL Editor. Es un solo `select`: no cambia nada. Cada cadena de meses seguidos de un producto parte de 0
-- (como hace la app cuando no hay fila del mes anterior); un ajuste (el último de esa semana) manda en su semana.
-- Devuelve filas «RESUMEN» (por comunidad y mes) y hasta 300 filas «DETALLE». Sin filas DETALLE = lo guardado coincide con el origen.
-- Si el diagnóstico 2 sale limpio y este no, hay un saldo guardado de arrastre equivocado desde mucho antes.

with recursive filas as (
  select k.*, (k.year * 12 + k.month) as ym, jsonb_array_length(k.prev_balances) as n from kardex_records k
),
sem as (
  select f.community, f.product_id, f.year, f.month, f.ym, f.n, s.w,
         case when jsonb_typeof(f.entries -> s.w) = 'number' then (f.entries ->> s.w)::numeric else 0 end as ent,
         coalesce((select sum(case when jsonb_typeof(e.val) = 'number' then (e.val #>> '{}')::numeric else 0 end)
                     from jsonb_array_elements(f.exits) with ordinality as e(val, idx)
                    where e.idx between s.w * 7 + 1 and s.w * 7 + 7), 0) as sal,
         case when jsonb_typeof(f.prev_balances -> s.w) = 'number' then (f.prev_balances ->> s.w)::numeric else 0 end as guardado
    from filas f cross join lateral generate_series(0, f.n - 1) as s(w)
),
ajuste as (
  select distinct on (community, product_id, year, month, week_index)
         community, product_id, year, month, week_index, saldo_nuevo
    from ajustes
   order by community, product_id, year, month, week_index, created_at desc
),
origen as (
  -- Inicio de cada cadena: el primer mes (sin fila del mes inmediato anterior) parte de 0.
  select s.*, coalesce(a.saldo_nuevo, 0::numeric) as esperado
    from sem s
    left join ajuste a on (a.community, a.product_id, a.year, a.month, a.week_index) = (s.community, s.product_id, s.year, s.month, s.w)
   where s.w = 0
     and not exists (select 1 from filas p where p.community = s.community and p.product_id = s.product_id and p.ym = s.ym - 1)
  union all
  -- Siguiente semana de la misma fila, o semana 0 del mes inmediato siguiente cuando la fila termina.
  select s.*, coalesce(a.saldo_nuevo, o.esperado + o.ent - o.sal)
    from origen o
    join sem s on s.community = o.community and s.product_id = o.product_id
              and ((s.ym = o.ym and s.w = o.w + 1) or (o.w = o.n - 1 and s.ym = o.ym + 1 and s.w = 0))
    left join ajuste a on (a.community, a.product_id, a.year, a.month, a.week_index) = (s.community, s.product_id, s.year, s.month, s.w)
),
dif as (select * from origen where abs(guardado - esperado) > 0.000001)
select * from (
  select 'RESUMEN' as tipo, community as comunidad, '' as producto, year as año, month + 1 as mes, null::int as semana,
         count(distinct product_id)::numeric as guardado, count(*)::numeric as esperado,
         'productos con diferencia / semanas con diferencia' as detalle
    from dif group by community, year, month
  union all
  select 'DETALLE', community, product_id, year, month + 1, w + 1, guardado, esperado,
         'guardado ' || guardado || ' y desde el origen debería ser ' || esperado
    from dif
   order by 1 desc, 2, 4, 5, 3, 6
   limit 300
) r;
