-- Semana 6 de cierre (plan 004, hallazgo H1) — archivo 3 de 5: enviar la semana 6 a la nutricionista.
-- Correr los 5 EN ORDEN en el SQL Editor, ANTES de desplegar la versión nueva de la app. Es seguro
-- repetirlos y NO rompe la app actual: el servidor sigue aceptando los arreglos de 5 semanas (35/5/5).
-- Va en archivos chicos: el editor no deja pegar más de ~100 líneas.

-- Enviar (o reenviar) una semana. Ahora acepta la semana 6 (índice 5). La foto de la semana
-- (_week_snapshot) y _week_has_activity ya eran genéricas: funcionan con cualquier semana.
create or replace function kardex_submit_week(p_token text, p_year int, p_month int, p_week_index int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_row       week_submissions%rowtype;
begin
  if p_year not between 2000 and 2100 or p_month not between 0 and 11
     or p_week_index not between 0 and 5 then
    raise exception 'Fecha inválida';
  end if;

  if not _week_has_activity(v_community, p_year, p_month, p_week_index) then
    raise exception 'SEMANA_VACIA';
  end if;

  insert into week_submissions (community, year, month, week_index, snapshot)
  values (v_community, p_year, p_month, p_week_index,
          _week_snapshot(v_community, p_year, p_month, p_week_index))
  on conflict (community, year, month, week_index) do update
    set snapshot     = excluded.snapshot,
        submitted_at = now(),
        submit_count = week_submissions.submit_count + 1,
        reviewed_at  = null
  returning * into v_row;

  return jsonb_build_object('submitted_at', v_row.submitted_at, 'submit_count', v_row.submit_count);
end;
$$;

grant execute on function kardex_submit_week(text, int, int, int) to anon;
