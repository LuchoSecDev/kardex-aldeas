-- Detalle y «marcar como resuelto» para la pantalla /dev (plan 007, Fase B1) — archivo 2 de 2. Es seguro repetirlo.
-- Requiere dev_errors_2.sql. Las dos funciones exigen el token del desarrollador.

-- Los últimos reportes de un grupo (1 a 100), para el «detalle técnico». El código vacío cuenta como «sin código».
create or replace function dev_error_group_detail(
  p_token text, p_community text, p_fn text, p_source text, p_level text, p_code text, p_limit int default 20
)
returns table (id bigint, created_at timestamptz, message text, app_version text, resolved boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _dev_session(p_token);
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Rango inválido'; end if;
  return query
    select l.id, l.created_at, l.message, l.app_version, l.resolved_at is not null
      from system_error_logs l
     where l.community = p_community and l.fn = p_fn and l.source = p_source and l.level = p_level
       and l.code is not distinct from nullif(p_code, '')
     order by l.created_at desc, l.id desc
     limit p_limit;
end;
$$;

-- Marca como resueltos los reportes abiertos de un grupo y lo anota en la auditoría. Devuelve cuántos cerró.
create or replace function dev_resolve_group(p_token text, p_community text, p_fn text, p_source text, p_level text, p_code text)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows int;
begin
  perform _dev_session(p_token);
  update system_error_logs
     set resolved_at = now()
   where community = p_community and fn = p_fn and source = p_source and level = p_level
     and code is not distinct from nullif(p_code, '') and resolved_at is null;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into dev_audit_log (action, detail)
    values ('resolver_grupo', jsonb_build_object('community', p_community, 'fn', p_fn, 'source', p_source,
                                                 'level', p_level, 'code', nullif(p_code, ''), 'rows', v_rows));
  end if;
  return v_rows;
end;
$$;

grant execute on function dev_error_group_detail(text, text, text, text, text, text, int) to anon;
grant execute on function dev_resolve_group(text, text, text, text, text, text)          to anon;
