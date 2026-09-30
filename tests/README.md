# Pruebas del Kardex Digital

Objetivo: saber en minutos si algo se rompió y **dónde**, para repararlo rápido.
Hay tres niveles, del más rápido al más completo:

| Nivel | Qué prueba | Cómo se corre | Tarda |
|---|---|---|---|
| **Unitarias** (`unit/`) | La lógica pura: saldos encadenados, semáforo. No usan red. | `npm test` | < 1 s |
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

1. **Escriben solo en comunidades `ZZZ_TEST_BORRAR_AUTO_*`**, que crean ellas mismas con nombre único en cada corrida.
2. **Nunca prueban PINs incorrectos contra comunidades reales** (Maná, Fortaleza…): bloquearían a quien las usa. Lo único que se hace con Maná es un login sin PIN, que no cuenta como intento fallido.
3. **Dejan datos de prueba a propósito** (no pueden borrarlos: la app no tiene permiso de borrado). Cuando quieras, corre [`supabase/cleanup_test_data.sql`](../supabase/cleanup_test_data.sql) en el SQL Editor; borra todo lo que empiece por `ZZZ_TEST_`, y la consulta final debe devolver 0 filas.
4. Ninguna comunidad real debe llamarse `ZZZ_TEST_...`.

## Qué cubre cada archivo

- `unit/balanceEngine.test.ts` — cálculo de saldos (encadenado, ajustes, decimales, negativos), saldo heredado entre meses, semáforo.
- `integration/sessions.test.ts` — PIN, login/logout, tokens inválidos, funciones internas no expuestas, nombres y PIN inválidos.
- `integration/lockout.test.ts` — 5 fallos bloquean 15 min (incluso con el PIN correcto); un acierto reinicia el contador.
- `integration/data-access.test.ts` — tablas cerradas al acceso directo, guardar/leer sin perder decimales, aislamiento entre comunidades, validaciones del servidor, ajustes de solo inserción.

## Cómo agregar pruebas

- **Cada feature nueva** trae sus pruebas en el mismo commit (el plan de la feature, en [`planes/`](../planes/README.md), lista cuáles).
- **Cada bug arreglado** trae una prueba que falla sin el arreglo: así no vuelve.
- Para integración, usa `createTestCommunity(tag)` de `integration/helpers.ts`: crea una comunidad de prueba nueva y devuelve su token.
- Un test unitario no debe usar red; si necesita Supabase, va en `integration/`.

## Pendiente / ideas

- Pruebas de la cola de guardado (`useSaveQueue`): hoy se verificó a mano (orden, reintentos). Conviene extraer su lógica a una función pura para poder probarla aquí.
- Pruebas end-to-end en navegador (Playwright) para reemplazar parte del checklist manual.
