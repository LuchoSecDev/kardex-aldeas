---
paths:
  - "supabase/**"
  - "**/*.sql"
---

# Reglas para SQL (Supabase)

- Ningún script se corre en producción sin la aprobación de Lucho: déjalo escrito y dile en qué orden correrlo.
- No hay copia del esquema de producción y `kardex_records` se creó a mano: no asumas que el SQL del repo coincide con producción.
- Scripts nuevos: máximo 98 líneas si el archivo termina en salto de línea (el SQL Editor no admite pegar más y `sqlScripts.test.ts` exige menos de 100 contando la línea vacía final). Si se pasa, divídelo en `_1`, `_2`…. Los antiguos más largos no se dividen: `admin_auth`, `admin_read`, `session_access`, `week_submissions`, `pin_rate_limit`, `products_fruver` y `products_panaderia_abarrotes`.
- Un script nuevo se agrega en tres lugares: `supabase/README.md` (tabla de orden), la lista de `tests/db/run.sh` y su prueba `tests/db/<tema>.test.sql`. `tests/unit/sqlScripts.test.ts` comprueba solo lo de `run.sh` y el README (y el límite de líneas únicamente en `market_changes_*`); la prueba de `tests/db/` es convención y nada la comprueba.
- El orden de `run.sh` es el de producción: un script fuera de orden puede reabrir permisos.
- Las pruebas SQL se corren en el Postgres local desechable, no en Supabase: `npm run test:db` (la configuración de esta máquina está en `CLAUDE.local.md`).
- Todo acceso va por funciones RPC `security definer` con `set search_path`; valida el token de sesión al inicio (`_admin_session` o el de la comunidad).
- RLS siempre activo y tablas cerradas: `revoke all` al crear una tabla y `grant execute` solo de las funciones necesarias a `anon`. En scripts nuevos, nunca abras una tabla al acceso directo ni uses políticas `using (true)` (los viejos las tuvieron y `lock_down_*` las cerró).
- Validar toda entrada dentro de la función (tipos, largos, rangos) y lanzar errores con mensaje claro; no concatenes SQL con texto del usuario.
- `delete` y `update` siempre con `where` (Supabase rechaza el borrado sin `where`; usa `where true` si de verdad es total).
- Cambios de esquema o funciones: que sean reejecutables (`create or replace`, `if not exists`) y no destruyan datos existentes; si hay riesgo, explícalo a Lucho antes.
- Un script con datos sensibles (PIN, claves) no deja valores reales en el archivo ni en el chat más allá de lo necesario.
