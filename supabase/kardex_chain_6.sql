-- Cadena de saldos en el servidor (plan 013, fase 1) — 6 de 6: kardex_save_months, la corrección de un producto en varios meses.
-- Requiere kardex_chain_1.sql a _5.sql. Es una función NUEVA: no cambia nada existente.
--
-- La pantalla manda SOLO lo que la persona editó (entradas y salidas de cada mes) con la versión que leyó de cada fila y el token
-- de kardex_product_history; el servidor calcula los saldos anteriores (base heredada + ajustes vigentes), valida todo, y guarda en UNA
-- transacción: cualquier error revierte todo, incluida la auditoría. Errores esperados (todo mayúsculas): CONFLICTO_VERSION (algo cambió
-- o apareció desde que se leyó), ALCANCE_INCOMPLETO (faltan o sobran meses), CORRECCION_FUERA_DE_TOPE (más de 120 meses), SIN_CAMBIOS.
-- p_dry_run = true devuelve lo que se guardaría SIN escribir nada (la confirmación que ve la persona). Devuelve {chain_token, changed,
-- months: [{year, month, changed, prev_balances, closing}], sent_weeks: [{year, month, weeks}]}.

create or replace function kardex_save_months(
  p_token text, p_product_id text, p_year int, p_month int, p_reason text,
  p_months jsonb, p_chain_token text, p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_reason    text := btrim(p_reason);
  v_from      int  := p_year * 12 + p_month;
  v_scope     int;
  v_base      numeric;
  v_item      jsonb;
  v_row       kardex_records%rowtype;
  v_prev      jsonb;
  v_changed   boolean;  v_n int := 0;
  v_now       timestamptz := clock_timestamp();
  v_out       jsonb := '[]'::jsonb;  v_audit jsonb := '[]'::jsonb;  v_sent jsonb := '[]'::jsonb;
  v_token     text := p_chain_token;
begin
  if v_reason is null or char_length(v_reason) not between 5 and 500 or v_reason !~ '[[:alnum:]]' or v_reason ~ '[[:cntrl:]]' then
    raise exception 'Motivo inválido';
  end if;
  if p_year not between 2000 and 2100 or p_month not between 0 and 11 then raise exception 'Fecha inválida'; end if;
  if not exists (select 1 from products where id = p_product_id) then raise exception 'Producto inválido'; end if;
  if jsonb_typeof(p_months) is distinct from 'array' then raise exception 'Datos incompletos'; end if;

  perform _kardex_lock(v_community, p_product_id);
  select count(*) into v_scope from kardex_records r
   where r.community = v_community and r.product_id = p_product_id and (r.year * 12 + r.month) >= v_from;
  if v_scope > 120 then raise exception 'CORRECCION_FUERA_DE_TOPE'; end if;
  if _kardex_chain_token(v_community, p_product_id, v_from) is distinct from p_chain_token then raise exception 'CONFLICTO_VERSION'; end if;
  -- El conjunto de meses enviado debe ser EXACTAMENTE el del servidor (sin repetidos, ni faltantes, ni sobrantes).
  if v_scope = 0 or jsonb_array_length(p_months) <> v_scope
     or (select count(distinct (m ->> 'year') || '-' || (m ->> 'month')) from jsonb_array_elements(p_months) m) <> v_scope
     or exists (select 1 from jsonb_array_elements(p_months) m
                 where not exists (select 1 from kardex_records r
                                    where r.community = v_community and r.product_id = p_product_id
                                      and r.year = (m ->> 'year')::int and r.month = (m ->> 'month')::int
                                      and (r.year * 12 + r.month) >= v_from)) then
    raise exception 'ALCANCE_INCOMPLETO';
  end if;

  v_base := _kardex_base(v_community, p_product_id, p_year, p_month);
  for v_item in select m from jsonb_array_elements(p_months) m order by (m ->> 'year')::int, (m ->> 'month')::int loop
    select * into v_row from kardex_records r
     where r.community = v_community and r.product_id = p_product_id
       and r.year = (v_item ->> 'year')::int and r.month = (v_item ->> 'month')::int;
    if (v_item ->> 'expected_updated_at')::timestamptz is distinct from v_row.updated_at then raise exception 'CONFLICTO_VERSION'; end if;
    perform _kardex_check_row(v_row.year, v_row.month, p_product_id, v_item -> 'exits', v_item -> 'entries');
    v_prev := _kardex_cascade(v_base, _kardex_overrides(v_community, p_product_id, v_row.year, v_row.month),
                              v_item -> 'entries', v_item -> 'exits');
    v_base := round(_kardex_closing(v_prev, v_item -> 'entries', v_item -> 'exits'), 4);
    v_changed := row(v_item -> 'exits', v_item -> 'entries', v_prev) is distinct from row(v_row.exits, v_row.entries, v_row.prev_balances);
    v_out := v_out || jsonb_build_object('year', v_row.year, 'month', v_row.month, 'changed', v_changed,
                                         'prev_balances', v_prev, 'closing', v_base);
    if v_changed then
      v_n := v_n + 1;
      v_audit := v_audit || jsonb_build_object('year', v_row.year, 'month', v_row.month,
        'before', jsonb_build_object('exits', v_row.exits, 'entries', v_row.entries, 'prev_balances', v_row.prev_balances),
        'after',  jsonb_build_object('exits', v_item -> 'exits', 'entries', v_item -> 'entries', 'prev_balances', v_prev));
      v_sent := v_sent || coalesce((select jsonb_build_object('year', v_row.year, 'month', v_row.month, 'weeks', jsonb_agg(s.week_index order by s.week_index))
                                      from week_submissions s
                                     where s.community = v_community and s.year = v_row.year and s.month = v_row.month
                                    having count(*) > 0), '[]'::jsonb);
      if not p_dry_run then
        update kardex_records set exits = v_item -> 'exits', entries = v_item -> 'entries', prev_balances = v_prev, updated_at = v_now
         where id = v_row.id;
      end if;
    end if;
  end loop;
  if v_n = 0 then raise exception 'SIN_CAMBIOS'; end if;

  if not p_dry_run then
    v_token := _kardex_chain_token(v_community, p_product_id, v_from);
    insert into kardex_corrections (community, product_id, reason, months, chain_before, chain_after)
    values (v_community, p_product_id, v_reason, v_audit, p_chain_token, v_token);
  end if;
  return jsonb_build_object('chain_token', v_token, 'changed', v_n, 'months', v_out, 'sent_weeks', v_sent);
end;
$$;

grant execute on function kardex_save_months(text, text, int, int, text, jsonb, text, boolean) to anon;
