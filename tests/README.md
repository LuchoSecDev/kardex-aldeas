# Pruebas del Kardex Digital

Objetivo: saber en minutos si algo se rompió y **dónde**, para repararlo rápido.
Hay cuatro niveles, del más rápido al más completo:

| Nivel | Qué prueba | Cómo se corre | Tarda |
|---|---|---|---|
| **Unitarias** (`unit/`) | La lógica pura: saldos encadenados, semáforo. No usan red. | `npm test` | < 1 s |
| **SQL local** (`db/`) | Los scripts `supabase/*.sql` completos (permisos, funciones, validaciones) contra un **Postgres local desechable**, sin tocar Supabase. Sirve para verificar un `.sql` nuevo **antes** de correrlo en producción. | `npm run test:db` (necesita PostgreSQL 14+ instalado) | ~5 s |
| **Integración** (`integration/`) | Las funciones de Supabase de verdad: PIN, sesiones, aislamiento entre comunidades, validaciones, bloqueo de tablas. | `npm run test:integration` | ~20 s |
| **Manuales** (`manual/checklist.md`) | Lo que solo se ve en pantalla: diseño móvil, Excel/PDF, avisos. | A mano, antes de cada release | ~10 min |

`npm run test:all` corre las unitarias y las de integración.

## Cuándo correrlas

- **Antes de cada commit que toque la app:** `npm test` (más `tsc --noEmit` y `npm run build`).
- **Antes de cada push a `main`:** `npm run test:all` y el checklist manual.
- **Después de correr cualquier `.sql` en Supabase:** `npm run test:integration`. Es la forma más rápida de comprobar que no se rompió ningún permiso.
- **Si algo falla en producción:** corre las de integración primero; si pasan, el problema está en la pantalla, no en la base de datos.

## Reglas de las pruebas de integración

Corren contra **la base de datos real** (solo hay un proyecto de Supabase), usando la anon key de `.env.local`, igual que la app. Por eso:

1. **Escriben solo en comunidades `ZZZ_TEST_BORRAR_AUTO_*`**, que crean ellas mismas con nombre único en cada corrida. Crear comunidades ya no es libre (plan 005): usan `provision_community` con la clave `PROVISION_KEY` de `.env.local` (nunca va al navegador ni al repositorio; se define con `supabase/lock_down_community_creation_1.sql`). Sin esa clave, las pruebas se detienen con un mensaje claro.
2. **Nunca prueban PINs incorrectos contra comunidades reales** (Maná, Fortaleza…): bloquearían a quien las usa. Lo único que se hace con Maná es un login sin PIN, que no cuenta como intento fallido.
3. **Dejan datos de prueba a propósito** (no pueden borrarlos: la app no tiene permiso de borrado). Cuando quieras, corre [`supabase/cleanup_test_data.sql`](../supabase/cleanup_test_data.sql) en el SQL Editor; borra todo lo que empiece por `ZZZ_TEST_`, y la consulta final debe devolver 0 filas.
4. Ninguna comunidad real debe llamarse `ZZZ_TEST_...`.

## Qué cubre cada archivo

- `unit/marketCalendar.test.ts` — calendario de la lista de mercado: reproduce los 52 viernes del cronograma 2026, plazo de las 5 pm (con festivos adelantados), semana por defecto y rótulos.
- `unit/marketSeed.test.ts` — el catálogo (285 ítems, sin precios) y que los `supabase/market_seed_N.sql` coincidan con lo que genera `npm run seed:market` (y sean cortos, sin comentarios).
- `unit/marketList.test.ts` — estado de una lista, limpieza de cantidades, búsqueda sin tildes, plazo y mensajes.
- `unit/saveQueue.test.ts` — la cola de guardado genérica (un guardado a la vez por clave, el último valor gana, reintentos, errores de validación).
- `unit/marketListDashboard.test.tsx` — la pantalla de la lista de mercado completa (jsdom + Testing Library, con el servicio simulado): guardado con pausa, pestañas, búsqueda, participantes, envío, errores, semanas.
- `unit/communityShell.test.tsx` — el selector Kardex | Lista: monta la lista al abrirla y conserva el estado de ambas.
- `db/market_lists.test.sql` — lista de mercado contra Postgres local (ver arriba).
- `unit/kardexClosingWeek.test.tsx` — la pantalla del kardex con la semana 6 de cierre (marzo 2026): qué días se habilitan, que guarda 42/6/6, el saldo de abril, filas viejas de 35 días.
- `unit/kardexExporter.test.ts` — el Excel y el PDF del kardex con y sin semana 6.
- `db/six_weeks.test.sql` e `integration/six-weeks.test.ts` — el servidor acepta 35/5/5 y 42/6/6, rechaza mezclas, y la semana 6 se ajusta, envía y resume. **Necesita haber corrido `six_weeks_1..5.sql`.**
- `db/perf.test.sql` — el atajo de `perf_1.sql`/`perf_2.sql` (no recalcular la foto de la semana si nada se guardó después del envío) da **siempre el mismo "modificada"** que la comparación completa; incluye revisar, volver al valor original, otra semana, producto nuevo y semana 6. Con `tests/unit/useWeekSubmissions.test.tsx` (el navegador no consulta de más).
- `unit/marketAdmin.test.ts` — estados de la lista en el panel (falta / pendiente / por revisar / revisada), resumen, semana por defecto.
- `unit/marketConsolidated.test.ts`, `unit/marketExporter.test.ts` y `unit/adminMarketExcel.test.tsx` — la suma entre comunidades, el contenido REAL de los dos Excel (se abren con exceljs: hojas, encabezado, columnas, sin precios) y las pantallas del consolidado y de las descargas.
- `unit/adminMarketLists.test.tsx` y `unit/adminBell.test.tsx` — la pestaña «Listas de mercado» de la nutricionista y la campanita con los dos tipos de aviso (jsdom, servicio simulado).
- `db/market_admin.test.sql` — las funciones `admin_market_*` contra Postgres local (acceso, resumen, detalle, revisar, campanita, tardías).
- `integration/admin-market.test.ts` — las mismas contra Supabase: la parte de seguridad corre siempre; el resto es opt-in con `ADMIN_LOGIN_PASSWORD` (solo inicia sesión, no cambia la cuenta). **Necesita haber corrido `market_admin_1..4.sql`.**
- `integration/market-lists.test.ts` — lista de mercado contra Supabase: acceso, catálogo, guardar, enviar, tardías, aislamiento. **Necesita haber corrido los `market_lists_1..5.sql` y los `market_seed_N.sql`.**
- `unit/balanceEngine.test.ts` — cálculo de saldos (encadenado, ajustes, decimales, negativos), saldo heredado entre meses, semáforo.
- `integration/sessions.test.ts` — PIN, login/logout, tokens inválidos, funciones internas no expuestas, nombres y PIN inválidos.
- `db/community_creation.test.sql` e `integration/community-creation.test.ts` — las 8 comunidades fijas existen con PIN, repetir `fixed_communities.sql` no cambia PIN ya puestos, `create_community_with_pin` y `claim_pin_for_existing_community` ya no se pueden llamar, `provision_community` exige la clave, y una comunidad sin PIN no entra. **Necesita haber corrido `fixed_communities.sql` y `lock_down_community_creation_1..2.sql`.**
- `db/change_pin.test.sql`, `integration/change-pin.test.ts`, `unit/pin.test.ts` y `unit/changePinModal.test.tsx` — la comunidad cambia su propio PIN: exige el PIN actual (un error cuenta para el bloqueo), rechaza PIN débiles (24 en total) e iguales al actual, cierra las demás sesiones, y la pantalla avisa cada caso. **Necesita haber corrido `change_pin.sql`.**
- `db/market_changes.test.sql` e `integration/market-changes.test.ts` — zona de cambios de la lista de mercado (plan 008, Fase A): notas con producto opcional, tope de 20 por lista, límites de texto, fecha puesta por el servidor, aislamiento, enviar copia las notas, «modificada» y «sin revisar» al editarlas, plazo, y la nutricionista ve lo ENVIADO. La parte de administradora de la integración es opt-in. **Necesita haber corrido `market_changes_1..6.sql`.**
- `unit/marketChangesZone.test.tsx` y `unit/marketList.test.ts` — la zona de cambios en la pantalla de la comunidad (plan 008, Fase B): agregar, editar, quitar, 📝 por producto, tope de 20, guardado automático, lo pendiente se guarda al cambiar de semana, envío con los cambios.
- `unit/adminMarketChanges.test.tsx` y `unit/marketChangesExport.test.ts` — la nutricionista ve los cambios (detalle, tabla y consolidado) y salen en los dos Excel (se abre el .xlsx real).
- `unit/toast.test.tsx`, `unit/toastKardex.test.tsx` y `unit/toastMarketAdmin.test.tsx` — los avisos de confirmación (plan 009): duran 5 s, se cierran tocándolos (sin «X»), los errores se quedan, y cada acción manual (enviar, descargar, corregir saldo, cambiar PIN, marcar revisada…) los dispara.
- `unit/staticExport.test.ts` — el sitio sigue siendo 100 % estático (sin rutas API, acciones de servidor ni middleware) y `public/_headers` mantiene las cabeceras de seguridad y la política de contenido sin `unsafe-eval`.
- `db/market_replies.test.sql` e `integration/market-replies.test.ts` — la nutricionista responde a los cambios (solo notas enviadas, una por nota, 200 caracteres, editar/quitar), la comunidad las ve, la campanita las cuenta y se marcan leídas por tipo y semana; aislamiento entre comunidades y últimos 120 días. **Necesita haber corrido `market_replies_1..4.sql`.**
- `unit/marketReplies.test.tsx`, `unit/replyBell.test.tsx`, `unit/communityShell.test.tsx` y `unit/adminReplies.test.tsx` — las respuestas en pantalla: junto a su nota (con «nueva» y «versión anterior»), marcar leídas al verlas, la campanita (número, menú, consulta cada 60 s), que abra la semana y el tipo, y el panel de la nutricionista (responder, editar, quitar).
- `unit/sqlScripts.test.ts` — todo script nuevo de `supabase/` queda en la lista de `tests/db/run.sh` y en su README.
- `unit/homePage.test.tsx` — la pantalla de entrada: solo se elige de la lista (sin crear comunidades ni PIN), pide solo el PIN, no entra a una comunidad sin PIN, avisa si no carga la lista.
- `integration/lockout.test.ts` — 5 fallos bloquean 15 min (incluso con el PIN correcto); un acierto reinicia el contador.
- `integration/data-access.test.ts` — tablas cerradas al acceso directo, guardar/leer sin perder decimales, aislamiento entre comunidades, validaciones del servidor, ajustes de solo inserción.
- `integration/admin-security.test.ts` — la cuenta de la nutricionista: tokens falsos o de comunidad rechazados, funciones internas y tablas cerradas. **Sin riesgo** para la cuenta real (nunca intenta contraseñas).
- `integration/admin-lifecycle.test.ts` — **opt-in**: ciclo completo de la cuenta (contraseña temporal obligatoria de cambiar, código de recuperación de un solo uso, cambio voluntario, bloqueo). Ver abajo.

## Prueba opt-in con la cuenta de administradora YA entregada (sin modificarla)

`integration/admin-weekly-summary.test.ts` solo **inicia sesión** (no cambia la contraseña ni la bloquea) y prueba `admin_weekly_totals` con datos de dos comunidades de prueba. Se corre con la contraseña **vigente** de la cuenta:

```powershell
$env:ADMIN_LOGIN_PASSWORD = "<contraseña actual de la cuenta>"; npm run test:integration
```

Una contraseña equivocada suma un intento fallido (5 bloquean la cuenta 15 minutos), por eso la prueba inicia sesión una sola vez y se detiene con un mensaje claro si falla. Si la cuenta aún tiene la contraseña temporal, también se detiene y pide cambiarla desde `/admin`. Sin `ADMIN_LOGIN_PASSWORD`, sus pruebas aparecen como «skipped».

## Prueba opt-in del ciclo de la cuenta de administradora

`admin-lifecycle.test.ts` **cambia la contraseña real de la cuenta** y termina bloqueándola 15 minutos, por eso no corre sola. Úsala solo **antes de entregar** la cuenta a la nutricionista (o para verificar un cambio en `admin_auth.sql`):

1. En `.env.local` define `ADMIN_TEST_PASSWORD=<una contraseña temporal de prueba>` (nunca en git).
2. Corre `supabase/admin_reset_password.sql` en Supabase con esa misma contraseña (edita el texto de reemplazo y **no** guardes la real en el archivo).
3. `$env:RUN_ADMIN_LIFECYCLE=1; npm run test:integration` (en PowerShell).
4. **Antes de entregar la cuenta**, vuelve a correr `admin_reset_password.sql` con la contraseña temporal que le darás a la nutricionista.

Sin `RUN_ADMIN_LIFECYCLE=1` esas pruebas se saltan y aparecen como "skipped".

## Cómo agregar pruebas

- **Cada feature nueva** trae sus pruebas en el mismo commit (el plan de la feature, en [`planes/`](../planes/README.md), lista cuáles).
- **Cada bug arreglado** trae una prueba que falla sin el arreglo: así no vuelve.
- Para integración, usa `createTestCommunity(tag)` de `integration/helpers.ts`: crea una comunidad de prueba nueva y devuelve su token.
- Un test unitario no debe usar red; si necesita Supabase, va en `integration/`.

## Pendiente / ideas

- Pruebas de la cola de guardado (`useSaveQueue`): hoy se verificó a mano (orden, reintentos). Conviene extraer su lógica a una función pura para poder probarla aquí.
- Pruebas end-to-end en navegador (Playwright) para reemplazar parte del checklist manual.

## Pruebas de SQL en un Postgres local (`tests/db/`)

`npm run test:db` (o `bash tests/db/run.sh`) crea la base desechable `kardex_sqltest`, carga **todos los `supabase/*.sql` en el orden de producción** sobre un mínimo de Supabase (`tests/db/bootstrap.sql`: roles `anon`/`authenticated`, `pgcrypto`, permisos por defecto amplios) y corre cada `tests/db/*.test.sql`. Las pruebas llaman a las funciones como el rol `anon`, igual que la app.

- Úsalo **antes de correr un `.sql` nuevo en Supabase**: detecta errores de sintaxis, `revoke` olvidados y reglas mal escritas sin tocar datos reales.
- Cada prueba falla con `FALLÓ: <qué>`. Se verificó mutando el SQL (quitar un `revoke`, relajar una validación…) y confirmando que la prueba lo detecta.
- Hay que agregar el `.sql` nuevo a la lista de `run.sh`, en su lugar del orden.
- Necesita PostgreSQL 14+ y poder entrar con `psql` (si no, define `PGUSER`/`PGHOST`/`PGPORT`). No reemplaza a `test:integration`: esa prueba la base **real** (permisos de Supabase de verdad).

## Regenerar el catálogo de la lista de mercado

`supabase/market_seed_1.sql` … `market_seed_7.sql` se generan con `npm run seed:market` a partir de `planes/anexos/lista-mercado-catalogo.json` y las reglas de `src/lib/marketCalendar.ts`. Van en varios archivos chicos porque el SQL Editor de Supabase no deja pegar scripts largos (corta hacia las 100 líneas). No se editan a mano: `tests/unit/marketSeed.test.ts` falla si dejan de coincidir.

## Pruebas de pantalla (jsdom)

Los archivos `tests/unit/*.test.tsx` llevan `// @vitest-environment jsdom` arriba y usan Testing Library. Se reemplaza el servicio de red con `vi.mock` (ver `marketListDashboard.test.tsx`), así que corren sin Supabase y en `npm test`. Usa `vi.useFakeTimers()` para controlar la pausa del guardado automático.
