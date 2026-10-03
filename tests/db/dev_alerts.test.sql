-- Pruebas de supabase/dev_alerts_1.sql (plan 007, Fase A2: estado de las alertas) contra un Postgres local. Las llamadas se
-- hacen como el rol `anon`, igual que la app: la tabla debe estar cerrada para ella.

\set ON_ERROR_STOP on
\set QUIET on

drop schema if exists tst cascade;
create schema tst;
grant usage on schema tst to anon;

create function tst.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function tst.raises(stmt text, expected text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm like '%' || expected || '%' then return; end if;
    raise exception 'FALLÓ: % (esperaba "%", salió "%")', msg, expected, sqlerrm;
  end;
  raise exception 'FALLÓ: % (no falló)', msg;
end $$;

grant execute on function tst.ok(boolean, text), tst.raises(text, text, text) to anon;

-- Como dueño: hay exactamente una fila y empieza en «nunca avisó».
do $$
begin
  perform tst.ok((select count(*) from dev_alert_state) = 1, 'una sola fila de estado');
  perform tst.ok((select last_alert_at from dev_alert_state where id = 1) = 'epoch'::timestamptz, 'empieza sin aviso previo');
  perform tst.raises($q$insert into dev_alert_state (id) values (2)$q$, 'violates check constraint', 'no se puede crear una segunda fila');
  perform tst.raises($q$insert into dev_alert_state (id) values (1)$q$, 'duplicate key', 'ni repetir la primera');
  perform tst.ok((select relrowsecurity from pg_class where oid = 'dev_alert_state'::regclass), 'la seguridad por filas (RLS) está activa, aunque anon ya no tenga permisos');
end $$;

-- Volver a correr el script no cambia nada (es reejecutable): la fila y su fecha se conservan.
update dev_alert_state set last_alert_at = '2026-10-02 12:00:00+00' where id = 1;
\i supabase/dev_alerts_1.sql
do $$
begin
  perform tst.ok((select count(*) from dev_alert_state) = 1, 'sigue habiendo una sola fila');
  perform tst.ok((select last_alert_at from dev_alert_state where id = 1) = '2026-10-02 12:00:00+00'::timestamptz, 'repetir el script no pisa la fecha del último aviso');
end $$;

-- La app (anon) no ve ni toca el estado.
set role anon;
do $$
begin
  perform tst.raises('select * from dev_alert_state', 'permission denied', 'anon no lee el estado');
  perform tst.raises($q$update dev_alert_state set last_alert_at = now() where id = 1$q$, 'permission denied', 'anon no lo actualiza');
  perform tst.raises($q$insert into dev_alert_state (id) values (1)$q$, 'permission denied', 'anon no inserta');
  perform tst.raises($q$delete from dev_alert_state where id = 1$q$, 'permission denied', 'anon no borra');
end $$;
reset role;

-- La actualización condicional que usa la función: solo gana quien encuentra el último aviso más viejo que el corte.
do $$
declare ganó int;
begin
  update dev_alert_state set last_alert_at = '2026-10-02 12:00:00+00' where id = 1;
  -- Corte anterior al último aviso: nadie toma el turno.
  update dev_alert_state set last_alert_at = '2026-10-02 12:40:00+00' where id = 1 and last_alert_at < '2026-10-02 11:50:00+00';
  get diagnostics ganó = row_count;
  perform tst.ok(ganó = 0, 'con un aviso reciente no se toma el turno');
  -- Corte posterior: se toma el turno una vez, y la segunda vez ya no.
  update dev_alert_state set last_alert_at = '2026-10-02 12:40:00+00' where id = 1 and last_alert_at < '2026-10-02 12:10:00+00';
  get diagnostics ganó = row_count;
  perform tst.ok(ganó = 1, 'con el último aviso viejo se toma el turno');
  update dev_alert_state set last_alert_at = '2026-10-02 12:41:00+00' where id = 1 and last_alert_at < '2026-10-02 12:11:00+00';
  get diagnostics ganó = row_count;
  perform tst.ok(ganó = 0, 'el segundo que llega ya no lo toma');
  update dev_alert_state set last_alert_at = 'epoch' where id = 1;
end $$;

\echo dev_alerts: OK
