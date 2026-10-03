-- Aviso de errores al desarrollador (plan 007, Fase A2) — archivo 2 de 2. Es seguro repetirlo y no toca datos existentes.
-- Requiere dev_errors_1.sql y dev_alerts_1.sql, la extensión pg_net (viene con Supabase) y la Vault.
--
-- Alternativa a los «Database Webhooks» del panel (que necesitan el esquema `supabase_functions`; si tu proyecto no lo tiene, el
-- panel falla con «schema supabase_functions does not exist»): un trigger propio que, al guardarse una fila en
-- `system_error_logs`, llama con pg_net a la Edge Function `dev-alert` con el MISMO formato que mandaría el webhook.
--
-- Nada de este archivo es propio de tu proyecto: la dirección de la función y las claves se leen de la Vault (panel →
-- Integrations → Vault → Secrets → «Add new secret»), así no quedan en el repositorio ni en el historial del SQL Editor:
--   alert_function_url    https://<ID-DEL-PROYECTO>.supabase.co/functions/v1/dev-alert
--   alert_webhook_secret  la MISMA clave que ALERT_WEBHOOK_SECRET de los Secrets de la función
--   alert_anon_key        (opcional) la clave anon pública; solo hace falta si la función exige JWT
-- Si falta alguna de las dos primeras, el trigger no hace nada. Un aviso NUNCA debe impedir que el reporte se guarde: cualquier
-- error al armar o mandar la llamada se traga.

create or replace function dev_alert_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_url     text;
  v_secret  text;
  v_anon    text;
  v_headers jsonb;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'alert_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'alert_webhook_secret';
  select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'alert_anon_key';

  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-alert-secret', v_secret);
  if coalesce(v_anon, '') <> '' then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_anon);
  end if;

  perform net.http_post(
    url                  := v_url,
    headers              := v_headers,
    body                 := jsonb_build_object('type', 'INSERT', 'table', 'system_error_logs', 'schema', 'public',
                                               'record', to_jsonb(new), 'old_record', null),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end;
$$;

-- Solo la dispara el trigger: nadie la llama desde la app.
revoke all on function dev_alert_notify() from public, anon, authenticated;

drop trigger if exists dev_alert_notify_trg on system_error_logs;
create trigger dev_alert_notify_trg
  after insert on system_error_logs
  for each row execute function dev_alert_notify();
