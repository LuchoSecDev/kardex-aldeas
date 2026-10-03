-- DIAGNÓSTICO 5 de 5 (plan 013, Fase 0) — SOLO LECTURA: forma y valores de lo guardado, y estado de los ajustes.
-- Pega y corre TODO en el SQL Editor. Es un solo `select`: no cambia nada. Cada fila es un hallazgo (hasta 100 por tipo):
--   FORMA            arreglos que no son 35/5/5 ni 42/6/6 (la función de guardado los rechaza; no debería haber ninguno).
--   NO NUMÉRICO      algún valor que no es número dentro de salidas, entradas o saldos.
--   NEGATIVO         entradas o salidas menores que cero (no se permiten; no debería haber ninguno).
--   DECIMALES        valores con más de 4 decimales (pregunta Q6 del plan: redondear los saldos calculados a 4 decimales).
--   AJUSTE REPETIDO  semanas con más de un ajuste (vale el último; informativo).
--   AJUSTE SEMANA    ajustes con la semana fuera de 0 a 5.
--   ENVIADAS         cuántas semanas ya enviadas a la nutricionista hay por comunidad (las que una reparación cambiaría).
-- Sin filas de un tipo = no hay hallazgos de ese tipo.

with filas as (select k.*, jsonb_array_length(k.prev_balances) as np, jsonb_array_length(k.entries) as ne,
                      jsonb_array_length(k.exits) as nx from kardex_records k),
vals as (  -- cada número guardado, con su origen
  select f.community, f.product_id, f.year, f.month, 'salidas'::text as campo, e.val
    from filas f, jsonb_array_elements(f.exits) as e(val)
  union all
  select f.community, f.product_id, f.year, f.month, 'entradas', e.val from filas f, jsonb_array_elements(f.entries) as e(val)
  union all
  select f.community, f.product_id, f.year, f.month, 'saldos anteriores', e.val from filas f, jsonb_array_elements(f.prev_balances) as e(val)
),
hallazgos as (
  select 'FORMA' as tipo, community, product_id as producto, year, month + 1 as mes,
         'salidas ' || nx || ', entradas ' || ne || ', saldos ' || np as detalle
    from filas where not ((nx = 35 and ne = 5 and np = 5) or (nx = 42 and ne = 6 and np = 6))
  union all
  select 'NO NUMÉRICO', community, product_id, year, month + 1, campo || ' trae ' || jsonb_typeof(val)
    from vals where jsonb_typeof(val) <> 'number'
  union all
  select 'NEGATIVO', community, product_id, year, month + 1, campo || ' = ' || (val #>> '{}')
    from vals where campo <> 'saldos anteriores'
                and case when jsonb_typeof(val) = 'number' then (val #>> '{}')::numeric < 0 else false end
  union all
  select 'DECIMALES', community, product_id, year, month + 1, campo || ' = ' || (val #>> '{}')
    from vals where case when jsonb_typeof(val) = 'number'
                         then (val #>> '{}')::numeric * 10000 <> trunc((val #>> '{}')::numeric * 10000)
                         else false end
  union all
  select 'AJUSTE REPETIDO', community, product_id, year, month + 1,
         'semana ' || (week_index + 1) || ' tiene ' || count(*) || ' ajustes'
    from ajustes group by community, product_id, year, month, week_index having count(*) > 1
  union all
  select 'AJUSTE SEMANA', community, product_id, year, month + 1, 'semana ' || week_index
    from ajustes where week_index not between 0 and 5
  union all
  select 'ENVIADAS', community, '', null::int, null::int, count(*) || ' semanas enviadas'
    from week_submissions group by community
),
numerados as (select h.*, row_number() over (partition by h.tipo order by h.community, h.year, h.mes, h.producto) as k from hallazgos h)
select tipo, community as comunidad, producto, year as año, mes, detalle
  from numerados where k <= 100
 order by tipo, comunidad, año, mes, producto;
