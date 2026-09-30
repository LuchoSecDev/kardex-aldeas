-- Semana 6 de cierre (plan 004, hallazgo H1) — archivo 4 de 5: resumen de comunidades con 6 semanas.
-- Correr los 5 EN ORDEN en el SQL Editor, ANTES de desplegar la versión nueva de la app. Es seguro
-- repetirlos y NO rompe la app actual: el servidor sigue aceptando los arreglos de 5 semanas (35/5/5).
-- Va en archivos chicos: el editor no deja pegar más de ~100 líneas.

-- Resumen de todas las comunidades para un mes. weeks_active[i] = true si esa semana (0..5)
-- tiene alguna entrada o salida distinta de cero; ahora son 6 valores (la pantalla solo
-- muestra el sexto en los meses que tienen semana de cierre). Solo lectura; token de administradora.
create or replace function admin_communities_overview(p_token text, p_year int, p_month int)
returns table (
  name           text,
  has_pin        boolean,
  last_update    timestamptz,
  products_count int,
  weeks_active   boolean[]
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _admin_session(p_token);

  return query
    select
      c.name,
      (c.pin_hash is not null),
      (select max(r.updated_at) from kardex_records r where r.community = c.name),
      (select count(*)::int from kardex_records r
        where r.community = c.name and r.year = p_year and r.month = p_month),
      array(
        select exists (
          select 1 from kardex_records r
           where r.community = c.name and r.year = p_year and r.month = p_month
             and (
               coalesce((r.entries ->> w)::numeric, 0) <> 0
               or exists (
                 select 1
                   from jsonb_array_elements(r.exits) with ordinality as e(val, idx)
                  where idx between w * 7 + 1 and w * 7 + 7
                    and (e.val #>> '{}')::numeric <> 0
               )
             )
        )
        from generate_series(0, 5) as w
        order by w
      )
    from communities c
    order by c.name;
end;
$$;

grant execute on function admin_communities_overview(text, int, int) to anon;
