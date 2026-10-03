-- Cadena de saldos en el servidor (plan 013, fase 1) — 3 de 6: kardex_save_product con bloqueo, meses cerrados y saldos del servidor.
-- Requiere kardex_chain_1.sql y _2.sql. Reemplaza la versión del plan 012 (misma firma): con los interruptores APAGADOS se comporta
-- igual que antes (solo agrega el bloqueo por producto). Los interruptores se encienden a mano, ver kardex_chain_1.sql.
--   closed_month_rule encendido: un mes que requiere la ventana de corrección se rechaza con MES_CERRADO (también a clientes viejos).
--   server_chain encendido: el servidor calcula los saldos anteriores (heredando el último cierre y con los ajustes vigentes) e ignora
--   los que mande el cliente.

create or replace function kardex_save_product(
  p_token text, p_year int, p_month int, p_product_id text,
  p_exits jsonb, p_entries jsonb, p_prev_balances jsonb,
  p_check_version boolean default false, p_expected_updated_at timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_current   timestamptz;
  v_rows      int;
  v_prev      jsonb := p_prev_balances;
  v_now       timestamptz := clock_timestamp();
begin
  perform _kardex_check_row(p_year, p_month, p_product_id, p_exits, p_entries, p_prev_balances);
  perform _kardex_lock(v_community, p_product_id);
  if _kardex_setting('closed_month_rule') and _kardex_month_closed(v_community, p_product_id, p_year, p_month) then
    raise exception 'MES_CERRADO';
  end if;
  if _kardex_setting('server_chain') then
    v_prev := _kardex_cascade(_kardex_base(v_community, p_product_id, p_year, p_month),
                              _kardex_overrides(v_community, p_product_id, p_year, p_month), p_entries, p_exits);
  end if;

  if p_check_version then
    select updated_at into v_current from kardex_records
     where community = v_community and year = p_year and month = p_month and product_id = p_product_id
       for update;
    if found then
      if p_expected_updated_at is distinct from v_current then raise exception 'CONFLICTO_VERSION'; end if;
      update kardex_records
         set exits = p_exits, entries = p_entries, prev_balances = v_prev, updated_at = v_now
       where community = v_community and year = p_year and month = p_month and product_id = p_product_id;
      return v_now;
    end if;
    if p_expected_updated_at is not null then raise exception 'CONFLICTO_VERSION'; end if;
    insert into kardex_records (community, year, month, product_id, exits, entries, prev_balances, updated_at)
    values (v_community, p_year, p_month, p_product_id, p_exits, p_entries, v_prev, v_now)
    on conflict (community, year, month, product_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'CONFLICTO_VERSION'; end if;
    return v_now;
  end if;

  insert into kardex_records (community, year, month, product_id, exits, entries, prev_balances, updated_at)
  values (v_community, p_year, p_month, p_product_id, p_exits, p_entries, v_prev, v_now)
  on conflict (community, year, month, product_id) do update
    set exits = excluded.exits, entries = excluded.entries,
        prev_balances = excluded.prev_balances, updated_at = excluded.updated_at;
  return v_now;
end;
$$;

grant execute on function kardex_save_product(text, int, int, text, jsonb, jsonb, jsonb, boolean, timestamptz) to anon;
