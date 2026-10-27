# 014 — Bloqueo de días pasados: que el kardex digital no permita «tachar» y que toda corrección quede trazada

**Estado:** 📝 **Borrador de diseño (2026-10-26), sin código y sin SQL.** Nace de un requisito de Lucho que le plantearon
fundaciones que hoy llevan el kardex en papel. Nada de esto se construye ni se corre en Supabase sin su aprobación (zona de
aprobación: reglas de negocio, SQL de producción, `kardex_save_product`).
**Origen:** requisito nuevo, relacionado con el plan [013](013-correccion-de-meses.md) (en pausa) y con el hallazgo H3.

## 1. El requisito (en palabras de Lucho)

En el papel **no se pueden modificar las salidas ya escritas, porque dejarían tachones**. En un kardex digital todo se puede
editar siempre, y eso hace **más fácil «hacer que cuadre» un saldo** (ajustar cifras pasadas para que coincidan con lo que hay
en la despensa). Hace falta:

1. Una **restricción que detecte que se está modificando un dato pasado un día o dos** y **no lo permita**.
2. Si aun así se quiere cambiar, que **el cambio quede trazado** y la persona encargada (la nutricionista) lo **vea al recibir
   el kardex** cuando se envía la semana.
3. La meta de fondo es **desincentivar** el ajuste silencioso, no hacerlo imposible: el papel tampoco impedía corregir, solo
   dejaba la marca. Aquí la marca es el registro.

## 2. Qué hay hoy (VERIFICADO leyendo el código)

| Pieza | Hoy | Consecuencia |
|---|---|---|
| `kardex_save_product` | Guarda **la fila completa** del producto y mes (42 salidas, 6 entradas, 6 saldos). No mira fechas: cualquier día del mes, y de cualquier mes, es editable siempre. | No hay candado de días. |
| Quién calcula `prev_balances` | El **navegador**; el servidor los guarda tal cual (hallazgo C2 del plan 013). | Un candado solo en pantalla se elude llamando al RPC. **El candado tiene que estar en el servidor.** |
| Corrección de saldo (✏️, `kardex_insert_ajuste`) | Permitida **en cualquier semana, sin límite de tiempo**, con motivo obligatorio. Queda en `ajustes` (solo se agrega) y se ve en el Historial. | Es justo el camino para «cuadrar» un saldo. Hoy deja huella, pero **nadie la ve al recibir la semana**. |
| Envío de semana | Guarda una «foto» (`snapshot`) de los números; marca «modificada» si cambian después. | Ya detecta *que* cambió, no *qué* cambió ni *por qué*. |
| Plan 013 (en pausa) | Ya diseña: **el servidor como autoridad**, regla de **mes cerrado** (`MES_CERRADO`), tabla de auditoría `kardex_corrections` (solo se agrega), ventana «Guardar corrección» con motivo de 5 a 500 caracteres, `America/Bogota`, y dos interruptores **apagados** en producción. | **Este plan es la misma idea con una granularidad más fina**: el 013 cierra por **mes**; el 014 cierra por **día**. Conviene construirlos como una sola cadena (sección 6). |

## 3. Diseño propuesto

### 3.1 La regla (en el servidor, con la fecha de Bogotá)

Un **día** del kardex está **abierto** si su fecha es **mayor o igual a «hoy menos N días»** (N configurable: «un día o dos»,
ver D1). Está **cerrado** si es anterior. Para las demás celdas:

| Celda | Cuándo está abierta |
|---|---|
| **Salida de un día** | Mientras el día esté abierto (incluye hoy y, si se permite, los días futuros de la semana). |
| **Entrada de la semana** (una cifra por semana) | Mientras **alguno** de los días de esa semana esté abierto, o hasta N días después del último día de la semana (D3). |
| **Saldo anterior** | Nunca se escribe a mano: lo calcula el servidor (plan 013, `server_chain`). Cambiarlo es una **corrección de saldo** (✏️). |
| **Corrección de saldo (✏️)** de una semana | Se trata como cualquier cambio de dato pasado: libre solo si la semana tiene días abiertos; si no, pasa por «Corregir» (D4). |

Lo que **no** cambia: lo que se escribe «hoy» se sigue guardando solo, como ahora (pensado para adultas mayores, sin fricción
en el uso normal).

### 3.2 Cómo se hace cumplir (servidor = autoridad)

`kardex_save_product` recibe la fila entera. El servidor **compara cada celda con lo guardado**: si cambia una celda cerrada,
rechaza **toda** la escritura con `DIA_CERRADO` (devolviendo qué celdas), sin guardar nada. Así un cliente viejo, una pestaña
abierta desde ayer o una llamada directa al RPC **no pueden saltarse el candado**. Mismo patrón que `MES_CERRADO` del plan 013
(se reutiliza su bloqueo por comunidad|producto y su cálculo en servidor).

### 3.3 El camino para corregir (con traza)

Un botón **«Corregir un dato anterior»** (misma ventana aislada del plan 013, ahora también para días de este mes):

1. La persona elige producto y día(s) y escribe el valor nuevo.
2. **Motivo obligatorio** (5–500 caracteres, con letras o números, como en el 013) y vista previa del efecto en los saldos
   siguientes (salidas, saldos de las semanas y meses que siguen).
3. Confirmación y **guardado atómico**: la corrección y el recálculo de los saldos en una sola operación del servidor.
4. Queda en una tabla **`kardex_cell_corrections`** que solo admite agregar (sin `update` ni `delete`, con *trigger*):
   comunidad, producto, fecha, campo (salida, entrada o saldo), **valor anterior, valor nuevo**, motivo, momento (UTC y
   Bogotá), y a qué semana enviada pertenece.

Actor: la sesión representa a la **comunidad** (PIN compartido), no a una persona; igual que el 013, este plan no inventa
identidades individuales (ver riesgo R5).

### 3.4 Lo que ve la nutricionista al recibir la semana

- La **campanita** y la tabla de comunidades marcan la semana con **«N correcciones»** (además de «modificada»).
- Al abrir la semana: un recuadro **«Correcciones de esta semana»** con cada cambio: producto, fecha, **antes → después**,
  motivo y cuándo se hizo (y lo que cambió en los saldos siguientes). Marcar la semana como revisada también da por vistas esas
  correcciones.
- El **Excel y el PDF** del kardex llevan una hoja/sección «Correcciones» (como la hoja de cambios de la lista de mercado,
  plan 008). Opcional, Fase 4.
- Resumen mensual por comunidad: **cuántas correcciones** hizo cada casa (un número alto es la señal que se busca, sin acusar).

### 3.5 Lo que la colaboradora ve

- Las celdas de días cerrados se ven **bloqueadas** (candado y fondo gris) con un texto claro: *«Este día ya cerró. Si hay que
  corregirlo, toca “Corregir un dato anterior”: quedará anotado y la nutricionista lo verá.»* Letra grande, aviso visible,
  se cierra al tocar (norma del proyecto para adultas mayores).
- La **primera vez** que se acerca al límite (p. ej. el día se cierra mañana) un aviso amable, no un bloqueo sorpresivo.

## 4. Decisiones que necesito de Lucho (no las resuelvo yo: son reglas de negocio)

| # | Decisión | Mi recomendación |
|---|---|---|
| D1 | **Cuántos días** de margen (N) y **cómo se cuentan** (días calendario o hábiles) | **N = 2 días calendario**, configurable. Ojo: con N = 1, lo del sábado y el domingo que se anota el lunes quedaría cerrado; hay que preguntar a las colaboradoras cuándo llenan en la práctica (ver también la nota de la minuta en el plan 011: a veces registran todo al final del día). |
| D2 | **Quién puede abrir** un día cerrado: la propia colaboradora con motivo, o solo con **autorización de la nutricionista** | **Con motivo, sin esperar autorización** (la traza es el control, como en el 013); la autorización previa frena el trabajo y las colaboradoras ya están sobrecargadas. Pasar a «requiere visto bueno» más adelante si el número de correcciones preocupa. |
| D3 | Cuándo se cierra una **entrada semanal** | N días después del último día de la semana. |
| D4 | La **corrección de saldo** (✏️) de semanas pasadas: ¿libre como hoy o también bajo candado? | **Bajo candado** (es el camino directo para «cuadrar» un saldo). La semana en curso queda libre. |
| D5 | Una semana **ya enviada o revisada**: ¿se cierra del todo aunque esté dentro de los N días? | Sí: al **enviar** la semana, sus días se cierran; reenviarla es una corrección anotada. (Hoy «Volver a enviar» es libre.) |
| D6 | **Días futuros**: ¿se pueden llenar por adelantado? | No (el papel tampoco lo haría). Confirmar con la práctica real: hoy quizá se llena el día en curso al final. |
| D7 | Qué hace el candado con un **error de digitación del mismo día** (corregirlo dentro de N días) | Libre: es justo el margen. |
| D8 | ¿La demo para otras organizaciones debe mostrar este candado? | ✅ **Hecho el 2026-10-26** (Lucho: «sí»): la demo (`kardex-demo/`, aparte de este repositorio) ya lo muestra con **2 días de margen como valor de ejemplo, no como decisión D1**. Sirve de prototipo del diseño: regla pura `src/lib/dayLock.ts`, servidor simulado que rechaza con `DIA_CERRADO`, ventana «Corregir un dato anterior», recuadro de correcciones y marca ✎ en el panel de la nutricionista; 43 pruebas, 10 mutantes del candado detectados. Es un simulador en el navegador: **no es SQL ni se puede copiar tal cual** a producción (allí falta el servidor real, `kardex_cell_corrections` y su *trigger*). |

## 5. Casos límite y riesgos

| # | Riesgo | Cómo se atiende |
|---|---|---|
| R1 | **Guardado en cola sin internet** que llega al servidor **después** de que el día cerró: la persona escribió a tiempo, pero el candado se cierra antes de que llegue. | La hora del cliente no es confiable (puede tener el reloj mal). Opciones: (a) juzgar solo por la hora de **llegada** al servidor (simple y a prueba de trampas, pero castiga a quien escribió a tiempo y perdió la conexión); (b) aceptar también la fecha en que el cliente dice que escribió, con un tope de llegada (p. ej. 3 días), a costa de poder falsear esa fecha. Propuesta: empezar con (a), porque la app ya conserva lo escrito en pantalla y lo reenvía al volver la conexión; si un día cerró mientras tanto, se muestra lo escrito con «Corregir». **Decisión a cerrar con una prueba de dos navegadores.** |
| R2 | **Medianoche y zona horaria**: la pantalla (reloj del computador) y el servidor discrepan. | Toda la regla en el servidor con `America/Bogota`; la pantalla usa `bogotaDate` (como la lista de mercado). Pruebas en 23:59/00:00 Bogotá. |
| R3 | **Meses largos y semana 6** (días 30–31): el candado por día usa la misma tabla de calendario (`buildCalendarWeeks`), incluida la semana de cierre. | Pruebas con marzo, agosto y noviembre de 2026. |
| R4 | **Convivencia con el plan 013** (mes cerrado). Dos reglas distintas pueden dar respuestas distintas. | Una sola función de servidor `_kardex_cell_state(fecha)` que devuelve abierta/cerrada; el «mes cerrado» del 013 es solo un caso (todo día de un mes anterior está cerrado). |
| R5 | **PIN compartido**: la traza dice *qué casa*, no *qué persona*. | Se mantiene la decisión del 013 (no inventar identidades). Si la organización lo exige, el cambio sería de autenticación (zona de aprobación; el PIN de 4 dígitos es una desviación conocida). |
| R6 | **Motivo de relleno** («.....», «ajuste»): se pondrá algo para pasar. | Mismas reglas del 013 (5–500 caracteres con letras o números); además la nutricionista **ve** el motivo, y el recuento por casa hace visible el abuso. No se puede garantizar honestidad, solo visibilidad. |
| R7 | **Fricción para las colaboradoras** (adultas mayores): un candado mal explicado se vive como un fallo. | Mensajes claros, el margen holgado (D1), ensayo con ellas antes de encenderlo, y **interruptor apagado por defecto** para empezar con una sola casa. |
| R8 | **Datos viejos**: al encender el candado, ¿qué pasa con lo ya guardado? | Nada: el candado solo mira **cambios nuevos**; no reescribe historia. |
| R9 | El servidor del repositorio **puede no coincidir con producción** (`kardex_records` se creó a mano; `CLAUDE.md`). | Fase 0 de solo lectura antes de escribir SQL, como en el 013. |

## 6. Fases propuestas (cada una en su rama, con aprobación de push aparte)

| Fase | Contenido | Salida |
|---|---|---|
| **0 — Decisiones y práctica real** | Lucho responde D1–D8. Hablar con 1–2 colaboradoras: ¿cuándo llenan (a diario, al día siguiente, el lunes por el fin de semana)? Revisar el diagnóstico del plan 013 (esquema real). | Decisiones anotadas en este plan; N y reglas confirmadas. |
| **1 — SQL (apagado)** | Tabla `kardex_cell_corrections` (solo agrega, *trigger*); `kardex_settings.day_lock_days` y un **interruptor `day_lock`** apagado; función `_kardex_cell_state`; `kardex_save_product` v4 que rechaza celdas cerradas **solo si el interruptor está encendido**; `kardex_correct_cells` (atómica, motivo, tope); `admin_*` y `kardex_week_submissions` devuelven el recuento y el detalle de correcciones. Pruebas SQL con mutaciones (`tests/db`) y de integración. **Se entrega a Lucho para que lo corra él.** | Se despliega sin cambiar nada de lo que ven las casas. |
| **2 — Cliente** | `dayLock.ts` (función pura compartida y probada), celdas bloqueadas con candado y aviso, ventana «Corregir un dato anterior» (reusando la del 013), manejo de `DIA_CERRADO` en la cola de guardado, sin internet incluido (R1). Pruebas de pantalla. | App lista, interruptor aún apagado. |
| **3 — Panel de la nutricionista** | Marca «N correcciones», recuadro de detalle antes→después con motivo, resumen por casa. | La nutricionista ve las correcciones al recibir la semana. |
| **4 — Excel/PDF y demo** | Hoja de correcciones; mostrar el candado en la demo para otras organizaciones. | Material de venta. |
| **5 — Encendido gradual** | Prueba manual con dos navegadores (lista en `tests/manual/checklist.md`), **una casa piloto** con N generoso, revisar el recuento de correcciones y las quejas, luego el resto. | Candado en producción. |

## 7. Pruebas

- **Unidad:** `dayLock` en los bordes (hoy, hoy−N, hoy−N−1, 23:59 y 00:00 de Bogotá, fin de semana, semana 6, días 30–31).
- **SQL con mutaciones:** cada condición del candado debe tener una mutación detectada (quitar la comparación de una celda, usar `now()` en vez de la fecha de Bogotá, no tomar el bloqueo, aceptar un cliente viejo).
- **Integración (Supabase real, comunidades `ZZZ_TEST_BORRAR_AUTO_*`):** cliente que llama al RPC con un día cerrado → rechazado; con corrección → aceptada y anotada; cliente viejo → rechazado.
- **Manual:** dos navegadores, reloj en 23:59, corte de internet (R1), y la lectura de la nutricionista.

## 8. Fuera de alcance

Identidades individuales por persona; firmas digitales; aprobación previa de la nutricionista (D2, solo si se pide); candado
para la lista de mercado (tiene su propio plazo de viernes, plan 003); reparación de datos históricos.

## 9. Cómo retomar

1. Lucho responde las decisiones D1–D8 (sobre todo **D1** y **D2**).
2. Se decide **si el 014 se construye con el 013** (recomendado: comparten servidor-autoridad, tabla de auditoría, ventana y
   cálculo de saldos; hacerlos por separado duplica trabajo y arriesga reglas que se contradicen) y se reordenan las fases.
3. Fase 0 → Fase 1 con el SQL entregado a Lucho. **No se enciende ningún interruptor sin su aprobación.**
