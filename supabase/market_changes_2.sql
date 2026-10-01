-- Zona de cambios de la lista de mercado (plan 008, Fase A) — archivo 2 de 6: guardar las notas.
-- Correr los 6 EN ORDEN (1 a 6) en el SQL Editor, después de market_lists_*.sql y market_admin_*.sql.

-- Guardado automático de las notas de UN tipo de lista (borrador o cambios tras enviar).
create or replace function market_list_save_changes(
  p_token text, p_week_start date, p_kind text, p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_community text := _session_community(p_token);
  v_current   jsonb;
begin
  perform _market_check_week(p_week_start);
  select l.changes into v_current
    from market_lists l
   where l.community = v_community and l.week_start = p_week_start and l.kind = p_kind;

  insert into market_lists (community, week_start, kind, changes)
  values (v_community, p_week_start, p_kind, _market_clean_changes(p_kind, p_changes, v_current))
  on conflict (community, week_start, kind) do update
    set changes = excluded.changes,
        updated_at = now();
end;
$$;

grant execute on function market_list_save_changes(text, date, text, jsonb) to anon;
