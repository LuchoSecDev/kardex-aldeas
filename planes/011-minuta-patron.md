# 011 — Minuta patrón: cumplimiento de gramajes, pedido sugerido y «Salida de hoy»

**Estado:** 📝 **Borrador de diseño v2, FEATURE FUTURA** (2026-10-02). Lucho decidió **dejarlo para más adelante**: es un cambio delicado y por ahora **complicaría el trabajo de las «tías»** (referentes afectivas y colaboradoras). Reorientado tras ver los tres documentos del ICBF y las respuestas de Lucho. **No se programa nada** hasta que Lucho lo reactive y se cierre la Fase 0 (faltan páginas de los documentos y las decisiones marcadas ❓).
**Rama:** `feature/minuta-patron` (cuando se programe)  **Alcance comercial:** función nueva, fuera de la suscripción (se cotiza por hora con estimación previa; lo decide Lucho).

## Objetivo (reformulado)

La idea inicial era una guía diaria («hoy toca sacar esto»). Lucho aclaró que **las colaboradoras calculan las salidas por su cuenta, sin mirar mucho la minuta patrón**; esta solo se usa **para las visitas sorpresa del ICBF, donde los gramajes y las medidas se deben cumplir sí o sí**. Por eso el valor está en otro lado. Tres usos, en este orden:

1. **Cumplimiento (listo para la visita del ICBF).** Comparar lo que **realmente salió** en el kardex contra lo que la minuta exige (gramaje × personas), por producto y por **grupo de alimentos**, **sin que las colaboradoras hagan nada extra** (las salidas ya existen). Solo lectura.
2. **Cantidad sugerida a pedir.** La regla que faltaba en el plan 002: consumo esperado hasta la próxima entrega − saldo actual.
3. **«Salida de hoy»** (opcional, al final): la guía diaria. Es la parte que **escribe** en el kardex y la de mayor riesgo (R1); como hoy no la necesitan, queda para después y solo si la piden.

**Principio de diseño: el sistema sugiere y muestra, nunca decide ni llena salidas.** Lo físico manda (así trabajan hoy: si por un cambio de menú algo no salió, se ajusta otra salida para que el saldo cuadre).

## Qué se sabe

### Confirmado por Lucho (2026-10-02)

| Tema | Respuesta |
|---|---|
| Cuántas minutas | **Una sola para todas las comunidades** (las comunidades no se anotan: todas cumplen la misma). |
| Quiénes comen | Ya **no hay niños**: adolescentes (el menor tiene 17 años) y adultos de 18 a 25. Los documentos son del grupo **18 a 59 años y 11 meses**. |
| Cómo se cuenta el ciclo | **El Día 1 es siempre el día 1 del mes** (no importa si cae lunes o domingo). Hay **31 días de menú**, aunque un mes tenga 28, 29 o 30. No hay rotación ni fecha ancla. |
| Tiempos de comida | 5: **desayuno, refrigerio de la mañana, almuerzo, refrigerio de la tarde y comida/cena** (Lucho dice «onces»). |
| Cuándo se registran las salidas | Al final del día, o en dos momentos: **mañana** (desayuno, refrigerio de la mañana, almuerzo) y **cierre** (refrigerio de la tarde y cena). |
| Cómo calculan hoy | Por **número de personas** (Maná: 11), sin mirar la minuta patrón. Ej. Día 1, desayuno: leche, chocolate, queso campesino, arepa de maíz (con harina) y manzana. |
| Cambios de menú | Se compara con lo que **queda en físico**; si algo debió salir y no salió, **se altera otra salida** para que concuerde. |
| Festivos y eventos | **No cambian nada**: se sigue la minuta, salvo que la nutricionista autorice pedir un producto nuevo en la lista de mercado. |
| Vigencia | **Sigue vigente.** Podrían cambiar algunas comidas, nada confirmado. La mantiene el ICBF. |
| Aclaraciones del menú | «**o tigre**» es sinónimo de **fideos**; cuando dice **«frutas»**, se **combinan** (en ensalada o picadas): no son opciones, son todas. |
| Unidades | **Libra = 500 g.** |

### Los tres documentos (fotos del 2026-10-02) — VERIFIED en las imágenes

| Documento | Qué dice | Qué falta en las fotos |
|---|---|---|
| **Ciclo de menús** (F2.O6, elaborado el 30-sep-2022, firmado por la nutricionista de la EAS y la del ICBF) | **QUÉ se sirve** cada día, por tiempo de comida: platos y alimentos. Columnas «Día 1–7» por «Semana No. n». ~20 casillas por día. **Sin cantidades.** | Semanas 3, 4 y 5 (y cómo se rotulan los días 29–31). |
| **Minuta patrón** («sin AAVN», Dirección de Protección, 5 tiempos, grupo 18–59 años y 11 meses) | **CUÁNTO por persona**, por tiempo de comida y **grupo de alimentos**, con frecuencia y **peso bruto / neto / servido** (g, o cc en líquidos). Ej.: leche 210 cc (o 29 g en polvo); huevo 55 g, queso 50 g o carne magra 50 g; galletas 28 g, pan 50 g o ponqué 40 g; fruta 110–220 g; aceite 3 cc; almuerzo: verduras 50–113 g, cereal 50 g, tubérculos o plátanos 110–162 g, carne roja 105 g (3 días/semana), pollo (2 días) o pescado (1 día) 105 g neto (bruto: pechuga 113 g, pierna 144 g, contramuslo 115 g, pescado 202 g), leguminosas 25 g (1 día/semana), aceite 13 cc. | **Refrigerio de la tarde y comida/cena** (la foto termina en el almuerzo). |
| **Lista de intercambio** (F3.O6.PP v2, 07/02/2017, grupo 18–59 años y 11 meses, «página 1 de 3») | **Peso bruto y neto por porción de cada alimento** y su **medida casera** (ej.: arroz 50 g = 7 cucharadas soperas; arepa de maíz a la plancha 31 g = 1 unidad; tubérculos, plátanos y frutas por unidad). | Páginas 2 y 3 (lácteos, carnes, verduras, etc.). |

**Cómo se combinan (INFERRED, el uso habitual de estos formatos; confirmar con la nutricionista):** el ciclo de menús dice **qué alimento** va cada día; la minuta patrón dice **cuánto por persona** de ese grupo y con qué frecuencia; la lista de intercambio dice **cuánto pesa una porción de ese alimento concreto**. Con los tres se puede calcular la cantidad por persona de cada alimento sin que nadie la invente.

**Otros hechos:**
- **UNKNOWN:** el renglón «Cereal o derivado de cereal 9,6 g» del desayuno (¿chocolate?).
- **UNKNOWN:** si el kardex cuenta el peso **bruto** (lo que sale de la despensa). Se asume que sí (**INFERRED**).
- **VERIFIED** en el código: el kardex acepta salidas en pasos de **0,5**; guarda el arreglo completo del producto en el mes y **gana el último en escribir** (`kardex_save_product`); los saldos se calculan en el cliente y se guardan junto con las salidas.
- **VERIFIED:** el catálogo tiene 240 productos y 13 unidades (LIBRA 82, UNIDAD 65, PAQUETE 58, ATAO 7, FRASCO 6, BANDEJA 5, LITRO 4, LATA 3, KILOS 3, KILO 2, TACO 2, CAJA 2, MATA 1). «Leche entera» no existe como producto (hay larga vida, descremada, deslactosada y en polvo).
- **VERIFIED:** las comunidades ya guardan sus participantes fijos (lo usa la lista de mercado).

## Ejemplo de cálculo: Día 1, desayuno, Maná (11 personas)

| Alimento | Por persona | × 11 | Producto del kardex | Resultado |
|---|---|---|---|---|
| Leche | 210 cc (minuta) | 2,31 L | «Leche larga vida maxilitro» (UNIDAD) o «Leche polvo entera *900gr» (PAQUETE) | Depende de cuál usen y de **cuántos litros trae un maxilitro** (UNKNOWN). En polvo: 29 g × 11 = 319 g = 0,35 paquete. |
| Queso campesino | 50 g (minuta) | 550 g | «Queso campesino» (LIBRA = 500 g) | 1,1 lb → **1,0 lb** al redondear a 0,5. |
| Arepa de maíz a la plancha | 31 g (lista de intercambio, 1 unidad) | 341 g | «Harina arepa» o «Harina trigo» (LIBRA) | 0,68 lb → **0,5 lb** (o 1,0, según el redondeo). ❓ ¿qué harina usan? |
| Manzana | 110–220 g (minuta: un **rango**) o 1 porción de la lista | 1,2–2,4 kg | «Manzana gala/verde» (UNIDAD) | Hay que **elegir un valor** del rango y su equivalencia en unidades. |
| Chocolate con leche | no se ve en la minuta | — | «Chocolate» (LIBRA) | **No hay gramaje legible**: ❓. |
| Aceite | 3 cc (minuta) | 33 cc | «Aceite girasol» (LITRO) | 0,03 L: **menos que el paso de 0,5 del kardex**; no se puede representar por día. |

**Lo que enseña:** (1) la cuenta **se puede hacer** para los alimentos principales; (2) los **rangos** («110–220 g») y las **alternativas** («leche líquida o en polvo») obligan a elegir un valor y un producto: es **decisión de la nutricionista**, no del sistema; (3) las cantidades pequeñas (aceite, harina) **no caben en un paso de 0,5 por día**: por eso el cumplimiento se compara **por semana o por mes con valores exactos**, no por día redondeado.

## Decisiones

| # | Tema | Estado / recomendación |
|---|---|---|
| D1 | Día del ciclo | ✅ **Resuelta:** día del menú = día del mes (1–31). La «semana» del menú son bloques de 7 días del mes (1–7, 8–14, …, 29–31); **no** coincide con las semanas lunes–domingo del kardex y no hace falta que coincida. ❓ Confirmar cómo se rotula la semana 5. |
| D2 | ¿Se sirven los 7 días? | ✅ Todos los días, 1 a 31. |
| D3 | Personas | **Los participantes fijos de la comunidad** (ya existe el dato). Sin pregunta diaria, salvo que las colaboradoras la pidan (visitas, ausencias). |
| D4 | Gramaje por persona | Un solo grupo (18–59 años y 11 meses). Se usa el **peso bruto** (lo que sale de la despensa) ❓ ¿el kardex cuenta bruto? ❓ ¿los de 17 años también se rigen por esta hoja? Para los **rangos** y **alternativas**, la **nutricionista fija el valor** que se usa. |
| D5 | Conversión de unidades | `minuta_product_units` (por producto, cuánta unidad base trae una del kardex): KILO = 1000 g, LITRO = 1000 cc, **LIBRA = 500 g (confirmado)**; PAQUETE, FRASCO, BANDEJA, LATA, TACO, CAJA, MATA, ATAO y UNIDAD (frutas, maxilitro) los define la nutricionista, **solo para los productos que aparecen en la minuta**. |
| D6 | Redondeo | Para **cumplimiento y pedido: valores exactos, sin redondear**. El redondeo a 0,5 solo se usa en la «Salida de hoy» opcional. |
| D7 | Sustituciones («pescado por pechuga») | Se comparan **por grupo de alimentos** además de por producto, para que la sustitución se compense (−pescado, +pollo) y no parezca incumplimiento. |
| D8 | Quién carga la minuta | **Por script** (yo convierto los documentos a SQL con un informe de lo que no reconoce; Lucho lo corre). Pantalla de carga en `/admin` solo si el ICBF cambia algo. Versionada con `valid_from`. |
| D9 | Del plato al producto | Empezar solo con los **alimentos principales** (lácteos, huevos, queso y carnes, cereales, frutas, verduras, tubérculos y plátanos, leguminosas, aceite), dejando fuera condimentos y despensa fina. Cada plato se mapea **una sola vez**; la nutricionista valida la tabla. |
| D10 | Opciones en una casilla | ✅ **Resuelta:** «o tigre» = fideos (sinónimo) y «frutas» = se combinan. **No hay opciones que elegir.** |
| D11 | ❓ **¿Qué revisa el ICBF en la visita?** (¿pesa una porción servida?, ¿compara el kardex contra la minuta?, ¿mira las existencias?). | Define el formato del informe de cumplimiento. |
| D12 | ❓ ¿Registran **a diario** las salidas de aceite, sal, azúcar y demás despensa fina? | Si no, quedan fuera del cumplimiento por producto (solo alimentos principales). |

## Diseño propuesto

### Datos (SQL aditivo, archivos ≤ 98 líneas `minuta_N.sql`, todo con RLS y `revoke all`)

- `minuta_versions` — `id`, nombre, `valid_from`, `source` (p. ej. «ICBF 2022»). Una versión nueva **no borra** la anterior.
- `minuta_menu` — el **ciclo de menús** tal como está impreso: `version_id`, `menu_day` (1–31), `meal`, `slot`, texto del plato. Sirve para mostrar el menú del día y como evidencia del mapeo.
- `minuta_items` — **lo que realmente se usa**: `version_id`, `menu_day`, `meal`, `food_group`, `product_id` (del catálogo), `qty_per_person`, `base_unit`. Sale de unir los tres documentos (D9) y lo valida la nutricionista.
- `minuta_product_units` — `product_id`, `base_unit`, `base_per_unit` (D5).
- *(Solo si se hace la «Salida de hoy»)* `minuta_blocks` y `minuta_lines`: lo confirmado por la colaboradora en cada momento del día.
- Sin datos de personas: solo cantidades y el número de participantes que ya existe.

### Cálculo (puro, en `src/lib/minuta.ts`, probado con pruebas unitarias)

1. Día del menú = día del mes. 2. `esperado(producto, día) = Σ qty_per_person × participantes ÷ base_per_unit`. 3. `real = salidas del kardex` (ya guardadas, exactas). 4. Comparar por **semana y mes**, por producto y por **grupo de alimentos**; indicador de cumplimiento y tolerancia a definir con la nutricionista. 5. Un producto **sin equivalencia** de unidad se marca «sin equivalencia» y **no se inventa** un número.

### Pantallas

- **Cumplimiento (Fase 3):** pestaña en `/admin` (por comunidad y mes) y, después de validarla con la nutricionista, una vista **solo de lectura** para cada comunidad («¿cómo estamos frente a la minuta si viene el ICBF?»). Escritorio primero; sin romper 360 px; letra grande y contraste.
- **«Salida de hoy» (Fase 5, opcional):** tres botones por producto («saqué lo indicado», «otra cantidad», «no había») y «agregar otro producto». Escribe en el kardex, así que exige el diseño de R1: usar el **mismo estado del kardex** (no una copia), aplicar una **diferencia** (idempotente) y guardar el producto y su línea en **una sola transacción** con control optimista. **No se programa** sin spike previo ni sin que las colaboradoras la pidan.

### Seguridad (ASVS nivel 1, con V6/V7/V8 en nivel 2 como el resto del proyecto)

Todo por RPC `security definer` con `set search_path`; tablas cerradas; token de administradora para el informe general y token de comunidad para su propia vista; la minuta es compartida y de solo lectura para las comunidades; una comunidad solo ve **sus** cifras (prueba de aislamiento obligatoria). La Fase 3 **no escribe** en el kardex. Sin tocar PIN, sesiones ni rate limit (el PIN de 4 dígitos sigue siendo una desviación conocida y aprobada).

## Fases

| Fase | Entrega | Pruebas | Estimado* | Necesita |
|---|---|---|---|---|
| **0. Descubrimiento** (sin código) | Digitalizar las 5 hojas del ciclo de menús (~620 casillas); completar la minuta patrón y la lista de intercambio; tabla plato → alimento → producto → equivalencia; **simulacro con septiembre** (`Kardex_Septiembre-hoja1..5.xlsx`): esperado contra real, por producto y grupo. **Es el punto de decisión:** si lo registrado se aleja mucho de la minuta incluso en los alimentos principales, el informe saldría «todo rojo» y hay que hablarlo (ver R8) antes de construir. | Informe del simulacro | 2–4 días + tiempo de la nutricionista | Documentos completos y D4/D9/D11/D12 |
| **1. Datos** | `minuta_1..N.sql` + carga por script con informe de validación | SQL local (`tests/db/minuta.test.sql`, con mutaciones), integración, `lib/minuta.ts` | 3–5 días | Que Lucho corra el SQL |
| **2. Carga desde Excel en `/admin`** *(solo si el ICBF cambia la minuta)* | Pantalla de la nutricionista con plantilla fija | Unitarias + abrir el `.xlsx` real | por definir | — |
| **3. Cumplimiento (solo lectura)** | Función admin + pestaña en `/admin`, y vista de comunidad | Unitarias, SQL (aislamiento, token), integración, manual | 3–4 días | Fase 1 |
| **4. Cantidad sugerida a pedir** | Consumo esperado hasta la próxima entrega − saldo; se conecta con el resumen semanal y la lista de mercado (cronograma en `planes/anexos/`) | Unitarias + SQL | 2–3 días | **Regla**: días entre pedidos por tipo y margen de seguridad |
| **5. «Salida de hoy»** *(opcional)* | Ver arriba (R1) | Unitarias con mutaciones, SQL de idempotencia y concurrencia, manual | 2–3 días | Que la pidan |

\*Órdenes de magnitud; se afinan con el simulacro. Cada fase es una rama y una aprobación de push aparte.

## Pruebas (alcance mínimo)

- **Unitarias (`lib/minuta.ts`):** día del menú por fecha (31 días, mes de 28/29/30), conversión por unidad, producto sin factor, cantidades pequeñas, agrupación por grupo de alimentos y sustituciones; con mutaciones comprobadas.
- **SQL (`tests/db/minuta.test.sql`):** aislamiento entre comunidades, token falso o de comunidad donde corresponde administradora, validaciones; si se hace la Fase 5, también idempotencia y control optimista.
- **Integración** contra Supabase real con comunidades `ZZZ_TEST_BORRAR_AUTO_*`.
- **Manual** (`tests/manual/checklist.md`): informe en portátil y 360 px; comparar un mes real contra el cálculo a mano de la nutricionista.

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | *(solo Fase 5)* Pisar o duplicar salidas del kardex (último en escribir gana; saldos calculados en el cliente). | Escritura por diferencia, atómica por producto y con control optimista; spike previo. **No existe en las Fases 1–4.** |
| R2 | **Los documentos no cuadran entre sí**: ciclo de 2022, lista de intercambio de 2017, minuta sin fecha legible. | La nutricionista valida la tabla final; se guarda de qué documento sale cada dato. |
| R3 | **Falsa precisión**: rangos («110–220 g»), alternativas y equivalencias de unidad que no se pueden deducir. | Valor fijado por la nutricionista, «sin equivalencia» en vez de inventar, exacto sin redondear en el análisis. |
| R4 | La calidad de los datos decide todo: el mapeo (~620 casillas) es lo que más tiempo consume, no el código. | Fase 0 antes de programar; el importador **informa** lo que no reconoce. |
| R5 | La minuta cambia (el ICBF puede cambiar algunas comidas). | Versionada con `valid_from`; el histórico usa la versión vigente ese día. |
| R6 | Sustituciones mal leídas como incumplimiento. | Comparación por grupo de alimentos; motivo visible junto a la cifra. |
| R7 | Un mismo PIN en varios dispositivos (limitación ya existente). | Solo afecta la Fase 5 (control optimista). |
| R8 | **El primer informe puede salir «todo rojo»**: las colaboradoras calculan a ojo, no por la minuta. Un informe de incumplimiento tiene peso político (la organización, el ICBF). | Mostrarlo **primero solo a la nutricionista**, con la tolerancia que ella defina; Lucho decide cómo se presenta y a quién. |

## Fuera de alcance

Recetas completas y costos; conciliar entradas contra la lista de mercado; minutas por grupo de edad o por comunidad (hoy es una sola); alertas por WhatsApp o correo.

## Lo que necesito para cerrar la Fase 0

1. Las páginas que faltan: **semanas 3, 4 y 5 del ciclo**, la **minuta patrón completa** (refrigerio de la tarde y cena) y las **páginas 2 y 3 de la lista de intercambio** (de frente y sin reflejo). Lucho las pasa cuando el plan esté claro.
2. **Un día real:** qué productos del kardex salieron el Día 1 de un mes (por ejemplo septiembre de Maná) y en qué cantidades. Con eso se contrasta contra el cálculo.
3. Respuestas a D4 (¿kardex en peso bruto? ¿los de 17 años?), D11 (¿qué revisa el ICBF?) y D12 (¿despensa fina a diario?), más las cuatro dudas de unidades de abajo.
4. Cuatro dudas de unidades: ¿cuántos litros trae un «maxilitro»?, ¿qué harina usan para la arepa?, ¿qué es el «cereal o derivado 9,6 g» del desayuno?, ¿cómo se rotula la semana 5?
