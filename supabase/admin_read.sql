-- Lectura de la administradora (nutricionista): Fase B del plan 001.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de admin_auth.sql.
-- Es aditivo y SOLO LECTURA: ninguna de estas funciones escribe datos.
--
-- Cada función valida el token de administradora (y que la contraseña ya no
-- sea temporal). Un token de comunidad NO sirve aquí.

-- Resumen de todas las comunidades para un mes: cuántos productos tienen
-- datos, cuándo fue la última actividad y en qué semanas hay registros.
-- weeks_active[i] = true si esa semana (0..4) tiene alguna entrada o salida
-- distinta de cero en cualquier producto.
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
        from generate_series(0, 4) as w
        order by w
      )
    from communities c
    order by c.name;
end;
$$;

create or replace function admin_load_month(p_token text, p_community text, p_year int, p_month int)
returns setof kardex_records
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _admin_session(p_token);
  return query
    select * from kardex_records
     where community = p_community and year = p_year and month = p_month;
end;
$$;

create or replace function admin_load_ajustes(p_token text, p_community text, p_year int, p_month int)
returns setof ajustes
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _admin_session(p_token);
  return query
    select * from ajustes
     where community = p_community and year = p_year and month = p_month
     order by created_at asc;
end;
$$;

create or replace function admin_load_ajustes_history(p_token text, p_community text, p_limit int default 200)
returns setof ajustes
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _admin_session(p_token);
  return query
    select * from ajustes
     where community = p_community
     order by created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

create or replace function admin_months_with_data(p_token text, p_community text)
returns table (year int, month int)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _admin_session(p_token);
  return query
    select distinct r.year, r.month from kardex_records r
     where r.community = p_community;
end;
$$;

grant execute on function admin_communities_overview(text, int, int)        to anon;
grant execute on function admin_load_month(text, text, int, int)            to anon;
grant execute on function admin_load_ajustes(text, text, int, int)          to anon;
grant execute on function admin_load_ajustes_history(text, text, int)       to anon;
grant execute on function admin_months_with_data(text, text)                to anon;
