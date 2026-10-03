-- Crea la cuenta del desarrollador (pantalla /dev) o la RESETEA a una contraseña temporal. Sirve para dos cosas:
--   1. Dejar la contraseña inicial (después de correr dev_auth_1.sql y dev_auth_2.sql).
--   2. Recuperar el acceso si se olvidó la contraseña (la cuenta del desarrollador NO tiene código de recuperación).
--
-- ANTES DE CORRERLO: reemplaza PON-AQUI-LA-CLAVE-TEMPORAL por la contraseña temporal (mín. 12 caracteres). NO guardes la
-- contraseña real en este archivo ni la subas a git: usa una copia local llamada `.env.dev-reset.sql` (los archivos `.env*` no
-- se suben) y deja aquí el texto de reemplazo. Después de correrlo, borra el contenido del SQL Editor (Supabase guarda lo que pegas).
--
-- La cuenta queda con must_change = true: el primer ingreso obliga a cambiarla. Cierra todas las sesiones abiertas y quita
-- cualquier bloqueo.

insert into dev_account (id, password_hash, must_change, failed_count, locked_until, updated_at)
values (1, extensions.crypt('PON-AQUI-LA-CLAVE-TEMPORAL', extensions.gen_salt('bf')), true, 0, null, now())
on conflict (id) do update
  set password_hash = excluded.password_hash,
      must_change   = true,
      failed_count  = 0,
      locked_until  = null,
      updated_at    = now();

delete from dev_sessions where true;
insert into dev_audit_log (action) values ('reset_clave');
