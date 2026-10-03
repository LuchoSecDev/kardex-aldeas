# 013 — Corrección histórica de un producto: ventana aislada, servidor como única autoridad y «Guardar corrección»

**Estado:** 📝 Propuesta **revisada el 2026-10-03** con las decisiones y condiciones de Lucho. **Lucho confirmó el 2026-10-03 las recomendaciones Q1, Q2, Q3, Q4, Q6 y Q7** (ver sección 8); **Q5 está en aclaración** (sección 5.4: el tope no limita la lectura). Es solo diseño: **no hay código ni SQL de este plan, y nada se corre en Supabase sin su OK.** Depende del plan 012 (control de versión), cuyo SQL ya está corrido en producción (`kardex_version_1.sql`, comprobado por Lucho el 2026-10-03; `kardex_records.updated_at` es `timestamptz`).
**Rama:** `feature/correccion-de-meses` (cuando se programe)  **Origen:** hallazgo H3 de [`README.md`](README.md)

## 1. Qué se revisó para esta versión

Instrucciones del proyecto (`CLAUDE.md`, `.claude/rules/sql.md`: zonas de aprobación, scripts de menos de 98 líneas, ningún SQL en producción sin OK, no asumir que el SQL del repo coincide con producción) y, contrastado con el código: el plan 012 y `kardex_version_1.sql`; `balanceEngine.ts` (`computeCascade`, `finalBalanceOfMonth`, `padTo`); `monthState.ts`; `kardex_save_product` (sus tres versiones históricas: `session_access.sql`, `six_weeks_2.sql`, `kardex_version_1.sql`); `kardex_insert_ajuste` y `ajustes.sql`; `week_submissions.sql` (`_week_snapshot`, `_week_has_activity`), `perf_1.sql` (`_week_modified`), `six_weeks_3.sql` (`kardex_submit_week`), `six_weeks_5.sql` y `admin_weekly_summary.sql` (`admin_weekly_totals`), `admin_read.sql`; los bloqueos `lock_down_*`; y la convención de zona horaria (`marketCalendar.ts`, `marketList.ts`, `market_lists_2.sql`).

## 2. Hallazgos que corrigen el borrador anterior

| # | Hallazgo (VERIFICADO leyendo el código y el SQL salvo que se indique) | Consecuencia para el plan |
|---|---|---|
| C1 | **El error de H3 también se ve en pantalla, no solo en los resúmenes.** El borrador anterior decía que la pantalla y el Excel «se ven bien» porque recalculan. Solo es cierto para el mes inmediatamente posterior. `buildMonthState` toma la herencia de un mes con `finalBalanceOfMonth(fila del mes previo)`, que usa los **`prev_balances` GUARDADOS** de ese mes previo. Si se corrige febrero, marzo se recalcula bien al abrirlo, pero abril hereda de marzo **guardado** (viejo). | H3 es más amplio: afecta desde el segundo mes posterior, en pantalla, Excel, resumen para proveedores y foto de la semana enviada. |
| C2 | **El servidor hoy confía por completo en lo que manda el cliente.** `kardex_save_product` valida tamaños y que entradas y salidas no sean negativas, pero guarda tal cual los `prev_balances` calculados en el navegador. | El borrador anterior («el servidor valida y guarda las filas ya calculadas») queda **descartado**: es justo el defecto. La autoridad de los saldos que se persisten debe ser el servidor (sección 5). |
| C3 | **Todos los caminos de escritura al kardex** (verificado con `grep` de `insert/update/delete` sobre `kardex_records`): solo `kardex_save_product` (tres definiciones históricas, vigente la de `kardex_version_1.sql`). El acceso directo a la tabla está cerrado (`lock_down_direct_access.sql`) y no hay borrado desde la app (`lock_down_kardex_records_delete.sql`). Pero **`kardex_insert_ajuste` también altera el encadenado**: un ajuste en una semana reemplaza el saldo de esa semana y de las siguientes. Hoy la app lo hace en **dos llamadas no atómicas** (inserta el ajuste y luego guarda la fila del producto). | Los ajustes entran en el alcance: un ajuste en un mes cerrado es una corrección, y la inserción del ajuste y el recálculo de la fila deben ser atómicos (D9). |
| C3b | `ajustes` solo admite `saldo_nuevo >= 0` (`Saldo inválido`) y `kardex_save_product` admite saldos calculados negativos. | No se debe prohibir los saldos negativos calculados en las correcciones (sección 7). Se anota la asimetría como observación. |
| C4 | **El código de producción no es necesariamente el del repositorio.** `kardex_records` se creó a mano (no hay `.sql` que la cree). Lo único confirmado hoy es que `updated_at` es `timestamptz`. `ajustes.week_index` tenía `check (0..4)` en `ajustes.sql` y `six_weeks_1.sql` lo amplía a 0..5; hay que confirmarlo en producción. | Fase 0: diagnóstico solo lectura del esquema real (columnas, restricciones, disparadores, índices, permisos) antes de escribir SQL. |
| C5 | **Zona horaria.** La lista de mercado usa `America/Bogota` explícita (`bogotaDate` en `marketCalendar.ts`, `at time zone 'America/Bogota'` en `market_lists_2.sql`). El kardex **no declara ninguna convención**: elige el mes y año iniciales con `new Date()` del navegador (`KardexDashboard.tsx`). No es una contradicción con la decisión (no hay una convención del kardex distinta), pero es una **discrepancia**: con el reloj o la zona horaria mal configurados en un computador, la pantalla mostraría otro «mes actual» que el servidor. | La regla usa `America/Bogota` en el servidor; la pantalla debe usar `bogotaDate` para saber cuándo mostrar la ventana. Pregunta Q3. |
| C6 | **Plan 012 y este plan se tocan.** Para serializar las escrituras normales y las correcciones hace falta que `kardex_save_product` tome el mismo bloqueo que la corrección y aplique la regla de meses cerrados. `kardex_version_1.sql` **ya está corrido**, así que no se edita: hace falta un script nuevo que la reemplace. | Nuevo script (sección 9) y secuencia de despliegue cuidadosa. |
| C7 | **Una escritura que no cambia valores igual cambia `updated_at`.** `_week_modified` usa `updated_at` como atajo (si ninguna fila del mes cambió después del envío, no compara). | La corrección reescribe solo las filas que realmente cambian, para no marcar «modificadas» semanas enviadas que no cambiaron. |
| C8 | **Un límite que sí existe hoy en la auditoría de ajustes:** `kardex_load_ajustes_history` devuelve solo los **últimos 200** ajustes por defecto y nunca más de 1000 en el servidor (`p_limit`; la pantalla y `adminService` piden 200). Para «ver todo» con fines de auditoría eso es un tope real de lectura. | No bloquea este plan, pero la Fase 4 (lectura de la auditoría) debe prever **paginación o filtro por mes y producto** en vez de un tope fijo, tanto para `kardex_corrections` como para el historial de ajustes. |

## 3. Objetivo y alcance

Que corregir cifras de un mes anterior **no deje saldos guardados viejos** en los meses siguientes, de forma que el kardex en pantalla, el Excel, el resumen semanal para proveedores y la «foto» de la semana enviada coincidan con las entradas, salidas, ajustes y cierres anteriores.

**Aprobado en principio por Lucho:** un producto por corrección; motivo obligatorio; auditoría; ventana aislada con borrador, vista previa, confirmación y guardado atómico; los saldos guardados deben quedar consistentes; y **no se debe poder eludir la corrección llamando a un RPC antiguo ni desde una pantalla abierta antes del cambio**.

**Actor:** la sesión representa a una **comunidad**, no a una persona (PIN compartido). La auditoría registra a la comunidad; este plan no inventa identidades individuales.

## 4. Regla D1 (cambiada): cuándo se necesita la ventana

Se evalúa **en el servidor** con la fecha de `America/Bogota` (`(now() at time zone 'America/Bogota')::date`), nunca con la hora del navegador ni con UTC. Para un producto y un mes objetivo `M` de la comunidad de la sesión:

1. **Mes calendario actual:** se edita normalmente. *(Sujeto a la pregunta Q2: si ese producto ya tiene filas en meses posteriores, el mes actual quedaría con saldos posteriores viejos.)*
2. **Mes anterior, durante los días 1 a 5 del mes (Bogotá):** se edita normalmente **solo si el producto no tiene filas guardadas en ningún mes posterior a `M`**.
3. **Mes anterior, con filas del producto en algún mes posterior** (incluido el mes actual): requiere la ventana **también durante los 5 días**.
4. **Desde el día 6**, cualquier mes anterior al actual: requiere la ventana.
5. Un mes de dos o más meses atrás: siempre la ventana.

«Datos guardados» = existe una fila de `kardex_records` de ese producto y comunidad en un mes posterior (aunque sus cifras sean cero, porque aun así guarda `prev_balances` heredados).

**Consecuencia a confirmar (Q1):** el día 1 o 2, la colaboradora suele registrar los últimos días del mes anterior; si ya empezó octubre para ese producto (existe su fila de octubre), editar septiembre pasará por la ventana. Es lo que pide la regla; conviene saber si es lo deseado.

**Criterios de aceptación de los límites** (hora de Bogotá; se prueban con la fecha simulada, ver sección 10):

| Fecha de «hoy» | Edición normal pedida | Producto | Resultado |
|---|---|---|---|
| 1 oct | octubre | cualquiera | normal |
| 1 oct 00:00 | septiembre | sin filas posteriores | normal |
| 1 oct | septiembre | con fila en octubre | ventana (`MES_CERRADO` en el RPC normal) |
| 5 oct 23:59:59 | septiembre | sin filas posteriores | normal |
| 6 oct 00:00:00 | septiembre | sin filas posteriores | ventana |
| 5 oct 23:59 (= 6 oct 04:59 UTC) | septiembre | sin filas posteriores | normal (una implementación en UTC fallaría aquí) |
| 3 ene 2027 | diciembre 2026 | sin filas posteriores | normal (cambio de año) |
| 3 ene 2027 | diciembre 2026 | con fila en enero | ventana |
| 3 ene 2027 | noviembre 2026 | cualquiera | ventana |
| cualquier día de octubre | agosto | cualquiera | ventana |

## 5. Diseño de confianza y escritura (cambiado)

### 5.1 Autoridad única de los saldos persistidos

**El cliente envía solo lo que la persona edita** (entradas y salidas por mes, más las versiones esperadas y el motivo). **El servidor calcula los `prev_balances` que guarda** con datos autoritativos: las entradas y salidas recibidas o ya guardadas, los **ajustes vigentes** (el último por producto, año, mes y semana, como hace hoy el cliente al leer `order by created_at asc`) y el cierre del mes previo. Los `prev_balances` que mande un cliente se ignoran (o se comparan y se rechaza la diferencia; ver D6).

**Trade-off de dónde vive el cálculo (investigado):**

| Opción | A favor | En contra | Veredicto |
|---|---|---|---|
| **A. El cliente calcula y el servidor guarda** (borrador anterior) | Una sola implementación (`computeCascade`) | El servidor persiste datos que no verificó: justo el defecto (C2); los resúmenes leen lo guardado | ❌ descartada |
| **B. Función en SQL como única autoridad de persistencia; `computeCascade` solo para la vista previa**, con pruebas de paridad y una **confirmación calculada por el servidor** (simulacro `p_dry_run`) | Los datos guardados salen siempre del mismo código, dentro de la misma transacción que los bloqueos; encaja con la arquitectura (todo RPC `security definer`, sin servidor propio); no depende de que el cliente sea honesto o esté actualizado | Dos implementaciones (TypeScript para mostrar, SQL para guardar) que podrían divergir | ✅ **propuesta**, con la mitigación de abajo |
| **C. Edge Function en TypeScript** que reutilice `balanceEngine.ts` | Una sola implementación | Rompe la arquitectura (sitio estático + RPC), exige la clave de servicio (salta RLS: mayor superficie de ataque), un despliegue y secretos más, y la función tendría que hablar con la base fuera de la transacción de los bloqueos | ❌ descartada |
| **D. Todo en el servidor, sin vista previa en el navegador** (cada tecla llama al simulacro) | Una sola implementación | Latencia por tecla, no funciona sin conexión, el kardex normal sigue usando `computeCascade` | ❌ descartada como único mecanismo; sí se usa para la **confirmación final** |

**Cómo se evita que A y B diverjan sin justificarlo:**
1. **Vectores compartidos:** un archivo de casos (los de `balanceEngine.test.ts` más casos generados con una semilla fija: decimales, saldos negativos, ajustes en cada semana, filas de 5 y de 6 semanas) que **leen las dos pruebas**: Vitest contra `computeCascade`/`finalBalanceOfMonth`, y una prueba SQL contra la función de persistencia. Si una cambia y la otra no, falla.
2. **Confirmación autoritativa:** antes de habilitar «Guardar corrección», la ventana pide al servidor el simulacro (misma función, sin escribir) y muestra **sus** números. Lo que la persona confirma es exactamente lo que se guardará. Si difiere de la vista previa local, se muestra el del servidor y se registra un aviso técnico (señal de divergencia).
3. **Precisión:** `numeric` exacto en SQL contra `double` de JavaScript puede diferir en el último decimal (0,1 + 0,2). Se define tolerancia de paridad (≤ 1e-9) y una regla de redondeo canónico al guardar (Q6/D13).

### 5.2 Caminos de escritura y cómo se protege cada uno

| Camino | Riesgo | Protección propuesta |
|---|---|---|
| `kardex_save_product` (normal) | Guardar un mes que debía corregirse con la ventana; guardar datos con `prev_balances` del cliente | Reemplazo por una versión nueva que: aplica la regla de la sección 4 (`MES_CERRADO`, condición esperada en mayúsculas), toma el mismo bloqueo de la corrección y **recalcula `prev_balances` en el servidor** (D6) |
| `kardex_insert_ajuste` | Un ajuste en un mes cerrado altera los meses siguientes; hoy son dos llamadas no atómicas | El ajuste en un mes que requiere ventana se rechaza en el RPC normal y entra como parte de una corrección; en meses abiertos, insertar el ajuste y recalcular la fila en **una sola transacción** con el mismo bloqueo (D9) |
| Nuevo `kardex_save_months` (corrección) | Concurrencia, parcialidad, tope | Secciones 5.3 y 5.4 |
| `kardex_load_*` / `kardex_product_history` | Leer otra comunidad | La comunidad sale **solo** de `_session_community(p_token)`; ninguna función recibe la comunidad como parámetro |
| Acceso directo a la tabla / borrado | — | Ya cerrados (`lock_down_*`); se comprueba en la Fase 0 que siguen cerrados en producción |
| **Clientes antiguos o pantallas abiertas antes del cambio** | Llamar al RPC viejo y eludir la ventana | La regla vive **en el servidor**, no en la pantalla: el RPC normal rechaza igual (`MES_CERRADO`). La pantalla vieja mostrará su aviso genérico de «No se pudo guardar»; se pide recargar. Se prueba con llamadas de 7 y de 9 parámetros (la anterior y la del plan 012) |

### 5.3 Concurrencia, incluida la aparición de un mes posterior

- **Un bloqueo por producto y comunidad**: `pg_advisory_xact_lock` sobre `comunidad|producto`, que toman **todos** los escritores (`kardex_save_product`, `kardex_insert_ajuste`, `kardex_save_months`). Así se serializan las escrituras normales y las correcciones del mismo producto, y se cierra la carrera que `for update` no cubre: **no se puede bloquear una fila que todavía no existe** (un mes posterior que alguien crea mientras se corrige). Al ser un bloqueo de transacción se libera solo al terminar y no depende de conexiones persistentes (compatible con el agrupador de conexiones de Supabase). Un solo bloqueo por producto y siempre el mismo orden: no hay interbloqueos.
- **Control de alcance completo (`chain_token`)**: `kardex_product_history` devuelve, además de las filas y sus `updated_at`, un token que resume **todo el alcance de la cadena**: año, mes y `updated_at` de **cada** fila del producto desde el mes previo al corregido hasta el último existente, y los ajustes (identificadores) del producto desde ese mes. Al guardar, el servidor, **ya con el bloqueo tomado**, recalcula el token y lo compara: cualquier fila cambiada, **nueva** (un mes posterior que apareció), borrada, o un ajuste nuevo → `CONFLICTO_VERSION` y se revierte todo. Además se valida que el conjunto de meses enviado sea **exactamente** el del servidor (`ALCANCE_INCOMPLETO` si falta o sobra uno).
- Mismo código de error y la misma ventana de aviso del plan 012 (`ConflictDialog`).

### 5.4 Atomicidad, tope y errores

- `kardex_save_months` es **una sola función** (una transacción): cualquier excepción (conflicto, validación, tope, fallo de la auditoría) revierte **todo**, incluida la auditoría. Nunca queda una parte de la cadena.
- **Tope de meses en el servidor, solo para la ESCRITURA de una corrección** (Q5): si la cadena que una corrección tendría que reescribir (desde el mes corregido hasta el último mes con datos de ese producto) supera el tope, `CORRECCION_FUERA_DE_TOPE`, explícito, sin truncar ni guardar parcialmente; la pantalla lo explica. **Es una protección contra una escritura desmesurada; no limita en nada cuánto historial se puede ver.**
- **Lectura sin tope (aclaración de Lucho, 2026-10-03):** ver meses anteriores, abrir cualquier mes, el Excel y el PDF, el historial de meses con datos (`kardex_months_with_data`), la vista de solo lectura de la nutricionista y la futura lectura de la auditoría **no pasan por el tope y no se limitan por antigüedad**. Hoy el selector de años cubre 10 años hacia atrás y 10 hacia adelante (`KardexDashboard.tsx`) y los meses sin registros se ven en ceros. La auditoría (`kardex_corrections`) es append-only y se leerá completa, con paginación, sin descartar registros viejos.
- **Valor del tope, revisado tras la pregunta de Lucho:** de 24 pasa a **120 meses (10 años)**, para que **todo lo que se puede ver (el rango del selector) se pueda corregir**. Con 24, a los dos años de uso un mes antiguo se podría ver pero no corregir. 120 no tiene costo real (una corrección toca como mucho 120 filas de un solo producto, milisegundos de bloqueo) y sigue protegiendo de lo desmesurado. **Pendiente de su confirmación** y cambiable con un script.
- Los códigos nuevos van en mayúsculas (`MES_CERRADO`, `CONFLICTO_VERSION`, `ALCANCE_INCOMPLETO`, `CORRECCION_FUERA_DE_TOPE`): son condiciones esperadas y no se reportan al desarrollador como fallos (`isExpectedCondition`); la cola de guardado **no** debe tratarlos como «fallo de red» ni reintentarlos.

### 5.5 Autorización

La lectura del historial y el guardado se autorizan **solo** con la comunidad deducida del token. Ninguna función recibe un nombre de comunidad del cliente. La nutricionista (`admin_*`) y el desarrollador (`dev_*`) no usan estas funciones para escribir. Pruebas de aislamiento entre comunidades (sección 10).

### 5.6 Auditoría

Tabla cerrada `kardex_corrections` (RLS activo, `revoke all`), **append-only**: sin permisos de `update`/`delete` y con un disparador que lanza excepción ante ambos (protege también de errores propios, como la convención ya declarada en `ajustes.sql`). Cada corrección guarda: fecha, **comunidad** (el actor), producto, motivo, y por cada mes tocado los valores **antes** y **después** (entradas, salidas y saldos anteriores) y los tokens de cadena antes y después. La **lectura futura** (pestaña en `/admin` y en `/dev`) pasará por funciones que exijan el token de la nutricionista o del desarrollador; las comunidades no la leen. La inserción ocurre dentro de la misma transacción: si falla, no hay corrección.

## 6. La ventana (comportamiento)

1. En un mes cerrado para ese producto (sección 4) la tabla no deja editar y aparece «Corregir» en la fila.
2. La ventana carga el historial (`kardex_product_history`): el producto, el mes elegido y los meses siguientes con filas.
3. La persona edita entradas y salidas en un **borrador**: no se guarda nada. La vista previa (`computeCascade`) muestra, mes por mes, **antes → después** del saldo anterior, entradas, salidas y saldo final, resaltando cambios, y avisa **qué semanas ya enviadas quedarán «modificadas»**.
4. «Guardar corrección» se habilita cuando hay al menos un cambio válido (reglas de la sección 7) y un motivo válido. Al pulsarla se pide el **simulacro al servidor**, se muestran **sus** números y se pide confirmación.
5. Se guarda de forma atómica. Si hay conflicto, tope o validación fallida, no se guarda nada y se explica con la ventana de aviso.

## 7. Reglas de valores (se conservan las existentes)

- **Entradas y salidas:** números ≥ 0, mismos tamaños que hoy (35/5 o 42/6; mezclas se rechazan), igual que `kardex_save_product`.
- **Saldos calculados:** **pueden ser negativos** cuando el cálculo los produzca (`computeCascade` lo permite y hay prueba que lo exige). No se agrega ninguna regla «sin negativos» a los saldos.
- **Ajustes:** conservan su regla actual (`saldo_nuevo >= 0`, motivo obligatorio).
- **Motivo (servidor):** se recorta con `btrim`; longitud mínima 5 y máxima 500 (el patrón de `kardex_insert_ajuste` solo exige 1 a 500); debe contener al menos una letra o dígito; sin caracteres de control. Error `Motivo inválido`. La pantalla valida lo mismo, pero **la autoridad es el servidor** (Q4).

## 8. Decisiones y preguntas

| # | Tema | Estado / propuesta |
|---|---|---|
| D1 | Cuándo se necesita la ventana | ✅ **Cambiada y aprobada** por Lucho (sección 4, con `America/Bogota`). Pendientes Q1–Q3. |
| D2 | Motivo obligatorio | ✅ aprobado; reglas de validación por confirmar (Q4) |
| D3 | Un producto por corrección | ✅ aprobado |
| D4 | Auditoría | ✅ aprobada; lectura futura protegida (5.6) |
| D5 | Edición directa de meses que requieren ventana | ✅ aprobado y ahora **obligatorio en el servidor** (5.2) |
| D6 | El servidor recalcula `prev_balances` en **todo** guardado normal (no solo en correcciones) | Propuesto ★. Es un **cambio del contrato del guardado normal** (zona de aprobación). Sin esto los saldos guardados siguen dependiendo del navegador en el uso diario |
| D7 | Base del cálculo | Propuesto ★: el cierre del mes previo **guardado** (como hoy). Alternativa: recalcular desde el primer mes con datos, ignorando lo guardado; es más robusto ante datos viejos inconsistentes, pero **cambiaría cifras que la nutricionista ya vio** |
| D8 | Escrituras en el mes actual o futuros cuando hay filas posteriores | Ver Q2 |
| D9 | `kardex_insert_ajuste` | Propuesto ★: atómico con el recálculo; en meses cerrados, solo dentro de una corrección |
| D10 | Tope de meses de una corrección (escritura) | Propuesto **120** (era 24); la lectura no tiene tope. Pendiente de confirmar (Q5) |
| D11 | Reparar datos históricos ya inconsistentes | Después del diagnóstico solo lectura (sección 11) |
| D12 | El kardex deja de usar el reloj del navegador | Propuesto ★ (Q3) |
| D13 | Precisión y redondeo al guardar | Por definir (Q6) |

**Respuestas de Lucho (2026-10-03):** de acuerdo con las recomendaciones de Q1 (se mantiene la regla; se revisa tras un mes de uso cuántas correcciones hubo entre el día 1 y el 5), Q2 (también por la ventana cuando hay meses posteriores con datos), Q3 (el kardex pasa a la hora de Bogotá), Q4 (motivo de 5 a 500 caracteres, con al menos una letra o dígito, sin caracteres de control), Q6 (se redondean a 4 decimales solo los saldos calculados; entradas y salidas tal como se escribieron) y Q7 (el servidor recalcula los saldos en todo guardado y la base es el cierre del mes previo guardado, **después del diagnóstico y como paso de despliegue separado**). Q5 en aclaración.

**Preguntas concretas para Lucho (se conservan como registro):**

- **Q1.** Con tu regla, el día 1 a 5, si el producto **ya tiene fila en el mes actual**, editar el mes anterior pasa por la ventana. ¿Es lo que quieres, aun sabiendo que será frecuente (por ejemplo, el 2 de octubre al registrar los últimos días de septiembre de un producto con fila de octubre)?
- **Q2.** «El mes calendario actual se edita normalmente» **contradice** la garantía de «saldos guardados consistentes» si ese producto ya tiene filas en meses **posteriores** al actual (alguien llenó por adelantado). ¿Los meses con filas posteriores también pasan por la ventana aunque sean el mes actual, o aceptamos esa excepción?
- **Q3.** El kardex hoy usa la hora del navegador para elegir el mes inicial; la lista de mercado usa Bogotá. ¿Confirmas que el kardex debe pasar a `America/Bogota` (cambio pequeño y visible)?
- **Q4.** Motivo: ¿mínimo 5 caracteres, máximo 500 y al menos una letra o dígito, o prefieres exactamente el patrón de los ajustes (1 a 500)?
- **Q5.** *(Aclarada.)* Lucho preguntó si un tope de 24 meses afectaría ver meses anteriores para la auditoría. **No: el tope solo limita cuántos meses reescribe UNA corrección, no la lectura.** Con 24, sin embargo, un mes de hace más de dos años se podría ver pero no corregir; por eso se propone **120 meses** (el rango del selector). ¿Confirmas 120?
- **Q6.** Precisión: ¿redondeamos lo guardado a 4 decimales? (Hoy el navegador guarda los decimales tal cual salen del cálculo.)
- **Q7 (D6/D7).** ¿Apruebas que el servidor recalcule los saldos en **todo** guardado y que la base sea el cierre del mes previo guardado, o prefieres recalcular desde el origen? Antes de decidir conviene ver el diagnóstico de la sección 11.

## 9. Fases (cada una en su rama y con aprobación de push aparte)

- [ ] **Fase 0 — Diagnóstico solo lectura** (sin cambiar nada): ver sección 11. *Aceptación:* informe entregado a Lucho antes de escribir SQL; no se ejecutó ninguna escritura.
- [ ] **Fase 1 — SQL** (varios scripts de menos de 98 líneas, en este orden de dependencia; Lucho los corre antes de desplegar la app):
  1. función interna de cálculo del encadenado (única autoridad) y de «hoy en Bogotá» (`_kardex_today`, reemplazable en las pruebas locales);
  2. `kardex_save_product` nueva (regla de meses cerrados, bloqueo por producto, recálculo en servidor, versión del plan 012);
  3. `kardex_insert_ajuste` atómico con el recálculo y el mismo bloqueo;
  4. tabla `kardex_corrections` (cerrada, append-only), `kardex_product_history` y `kardex_save_months` (con simulacro, tope, token de cadena).
  *Aceptación:* pasan las pruebas de la sección 10, `npm run test:db` completo y la prueba de paridad.
- [ ] **Fase 2 — Cliente:** `useMonthCorrection`, `MonthCorrectionModal` (mismo estilo y teclado que las demás ventanas), `bogotaDate` para decidir cuándo ofrecer «Corregir» (D12), manejo de `MES_CERRADO` y de los demás códigos sin tratarlos como falla de red, bloqueo de la edición directa. *Aceptación:* pruebas unitarias con los vectores compartidos y con mutaciones; verificación en navegador (escritorio y 360 px, alto contraste).
- [ ] **Fase 3 — Integración y producción:** prueba de integración con comunidades `ZZZ_TEST_`, checklist manual completo (sección 12), despliegue en orden: SQL, comprobación con `npm run test:integration`, después la app. Con la app antigua abierta el RPC normal rechaza meses cerrados: avisar a las colaboradoras que recarguen.
- [ ] **Fase 4 (opcional):** lectura de la auditoría en `/admin` y `/dev`, **completa y con paginación o filtro por mes y producto** (nada de topes fijos, ver C8); varios productos a la vez.

## 10. Pruebas

**SQL local con mutaciones** (`tests/db/`, Postgres desechable; cada mutación debe hacer fallar alguna prueba):
- **Atomicidad:** un fallo a mitad de la cadena (validación, tope, auditoría) deja **todas** las filas y la auditoría como estaban.
- **Versiones y alcance:** fila cambiada, fila nueva (un mes posterior que aparece **después** de leer el historial), fila borrada, ajuste nuevo y conjunto de meses incompleto o sobrante → `CONFLICTO_VERSION` / `ALCANCE_INCOMPLETO` sin guardar nada.
- **Concurrencia con dos sesiones y dos tokens distintos** (como en el plan 012): dos correcciones simultáneas del mismo producto; una corrección contra un guardado normal; una corrección contra la **creación** de un mes posterior. Sin el bloqueo por producto, el segundo debe poder pisar al primero (mutación que lo demuestre).
- **Aislamiento entre comunidades:** una sesión no lee ni escribe historial de otra; el token falso se rechaza.
- **RPC antiguo:** `kardex_save_product` con 7 y con 9 parámetros rechaza meses cerrados (`MES_CERRADO`) y acepta los abiertos; límites de fecha de la sección 4 con la fecha simulada (días 1, 5 y 6, cambio de año, con y sin meses posteriores, y el borde UTC).
- **Auditoría:** una fila por corrección con antes y después; no se puede actualizar ni borrar; si falla, la corrección no se guarda; la comunidad no la lee.
- **La lectura no tiene tope:** con más meses que el tope, abrir cualquier mes, `kardex_months_with_data`, el Excel y la vista de solo lectura de la nutricionista siguen funcionando igual; solo la corrección se rechaza (`CORRECCION_FUERA_DE_TOPE`).
- **Tope y validaciones:** tope explícito sin truncar; tamaños 35/5 y 42/6; entradas y salidas negativas rechazadas; **saldos negativos calculados aceptados**; motivo (vacío, corto, solo símbolos, con caracteres de control, de 501 caracteres).
- **Paridad:** el archivo de vectores compartido pasa por `computeCascade` (Vitest) y por la función SQL (resultado persistido), con tolerancia definida, incluidos ajustes que cortan la propagación y filas de 5 semanas.
- **Resumen semanal y semanas enviadas tras corregir un mes anterior:** `admin_weekly_totals` de un mes posterior devuelve el **saldo anterior corregido**; `_week_snapshot`/`kardex_week_submissions` marcan «modificadas» **solo** las semanas enviadas cuyos valores cambiaron (no las demás); reenviar actualiza la foto; y filas que no cambian no se reescriben (C7).

**Unitarias del cliente:** la ventana (botón deshabilitado hasta que haya cambio válido y motivo válido; vista previa; la confirmación usa los números del servidor; conflicto, tope y `MES_CERRADO` con su aviso), la decisión de «mes cerrado» con `bogotaDate` en los mismos límites de fecha, y que estos códigos no activan el aviso rojo de red.

**Integración (`ZZZ_TEST_`):** corrección real de un producto con tres meses; conflicto; RPC antiguo rechazado.

## 11. Diagnóstico previo (solo lectura, antes de cualquier reparación)

Scripts de consulta que **no modifican nada** y que Lucho corre en el SQL Editor (sin cambios en Supabase); se entregan solo los **conteos y la lista de comunidad, producto y mes**, no se editan datos:
1. **Esquema real:** columnas, tipos, restricciones, disparadores, índices, RLS y permisos de `kardex_records`, `ajustes` y `week_submissions` en producción (C4).
2. **Discrepancias históricas:** filas cuyo `prev_balances` guardado **no coincide** con el recalculado desde el cierre del mes previo guardado (D7-A) y, aparte, con el recalculado desde el origen (D7-B), por comunidad, producto y mes; cuántas están en meses ya **enviados** a la nutricionista.
3. **Meses futuros con datos** (relevante para Q2) y productos con filas posteriores al mes actual.
4. **Ajustes:** semanas con más de un ajuste vigente y ajustes cuyo `saldo_anterior` registrado no coincide con el cálculo de entonces.

Con ese informe se decide (D11) si hace falta un **script de reparación**, que sería una zona de aprobación aparte (escritura masiva): se revisa fila por fila, se respalda antes y la nutricionista debe saber que cifras ya enviadas pueden cambiar.

## 12. Checklist manual (para `tests/manual/checklist.md` en la Fase 3)

- [ ] **Marzo, abril y mayo con datos de un producto, y abril ya enviado a la nutricionista:** corregir una salida de marzo en la ventana, con motivo. Comprobar que abril y mayo muestran los saldos nuevos en pantalla **y en el Excel**; que el resumen semanal de abril y mayo trae el saldo anterior corregido; que las semanas enviadas de abril cuyos valores cambiaron aparecen «modificadas» y las que no cambiaron, no; que reenviar actualiza lo que ve la nutricionista.
- [ ] Antes de confirmar, la ventana muestra antes → después y avisa de las semanas enviadas; el botón está deshabilitado sin cambio válido o sin motivo; tras guardar queda el registro de auditoría (comunidad, producto, meses, antes y después, motivo).
- [ ] Un conflicto (otra persona cambió febrero, o creó un mes posterior mientras la ventana estaba abierta) no guarda nada y avisa; con dos navegadores y con un navegador sin internet que vuelve.
- [ ] **Gracia, con la fecha simulada o con datos de prueba en los días reales:** día 1, 5 y 6 del mes; producto con y sin fila en el mes actual; cambio de año (3 de enero editando diciembre y noviembre).
- [ ] Con una **pestaña abierta antes del despliegue**, editar un mes cerrado: el servidor lo rechaza; recargar y usar la ventana funciona.
- [ ] Cercanías de la medianoche de Bogotá con el reloj del computador en otra zona horaria: manda la hora de Bogotá.
- [ ] Alto contraste, letra A++ y 360 px en la ventana; teclado (Tab, Esc) sin salirse del cuadro.

## 13. Riesgos

- **Cambio del contrato del guardado normal (D6)** en una función central: se prueba con SQL local, integración y manual; despliegue SQL primero, con la regla de meses cerrados activada solo cuando la app nueva esté lista, o con la app antigua abierta rechazada con aviso (decisión de despliegue a confirmar en la Fase 3).
- **Frustración por la regla de los 5 días (Q1):** puede ser frecuente; el aviso debe explicar por qué y cómo seguir.
- **Divergencia TypeScript/SQL:** mitigada con vectores compartidos y la confirmación calculada por el servidor, pero es una deuda real que debe mantenerse con las pruebas de paridad.
- **Datos históricos ya inconsistentes:** este plan evita los nuevos; los viejos se miden primero (sección 11) y solo se reparan con aprobación expresa.
- **Dependencia del reloj del servidor:** la regla usa la hora del servidor de la base; si se necesitara auditar una fecha, se guarda la fecha de Bogotá usada en cada decisión.
- **Un producto a la vez** puede ser lento si hay muchos productos afectados por un error masivo; queda como Fase 4 (varios productos).

## 14. Fuera de alcance

Corregir o anular ajustes ya registrados, borrar meses, correcciones de varias comunidades por la nutricionista, y reparar datos históricos sin el diagnóstico y la aprobación de la sección 11.
