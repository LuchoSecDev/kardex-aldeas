-- Cadena de saldos en el servidor (plan 013, fase 1) — 4 de 6: kardex_insert_ajuste atómico y con meses cerrados.
-- Requiere kardex_chain_1.sql y _2.sql. Cambia lo que devuelve (antes nada): ahora devuelve la versión nueva de la fila del producto,
-- o null si no hubo que tocar ninguna. Por eso se borra y se crea de nuevo (con su permiso) en este mismo script.
-- Con los interruptores APAGADOS se comporta como antes (solo inserta el ajuste, con el bloqueo por producto).
--   closed_month_rule: un ajuste en un mes que requiere la ventana se rechaza (MES_CERRADO).
--   server_chain: al insertar el ajuste, la fila de ese mes (si existe) se recalcula EN LA MISMA transacción, y no se queda con
--   saldos viejos entre el ajuste y el siguiente guardado de la pantalla.
-- Las reglas del ajuste no cambian: saldo nuevo >= 0 y motivo de 1 a 500 caracteres.

drop function if exists kardex_insert_ajuste(text, text, int, int, int, numeric, numeric, text);

create or replace function kardex_insert_ajuste(
  p_token text, p_product_id text, p_year int, p_month int, p_week_index int,
  p_saldo_anterior numeric, p_saldo_nuevo numeric, p_motivo text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_motivo    text := btrim(p_motivo);
  v_row       kardex_records%rowtype;
  v_now       timestamptz := clock_timestamp();
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11 or p_week_index not between 0 and 5 then
    raise exception 'Fecha inválida';
  end if;
  if not exists (select 1 from products where id = p_product_id) then
    raise exception 'Producto inválido';
  end if;
  if p_saldo_nuevo is null or p_saldo_nuevo < 0 or p_saldo_anterior is null then
    raise exception 'Saldo inválido';
  end if;
  if v_motivo is null or char_length(v_motivo) not between 1 and 500 then
    raise exception 'Motivo inválido';
  end if;

  perform _kardex_lock(v_community, p_product_id);
  if _kardex_setting('closed_month_rule') and _kardex_month_closed(v_community, p_product_id, p_year, p_month) then
    raise exception 'MES_CERRADO';
  end if;

  insert into ajustes (community, product_id, year, month, week_index, saldo_anterior, saldo_nuevo, motivo)
  values (v_community, p_product_id, p_year, p_month, p_week_index, p_saldo_anterior, p_saldo_nuevo, v_motivo);

  if not _kardex_setting('server_chain') then return null; end if;
  select * into v_row from kardex_records
   where community = v_community and year = p_year and month = p_month and product_id = p_product_id;
  if not found then return null; end if;
  update kardex_records
     set prev_balances = _kardex_cascade(_kardex_base(v_community, p_product_id, p_year, p_month),
                                         _kardex_overrides(v_community, p_product_id, p_year, p_month), v_row.entries, v_row.exits),
         updated_at = v_now
   where id = v_row.id;
  return v_now;
end;
$$;

grant execute on function kardex_insert_ajuste(text, text, int, int, int, numeric, numeric, text) to anon;
