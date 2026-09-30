-- Semana 6 de cierre (plan 004, hallazgo H1) — archivo 1 de 5: amplía las semanas permitidas (0 a 5) y los ajustes.
-- Correr los 5 EN ORDEN en el SQL Editor, ANTES de desplegar la versión nueva de la app. Es seguro
-- repetirlos y NO rompe la app actual: el servidor sigue aceptando los arreglos de 5 semanas (35/5/5).
-- Va en archivos chicos: el editor no deja pegar más de ~100 líneas.

-- Las semanas pasan de 0-4 a 0-5 (la 5 es la semana 6, de cierre del mes). Se borran los CHECK
-- que hablan de week_index, sea cual sea su nombre, y se vuelven a crear con el rango nuevo.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
      from pg_constraint
     where contype = 'c'
       and conrelid in ('ajustes'::regclass, 'week_submissions'::regclass)
       and pg_get_constraintdef(oid) ilike '%week_index%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table ajustes          add constraint ajustes_week_index_check          check (week_index between 0 and 5);
alter table week_submissions add constraint week_submissions_week_index_check check (week_index between 0 and 5);

-- Ajuste auditado (append-only): ahora acepta la semana 6 (índice 5).
create or replace function kardex_insert_ajuste(
  p_token text, p_product_id text, p_year int, p_month int, p_week_index int,
  p_saldo_anterior numeric, p_saldo_nuevo numeric, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_motivo    text := btrim(p_motivo);
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11
     or p_week_index not between 0 and 5 then
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

  insert into ajustes
    (community, product_id, year, month, week_index, saldo_anterior, saldo_nuevo, motivo)
  values
    (v_community, p_product_id, p_year, p_month, p_week_index, p_saldo_anterior, p_saldo_nuevo, v_motivo);
end;
$$;

grant execute on function kardex_insert_ajuste(text, text, int, int, int, numeric, numeric, text) to anon;
