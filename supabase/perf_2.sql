-- Rendimiento (2 de 2): la campanita de la nutricionista (se consulta cada minuto).
-- Correr DESPUES de perf_1.sql. Seguro repetirlo; devuelve lo mismo que antes.
create or replace function admin_notifications(p_token text)
returns table (
  id           uuid,
  community    text,
  year         int,
  month        int,
  week_index   int,
  submitted_at timestamptz,
  submit_count int,
  modified     boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform _admin_session(p_token);
  return query
    select t.id, t.community, t.year, t.month, t.week_index, t.submitted_at, t.submit_count, t.modified
      from (
        select s.id, s.community, s.year, s.month, s.week_index, s.submitted_at, s.submit_count, s.reviewed_at,
               _week_modified(s.community, s.year, s.month, s.week_index, s.snapshot,
                              greatest(s.submitted_at, s.reviewed_at)) as modified
          from week_submissions s
         where s.reviewed_at is null
            or s.submitted_at > now() - interval '90 days'
      ) t
     where t.reviewed_at is null or t.modified
     order by t.submitted_at desc
     limit 100;
end;
$$;

grant execute on function admin_notifications(text) to anon;
