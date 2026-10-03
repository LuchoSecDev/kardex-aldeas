-- Acceso del desarrollador a la pantalla /dev (plan 007, Fase B1) — archivo 1 de 2: tablas y piezas internas.
-- Es seguro repetirlo y no toca nada existente. Requiere pgcrypto (viene con Supabase).
--
-- Una sola cuenta, con la pauta de la nutricionista (admin_auth.sql) pero en tablas y token APARTE: contraseña larga (mín. 12) con
-- bcrypt; la inicial es TEMPORAL (dev_reset_password.sql) y obliga a cambiarla; SIN código de recuperación (decisión de Lucho,
-- 2026-10-03: si se olvida, se resetea con ese script); 5 intentos fallidos = 15 minutos de bloqueo (alguien podría bloquear /dev a
-- propósito: no afecta a las comunidades ni a los avisos); sesión de 8 h deslizante guardada como hash. Un token de comunidad o de
-- la nutricionista nunca sirve aquí ni al revés (error distinto: SESION_DEV_INVALIDA).

create extension if not exists pgcrypto;

create table if not exists dev_account (
  id            smallint primary key default 1 check (id = 1),
  password_hash text not null,
  must_change   boolean not null default true,
  failed_count  int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists dev_sessions (
  token_hash text primary key,
  expires_at timestamptz not null
);

-- Lo que cambia datos desde /dev (resolver problemas, cambiar la clave) queda anotado aquí.
create table if not exists dev_audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  action text not null check (char_length(action) between 1 and 40),
  detail jsonb not null default '{}'::jsonb
);

alter table dev_account   enable row level security;
alter table dev_sessions  enable row level security;
alter table dev_audit_log enable row level security;
revoke all on dev_account   from anon, authenticated;
revoke all on dev_sessions  from anon, authenticated;
revoke all on dev_audit_log from anon, authenticated;

-- Valida el token del desarrollador y lo renueva. Mientras la contraseña sea temporal (must_change), solo deja cambiarla.
create or replace function _dev_session(p_token text, p_allow_pending boolean default false)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows int;
begin
  if p_token is null or p_token = '' then raise exception 'SESION_DEV_INVALIDA'; end if;
  update dev_sessions
     set expires_at = now() + interval '8 hours'
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and expires_at > now();
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'SESION_DEV_INVALIDA'; end if;
  if not p_allow_pending and (select must_change from dev_account where id = 1) then
    raise exception 'DEV_DEBE_CAMBIAR_CLAVE';
  end if;
end;
$$;

-- Suma un intento fallido y bloquea al llegar a 5. Quien la llama debe RETORNAR (no lanzar excepción) para que se conserve.
create or replace function _dev_register_failure()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update dev_account
     set failed_count = case when locked_until is not null and locked_until <= now() then 1 else failed_count + 1 end,
         locked_until = case when locked_until is not null and locked_until <= now() then null else locked_until end
   where id = 1;
  update dev_account set locked_until = now() + interval '15 minutes', failed_count = 0 where id = 1 and failed_count >= 5;
end;
$$;

create or replace function _dev_assert_not_locked()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from dev_account where id = 1 and locked_until is not null and locked_until > now()) then
    raise exception 'DEV_BLOQUEADO';
  end if;
end;
$$;

revoke execute on function _dev_session(text, boolean) from public, anon, authenticated;
revoke execute on function _dev_register_failure()     from public, anon, authenticated;
revoke execute on function _dev_assert_not_locked()    from public, anon, authenticated;
