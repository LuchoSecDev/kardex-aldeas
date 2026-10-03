# Scripts SQL de Supabase

Todo lo que vive en la base está aquí como `.sql` y se corre **a mano** en el SQL Editor de Supabase (no hay
migraciones automáticas). Este archivo dice **en qué orden** y qué cuidar. El orden exacto es el de la lista de
[`../tests/db/run.sh`](../tests/db/run.sh), que carga todos los scripts en un Postgres local desechable y corre sus
pruebas: si agregas un script, agrégalo ahí también (y en este archivo).

## Orden

| # | Script | Para qué |
|---|---|---|
| — | *(tabla `kardex_records`)* | **No tiene `.sql`**: se creó a mano en Supabase. `tests/db/bootstrap.sql` tiene un equivalente solo para las pruebas. |
| 1 | `communities.sql` | Tabla de comunidades |
| 2 | `community_pin.sql` | PIN con bcrypt y funciones de creación/verificación |
| 3 | `pin_rate_limit.sql` | 5 intentos fallidos = bloqueo de 15 min |
| 4 | `products.sql`, luego `products_fruver.sql` y `products_panaderia_abarrotes.sql` | Catálogo del kardex (240 productos). Los dos últimos agregan el resto de las categorías y **no** los carga `run.sh` (las pruebas no los necesitan). |
| 5 | `ajustes.sql` | Ajustes de saldo auditados |
| 6 | `session_access.sql` | Sesiones por token y funciones `kardex_*` |
| 7 | `lock_down_direct_access.sql` | Cierra el acceso directo a las tablas. **Solo después de desplegar la app con tokens** (ya hecho). |
| 8 | `lock_down_kardex_records_delete.sql` | Sin borrado desde la app |
| 9 | `admin_auth.sql`, `admin_read.sql` | Cuenta y lectura de la nutricionista |
| 10 | `week_submissions.sql`, `admin_weekly_summary.sql` | Enviar semana, campanita, resumen semanal |
| 11 | `six_weeks_1..5.sql` | Semana 6 de cierre (plan 004) |
| 12 | `perf_1.sql`, `perf_2.sql` | Atajo de la «foto» de la semana |
| 13 | `market_lists_1..5.sql`, luego `market_seed_1..7.sql` | Lista de mercado (plan 003): tablas, funciones y catálogo |
| 14 | `market_admin_1..4.sql` | Lista de mercado para la nutricionista |
| 15 | `fixed_communities.sql` | Las 8 comunidades fijas (plan 005). **Muestra los PIN una sola vez.** |
| 16 | `lock_down_community_creation_1.sql`, `_2.sql` | Cierra la creación libre (plan 005). Después de `_1` hay que definir la clave de aprovisionamiento (ver el comentario del archivo). |
| 17 | `change_pin.sql` | La comunidad cambia su PIN (plan 006) |
| 18 | `market_changes_1..6.sql` | Zona de cambios de la lista de mercado (plan 008): notas del pedido, enviar, y verlas la nutricionista |
| 19 | `market_replies_1..4.sql` | Respuestas de la nutricionista a esos cambios y la campanita de las comunidades (plan 008, Fase D) |
| 20 | `dev_errors_1.sql` | Registro de errores del navegador (plan 007, Fase A): tabla `system_error_logs` y `dev_report_client_error`. Aditivo; la app falla en silencio si aún no está. Se ve en el Editor de tablas. |
| 21 | `dev_alerts_1.sql` | Estado de las alertas al desarrollador (plan 007, Fase A2): una fila con la hora del último aviso, para avisar como máximo cada 30 minutos. Tabla cerrada; la usa la Edge Function `dev-alert`. |
| 22 | `dev_alerts_2.sql` | El trigger que llama a la Edge Function `dev-alert` con pg_net cuando se guarda un reporte (plan 007, Fase A2). Lee la URL y las claves de la Vault. Alternativa a los Database Webhooks del panel. |
| 23 | `dev_auth_1.sql`, `dev_auth_2.sql` | Cuenta y sesión del desarrollador para la pantalla `/dev` (plan 007, Fase B1): contraseña con bcrypt, bloqueo por intentos, token aparte, auditoría. La clave inicial la pone `dev_reset_password.sql` (plantilla; la real va en `.env.dev-reset.sql`, que no se sube a git). |
| 24 | `dev_errors_2.sql`, `dev_errors_3.sql` | Lectura de los problemas agrupados (resumen y lista, luego detalle) y «marcar como resuelto» para `/dev` (plan 007, Fase B1). Todas las funciones exigen el token del desarrollador. |

Sueltos (no son parte del orden): `admin_reset_password.sql` (reset de la cuenta de la nutricionista; el real va en
`.env.admin-reset.sql`, que **no** se sube a git), `dev_reset_password.sql` (crea o resetea la cuenta del desarrollador; se corre
**después** de `dev_auth_1/2.sql`; el real va en `.env.dev-reset.sql`, que tampoco se sube, y la clave se borra del SQL Editor al
terminar) y `cleanup_test_data.sql` (borra todo lo que empiece por `ZZZ_TEST_`).

## Cuidados

- **Archivos de ≤ 100 líneas:** el SQL Editor corta lo que se pega más largo y deja el script a medias. Por eso hay
  `six_weeks_1..5`, `market_lists_1..5`, etc. Verifica siempre que se vea la última línea pegada.
- **El orden importa:** `pin_rate_limit.sql` vuelve a dar permiso a `verify_community_pin` y `lock_down_direct_access.sql`
  se lo quita. Cargar los scripts desordenados puede reabrir un permiso: las pruebas de `tests/db` y de integración lo detectan.
- **Un script a la vez, y limpiar el editor después.** Supabase guarda lo que pegas en tu cuenta: borra el contenido de los
  scripts con contraseñas o claves (reset de la cuenta, clave de aprovisionamiento).
- **Despliegue:** casi todos son aditivos y van **antes** de desplegar la app; los de cierre (`lock_down_*`) van **después**.
  Cada plan en [`../planes/`](../planes/README.md) dice el orden exacto.

## ¿Coincide el repositorio con producción?

No hay una foto del esquema real. Para comprobarlo (o para tener un respaldo del esquema), con la contraseña de la
base (Supabase → Project Settings → Database):

```bash
pg_dump --schema-only --no-owner --no-privileges --schema=public "postgresql://postgres:<CONTRASEÑA>@<host>:5432/postgres" > esquema_produccion.sql
```

y comparar con el que sale de cargar los scripts en un Postgres local (`bash tests/db/run.sh` lo deja armado). Las
diferencias son lo que se creó a mano y falta documentar (por ejemplo, la tabla `kardex_records`).
