# 012 — Control de versión al guardar (que nadie pise lo de otra persona)

**Estado:** 📝 Propuesta del 2026-10-03, **pendiente de que Lucho apruebe las decisiones de abajo**. Nada de SQL se corre en Supabase sin su OK.
**Rama:** `feature/control-de-version` (cuando se programe)  **Origen:** hallazgo H2 de [`README.md`](README.md)

## Objetivo

Evitar en la versión digital el error que en papel ocurre cuando dos personas escriben sobre la misma hoja: **que un guardado viejo
borre, sin avisar, lo que otra persona ya guardó**. Hoy el último guardado gana, siempre.

## Hallazgos que motivan el plan (VERIFICADOS leyendo el SQL y el código)

| # | Hallazgo | Dónde |
|---|---|---|
| **H2** | `kardex_save_product` hace `insert … on conflict … do update` y **reemplaza la fila completa** del producto en ese mes (todas las salidas, entradas y saldos) sin comprobar qué versión conocía quien guarda. Dos computadores de la misma comunidad, una vista vieja o un guardado pendiente que se reenvía tras un corte de internet pueden pisar datos ajenos. | `supabase/session_access.sql`, `six_weeks_2.sql` |
| **H2b** | La lista de mercado tiene el mismo patrón (`market_list_save`, notas y participantes: `on conflict … do update`). | `market_lists_4.sql`, `market_changes_2.sql` |
| **H3** | Los **saldos anteriores guardados** (`prev_balances`) son un dato derivado del cierre del mes anterior, pero se guardan por fila. Si alguien corrige un mes pasado, los meses siguientes quedan con el saldo anterior viejo **en la base** hasta que se vuelva a guardar cada producto en ese mes. La pantalla y el Excel lo recalculan al abrir, pero `admin_weekly_totals` (el resumen para el pedido a proveedores) y la «foto» de la semana enviada **leen el guardado**. | `six_weeks_5.sql`, `week_submissions.sql`, `admin_weekly_summary.sql` |

H3 no se arregla con este plan (ver «Fuera de alcance»), pero se anota aquí porque es el mismo tipo de error de papel: arrastrar mal un saldo.

## Diseño

### Contrato del servidor (`kardex_save_product`)

- Parámetros nuevos, **con valor por defecto** para no romper a los clientes que ya están abiertos: `p_check_version boolean default false` y
  `p_expected_updated_at timestamptz default null`.
- Si `p_check_version` es verdadero, se bloquea la fila (`for update`) y se compara:
  - fila existe y su `updated_at` es **distinta** de la esperada → `raise exception 'CONFLICTO_VERSION'`;
  - fila no existe y se esperaba una → `CONFLICTO_VERSION` (alguien la borró);
  - fila existe y se esperaba «ninguna» (`null`) → `CONFLICTO_VERSION` (alguien la creó mientras tanto);
  - coincide (o no existe y no se esperaba) → guarda.
- Si `p_check_version` es falso (clientes viejos): se comporta como hoy.
- **Devuelve la `updated_at` nueva** (hoy devuelve nada). El cliente la necesita para su siguiente guardado; sin ella chocaría consigo mismo.
- Como cambia el tipo que devuelve, hay que `drop function` y volver a crearla con sus `grant`s en el mismo script. Una función con los mismos nombres y distinto número de parámetros **no** puede convivir con la vieja (PostgREST no sabría cuál elegir), por eso se reemplaza en vez de sobrecargarse.
- La versión es la `updated_at` que ya existe: **no se altera la tabla `kardex_records`** (se creó a mano y no hay copia de su esquema). Se compara como `timestamptz`; el cliente la trata como **texto** y la devuelve intacta (convertirla a `Date` de JavaScript recorta los microsegundos y haría fallar la comparación).
- `CONFLICTO_VERSION` sale como error de validación (`P0001`): la cola de guardado **no lo reintenta** (repetirlo no lo arregla).

### Cliente

- `loadMonthState` conserva, por producto, la `updated_at` de la fila que leyó (o «ninguna»).
- `useSaveQueue` toma la versión **al momento de enviar** (no al escribir), porque en cada producto los guardados salen de uno en uno: el segundo debe usar la versión que devolvió el primero.
- Al guardar bien, se actualiza la versión con la respuesta.
- Al recibir `CONFLICTO_VERSION`: se espera a que la cola termine lo demás, se **recarga el mes** (queda lo último del servidor) y se avisa con claridad (ver «Decisiones»).
- La recuperación automática tras un corte de internet queda cubierta: si al reconectar la fila cambió, el reenvío se rechaza en vez de pisar.

### Qué ve la colaboradora

Un aviso que **no se cierra solo**: «Otra persona cambió *Arroz* y *Leche* mientras tú escribías. Ya cargamos lo último; revisa y vuelve a escribir tu cambio.» Lo que escribió no se aplica (en vez de borrar lo de la otra persona), y la pantalla muestra los datos reales.

## Decisiones por confirmar (propuesta marcada con ★)

| # | Tema | Opciones |
|---|---|---|
| D1 | Qué es la «versión» | ★ La `updated_at` que ya existe (no se toca la tabla). Alternativa: una columna `version` nueva (hay que alterar una tabla que no tenemos documentada). |
| D2 | Granularidad | ★ Por **producto y mes** (es lo que se reemplaza al guardar). Dos personas que editen días distintos del mismo producto también chocan: es lo correcto porque cada guardado reescribe todo. |
| D3 | Cómo se avisa | ★ Ventana propia de la app con botón «Entendido» (como las confirmaciones), con los nombres de los productos. Alternativa: aviso que se queda hasta tocarlo. |
| D4 | Clientes viejos durante el despliegue | ★ Se aceptan (siguen pisando como hoy) hasta que recarguen. Después, un script aparte puede **exigir** versión y rechazar a los viejos. |
| D5 | Alcance | ★ Fase 1: kardex. Fase 2: lista de mercado (H2b) con el mismo patrón. |

## Fases

- [ ] **Fase 1 — SQL y pruebas.** `kardex_version_1.sql` (< 98 líneas), `tests/db/kardex_version.test.sql` con mutaciones: conflicto con versión vieja, fila nueva esperada pero ya creada, fila borrada, cliente viejo sin versión (sigue guardando), aislamiento entre comunidades, validaciones intactas, devuelve la versión nueva, `for update` presente. Se agrega a `tests/db/run.sh` y a `supabase/README.md`.
- [ ] **Fase 2 — Cliente.** Versión por producto en `monthState` / `useKardexData`, `useSaveQueue`, `kardexService`, manejo del conflicto y la ventana. Pruebas unitarias con mutaciones, incluido el escenario «dos pantallas» y el de «reenvío tras corte de internet».
- [ ] **Fase 3 — Integración y producción.** `tests/integration/kardex-version.test.ts` (comunidad `ZZZ_TEST_`), checklist manual con **dos navegadores**, Lucho corre el SQL **antes** de desplegar la app, y luego `npm run test:integration`.
- [ ] **Fase 4 — Lista de mercado (H2b).** Mismo patrón para `market_list_save`, notas y participantes.

## Despliegue

1. SQL primero (no rompe a la app actual: sin versión se comporta como hoy).
2. Después la app.
3. Pestañas viejas abiertas durante el cambio siguen sin protección hasta que recarguen.
4. Opcional, una semana después: exigir versión (D4).

## Riesgos

- **Falsos conflictos** si el cliente pierde la versión (por un error de código): por eso las pruebas cubren guardados seguidos del mismo producto, cambio de mes y recarga.
- **Frustración** si dos personas trabajan a la vez: el aviso debe ser claro y la regla práctica sigue siendo «una a la vez».
- **Cambio en producción de una función central**: se prueba con SQL local, con la prueba de integración y con dos navegadores antes de dar por bueno.
- El reintento tras un corte de internet ya no puede pisar datos más nuevos, pero la persona tendrá que volver a escribir su cambio si hubo conflicto.

## Fuera de alcance (se anota para decidir después)

- **H3, saldos anteriores guardados que quedan viejos** al corregir un mes pasado: se arreglaría haciendo que los resúmenes del servidor recalculen el encadenado en vez de leer el guardado, o recalculando los meses siguientes al guardar. Es otra decisión (toca el resumen para proveedores y la «foto» de la semana enviada).
- **Aviso de presencia** («otra persona está guardando ahora»): cortesía opcional encima del control de versión, solo si en la práctica hay choques frecuentes.
