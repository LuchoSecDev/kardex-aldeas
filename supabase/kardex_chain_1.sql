-- Cadena de saldos en el servidor (plan 013, fase 1) — 1 de 6: interruptores y funciones internas de cálculo.
-- Es seguro repetirlo y NO cambia el comportamiento actual: los dos interruptores nacen APAGADOS. Solo agrega funciones internas.
--
-- kardex_settings (tabla cerrada, una fila por interruptor):
--   closed_month_rule  los meses que requieren la ventana de corrección se rechazan en el guardado normal (MES_CERRADO).
--   server_chain       el servidor calcula los saldos anteriores que guarda (ignora los que mande el cliente) y hereda el último cierre.
-- Se encienden a mano, cuando la app nueva esté desplegada:  update kardex_settings set enabled = true where key = '...';

create table if not exists kardex_settings (
  key        text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table kardex_settings enable row level security;
revoke all on kardex_settings from anon, authenticated;
insert into kardex_settings (key, enabled) values ('closed_month_rule', false), ('server_chain', false) on conflict (key) do nothing;

create or replace function _kardex_setting(p_key text) returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select coalesce((select enabled from kardex_settings where key = p_key), false) $$;

-- «Hoy» en Bogotá, nunca en UTC ni con la hora del navegador. _kardex_today_at es pura (se prueba en los bordes del día) y las pruebas
-- locales reemplazan _kardex_today para simular fechas.
create or replace function _kardex_today_at(p_at timestamptz) returns date
language sql immutable
as $$ select (p_at at time zone 'America/Bogota')::date $$;
create or replace function _kardex_today() returns date
language sql stable
as $$ select _kardex_today_at(now()) $$;

-- Un bloqueo por comunidad y producto, que toman TODOS los escritores: serializa los guardados normales y las correcciones y cierra
-- la carrera de un mes posterior que alguien crea mientras tanto (una fila que todavía no existe no se puede bloquear).
create or replace function _kardex_lock(p_community text, p_product text) returns void
language sql security definer set search_path = public, extensions
as $$ select pg_advisory_xact_lock(hashtextextended(p_community || '|' || p_product, 0)) $$;

-- Saldo anterior de cada semana (la misma regla de balanceEngine.ts / computeCascade): la semana 0 parte de la base; la semana w
-- = anterior + entradas - salidas de la semana anterior; un ajuste manda en su semana. Los saldos se redondean a 4 decimales.
-- Devuelve tantas semanas como entradas (5 o 6).
create or replace function _kardex_cascade(p_base numeric, p_overrides jsonb, p_entries jsonb, p_exits jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  v_over jsonb := coalesce(p_overrides, '{}'::jsonb);
  v_out  jsonb := '[]'::jsonb;
  v_cur  numeric := 0;
  v_w    int;
begin
  for v_w in 0 .. jsonb_array_length(p_entries) - 1 loop
    if v_over ? v_w::text then
      v_cur := (v_over ->> v_w::text)::numeric;
    elsif v_w = 0 then
      v_cur := p_base;
    else
      v_cur := v_cur + coalesce((p_entries ->> (v_w - 1))::numeric, 0)
             - coalesce((select sum((e.val #>> '{}')::numeric)
                           from jsonb_array_elements(p_exits) with ordinality as e(val, idx)
                          where e.idx between (v_w - 1) * 7 + 1 and (v_w - 1) * 7 + 7), 0);
    end if;
    v_cur := round(v_cur, 4);
    v_out := v_out || to_jsonb(trim_scale(v_cur));
  end loop;
  return v_out;
end;
$$;

-- Saldo con el que cierra un mes (finalBalanceOfMonth): saldo anterior + entradas - salidas de su ÚLTIMA semana guardada.
create or replace function _kardex_closing(p_prev jsonb, p_entries jsonb, p_exits jsonb) returns numeric
language sql immutable
as $$
  select coalesce((p_prev ->> (jsonb_array_length(p_prev) - 1))::numeric, 0)
       + coalesce((p_entries ->> (jsonb_array_length(p_prev) - 1))::numeric, 0)
       - coalesce((select sum((e.val #>> '{}')::numeric)
                     from jsonb_array_elements(p_exits) with ordinality as e(val, idx)
                    where e.idx between (jsonb_array_length(p_prev) - 1) * 7 + 1 and (jsonb_array_length(p_prev) - 1) * 7 + 7), 0)
$$;

revoke execute on function _kardex_setting(text)                        from public, anon, authenticated;
revoke execute on function _kardex_today_at(timestamptz)                from public, anon, authenticated;
revoke execute on function _kardex_today()                              from public, anon, authenticated;
revoke execute on function _kardex_lock(text, text)                     from public, anon, authenticated;
revoke execute on function _kardex_cascade(numeric, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function _kardex_closing(jsonb, jsonb, jsonb)         from public, anon, authenticated;
