-- Cadena de saldos en el servidor (plan 013, fase 1) — 5 de 6: auditoría de correcciones, token de cadena, historial y bases heredadas.
-- Requiere kardex_chain_1.sql y _2.sql. Es seguro repetirlo. No cambia nada existente.

-- Registro de cada corrección: append-only (sin permisos de escritura Y con un disparador que lo impide incluso a quien tenga permisos).
-- El actor es la COMUNIDAD (la sesión no identifica a una persona). Se borra solo con cleanup_test_data.sql, que desactiva el disparador.
create table if not exists kardex_corrections (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  community    text not null,
  product_id   text not null,
  reason       text not null check (char_length(reason) between 5 and 500),
  months       jsonb not null,
  chain_before text not null,
  chain_after  text not null
);
alter table kardex_corrections enable row level security;
revoke all on kardex_corrections from anon, authenticated;

create or replace function _kardex_corrections_append_only() returns trigger
language plpgsql
as $$ begin raise exception 'kardex_corrections es solo de inserción'; end $$;

drop trigger if exists kardex_corrections_no_update on kardex_corrections;
create trigger kardex_corrections_no_update before update or delete on kardex_corrections
  for each row execute function _kardex_corrections_append_only();
drop trigger if exists kardex_corrections_no_truncate on kardex_corrections;
create trigger kardex_corrections_no_truncate before truncate on kardex_corrections
  for each statement execute function _kardex_corrections_append_only();

-- Resumen de TODO el alcance de una corrección: cada fila del producto desde el mes pedido (año, mes y versión), la fila que aporta la
-- base heredada y los ajustes del producto desde ese mes. Si cambia, aparece o desaparece cualquiera de esas piezas, cambia el token.
create or replace function _kardex_chain_token(p_community text, p_product text, p_from_ym int) returns text
language sql stable security definer set search_path = public, extensions
as $$
  select md5(
    coalesce((select string_agg(r.year || '-' || r.month || '@' || to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
                                ',' order by r.year, r.month)
                from kardex_records r
               where r.community = p_community and r.product_id = p_product and (r.year * 12 + r.month) >= p_from_ym), '')
    || '|' ||
    coalesce((select r.year || '-' || r.month || '@' || to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
                from kardex_records r
               where r.community = p_community and r.product_id = p_product and (r.year * 12 + r.month) < p_from_ym
               order by r.year desc, r.month desc limit 1), '')
    || '|' ||
    coalesce((select string_agg(a.id::text, ',' order by a.id) from ajustes a
               where a.community = p_community and a.product_id = p_product and (a.year * 12 + a.month) >= p_from_ym), ''))
$$;

-- Lo que la ventana de corrección necesita: la base heredada, el token y las filas del producto desde ese mes (con sus ajustes
-- vigentes). La comunidad sale SOLO del token. La lectura no tiene tope.
create or replace function kardex_product_history(p_token text, p_product_id text, p_year int, p_month int) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11 then raise exception 'Fecha inválida'; end if;
  if not exists (select 1 from products where id = p_product_id) then raise exception 'Producto inválido'; end if;
  return jsonb_build_object(
    'base', _kardex_base(v_community, p_product_id, p_year, p_month),
    'chain_token', _kardex_chain_token(v_community, p_product_id, p_year * 12 + p_month),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'year', r.year, 'month', r.month, 'exits', r.exits, 'entries', r.entries, 'prev_balances', r.prev_balances,
                        'updated_at', r.updated_at, 'overrides', _kardex_overrides(v_community, p_product_id, r.year, r.month))
                      order by r.year, r.month)
                from kardex_records r
               where r.community = v_community and r.product_id = p_product_id and (r.year * 12 + r.month) >= p_year * 12 + p_month),
              '[]'::jsonb));
end;
$$;

-- Saldo heredado de cada producto para un mes: el cierre de su fila más reciente anterior (D14). La pantalla lo usa para los
-- productos que no tienen fila en el mes anterior inmediato.
create or replace function kardex_inherited_bases(p_token text, p_year int, p_month int)
returns table (product_id text, base numeric)
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_community text := _session_community(p_token);
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11 then raise exception 'Fecha inválida'; end if;
  return query
    select distinct on (r.product_id) r.product_id, round(_kardex_closing(r.prev_balances, r.entries, r.exits), 4)
      from kardex_records r
     where r.community = v_community and (r.year * 12 + r.month) < (p_year * 12 + p_month)
     order by r.product_id, r.year desc, r.month desc;
end;
$$;

revoke execute on function _kardex_corrections_append_only()      from public, anon, authenticated;
revoke execute on function _kardex_chain_token(text, text, int)    from public, anon, authenticated;
grant execute on function kardex_product_history(text, text, int, int) to anon;
grant execute on function kardex_inherited_bases(text, int, int)       to anon;
