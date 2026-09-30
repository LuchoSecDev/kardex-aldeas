-- Lista de mercado (plan 003, Fase A) — archivo 4 de 5: guardar borrador y participantes.
-- Correr los 5 EN ORDEN (1 a 5) en el SQL Editor, después de week_submissions.sql, y luego
-- los market_seed_N.sql. Va en archivos chicos: el editor no deja pegar más de ~100 líneas.
-- Es seguro repetirlos. No hay precios (plan 003).

-- Guardado automático de UN tipo de lista (borrador o cambios tras enviar).
create or replace function market_list_save(
  p_token text, p_week_start date, p_kind text, p_quantities jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_clean     jsonb;
begin
  perform _market_check_week(p_week_start);
  v_clean := _market_clean_quantities(p_kind, p_quantities);

  insert into market_lists (community, week_start, kind, quantities)
  values (v_community, p_week_start, p_kind, v_clean)
  on conflict (community, week_start, kind) do update
    set quantities = excluded.quantities,
        updated_at = now();
end;
$$;

-- Número fijo de participantes de la comunidad (cambia solo si llega o se va alguien).
create or replace function market_set_participants(p_token text, p_participants int)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
begin
  if p_participants is null or p_participants not between 1 and 500 then
    raise exception 'Participantes inválidos';
  end if;
  update communities set participants = p_participants where name = v_community;
end;
$$;

grant execute on function market_list_save(text, date, text, jsonb)     to anon;
grant execute on function market_set_participants(text, int)            to anon;
