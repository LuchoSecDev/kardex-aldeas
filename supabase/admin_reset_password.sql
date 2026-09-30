-- Crea la cuenta de la administradora o la RESETEA a una contraseña temporal.
-- Sirve para tres cosas:
--   1. Dejar la contraseña inicial (después de correr admin_auth.sql).
--   2. Recuperar el acceso si se perdió la contraseña Y el código de recuperación.
--   3. Restablecer la cuenta antes de correr la prueba opt-in de tests/integration/admin-lifecycle.test.ts.
--
-- ANTES DE CORRERLO: reemplaza PON-AQUI-LA-CLAVE-TEMPORAL por la contraseña
-- temporal (mín. 10 caracteres). NO guardes la contraseña real en este archivo
-- ni la subas a git: vuelve a dejar el texto de reemplazo antes de guardar.
--
-- La cuenta queda con must_change = true: el primer ingreso obliga a cambiarla
-- y genera un código de recuperación nuevo. Cierra todas las sesiones abiertas
-- y quita cualquier bloqueo.

insert into admin_account (id, password_hash, must_change, recovery_hash, failed_count, locked_until, updated_at)
values (1, extensions.crypt('PON-AQUI-LA-CLAVE-TEMPORAL', extensions.gen_salt('bf')), true, null, 0, null, now())
on conflict (id) do update
  set password_hash = excluded.password_hash,
      must_change   = true,
      recovery_hash = null,
      failed_count  = 0,
      locked_until  = null,
      updated_at    = now();

delete from admin_sessions where true;
