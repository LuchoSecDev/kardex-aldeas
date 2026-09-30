-- Lista de mercado (plan 003, Fase D) — archivo 4 de 4: consolidado entre comunidades y catálogo.
-- Correr en el SQL Editor, después de market_admin_1..3.sql. Es seguro repetirlo.
-- Solo lectura; exige el token de administradora (uno de comunidad no sirve aquí).

-- Una fila por (comunidad, producto) de lo ENVIADO en la semana. La suma entre comunidades se
-- hace en la app (src/lib/marketConsolidated.ts). Solo listas ya enviadas; los borradores no.
create or replace function admin_market_consolidated(p_token text, p_week_start date)
returns table (
  community  text,
  kind       text,
  item_id    text,
  name       text,
  unit       text,
  is_event   boolean,
  sort_order int,
  quantity   numeric
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _admin_session(p_token);
  perform _market_check_week(p_week_start);
  return query
    select l.community, l.kind, i.id, i.name, i.unit, i.is_event, i.sort_order,
           (e.value #>> '{}')::numeric
      from market_lists l
     cross join lateral jsonb_each(l.sent_quantities) e
      join market_items i on i.id = e.key and i.kind = l.kind
     where l.week_start = p_week_start and l.sent_quantities is not null
     order by l.kind, i.sort_order, l.community;
end;
$$;

-- El catálogo completo de la lista (sin precios), para armar el Excel con el formato actual
-- (incluye los productos que no se pidieron, en cero).
create or replace function admin_market_catalog(p_token text)
returns table (
  id         text,
  kind       text,
  name       text,
  unit       text,
  is_event   boolean,
  sort_order int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _admin_session(p_token);
  return query
    select i.id, i.kind, i.name, i.unit, i.is_event, i.sort_order
      from market_items i
     where i.is_active
     order by i.kind, i.sort_order;
end;
$$;

grant execute on function admin_market_consolidated(text, date) to anon;
grant execute on function admin_market_catalog(text)            to anon;
