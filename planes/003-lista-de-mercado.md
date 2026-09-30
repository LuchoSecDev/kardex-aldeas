# 003 — Lista de mercado (pedido semanal de cada comunidad)

**Estado:** 🚧 En curso — **Fase A programada y probada en local (2026-09-30)**; falta correr el SQL en Supabase. Sin precios ni presupuesto (ver decisiones).
**Rama:** `feature/lista-mercado`  **Fecha:** 2026-09-30

## Objetivo

Hoy, además de llenar el kardex, las colaboradoras llenan **un Excel de "Lista de mercado"** (4 hojas: Carnes,
Fruver, Abarrotes, Aseo) y lo **envían por correo** cada viernes a más tardar a las 5 pm. La nutricionista
necesita tener esas listas a mano, junto al kardex de cada comunidad, cuando toca pedir a los proveedores.

Este plan lleva esa lista **a la app**: la colaboradora la llena en un formulario (con un botón de enviar) y la
nutricionista la ve en una **pestaña nueva** del panel, con el consolidado de lo que pidió cada comunidad.
**Sin precios, totales en pesos ni presupuesto** (se descartó; ver decisiones).

Material de origen:
- `Lista de mercado 26 septiembre 2026 casa Maná.xlsx` (no está en el repositorio; el catálogo sin precios está en
  [`anexos/lista-mercado-catalogo.json`](anexos/lista-mercado-catalogo.json)).
- Foto del cronograma de pedidos 2026, transcrita en [`anexos/cronograma-pedidos-2026.md`](anexos/cronograma-pedidos-2026.md).

## Lo que dice el Excel (hallazgos)

| Hoja | Ítems | Columnas |
|---|---|---|
| CARNES | 35 (5 de evento) | cantidad, unidad, valor unitario, total |
| FRUVER (incluye **lácteos**, huevos, quesos, yogurt) | 117 (4 de evento) | cantidad, unidad, valor unitario, total |
| ABARROTE | 80 (2 de evento) | cantidad, unidad, valor unitario, IVA, total |
| ASEO | 53 | cantidad, unidad, valor unitario sin/con IVA, total |
| RESUMEN (oculta) | — | pedido vs marco presupuestal (**fuera de alcance**) |

Cada hoja lleva arriba: **Casa** (lista desplegable), **Semana** (1–15), **Mes** y **Número de participantes**.
De todas las columnas de valores **la app solo toma la cantidad y la unidad**.

Otros hallazgos del archivo: el desplegable "Casa" solo trae 8 comunidades (la app ya tiene las 15 reales); los totales
del Excel tenían errores de rango (CARNES se salta la primera fila, ABARROTE la última); la hoja oculta tiene
fórmulas rotas (`#REF!`). Nada de eso aplica a la app al no manejar valores.

## Cómo se envía hoy (regla de negocio, según Lucho)

| Lista | Frecuencia | Se envía | Entrega programada |
|---|---|---|---|
| Fruver **y lácteos** (misma lista) | Semanal | Viernes | Jueves |
| Carnes | Semanal | Viernes (junto con fruver y lácteos) | Martes |
| Abarrotes | **Quincenal** | Viernes | Jueves, viernes o sábado |
| Aseo | **Mensual** | Viernes (mitad de mes) | **Última semana del mismo mes** (confirmado: el aseo pedido el 18 sep llegó el 30 sep) |
| Panadería | Semanal | **No se envía**: se va a la panadería con convenio, se pide lo que se va a necesitar y **se firma un cuaderno de registro** | Inmediata |

- Todo el libro se manda junto cada viernes; las hojas que no tocan (Abarrotes/Aseo) van **en 0**.
- Nota que reciben las colaboradoras: **enviar por correo a más tardar a las 5 pm**.
- La lista del viernes 25–26 de septiembre se rotuló "Semana 1 de octubre": la **semana es la de la entrega**
  (lunes 28 sep – domingo 4 oct), aunque el lunes–miércoles caigan en septiembre.

## Cronograma de pedidos 2026

Transcrito en [`anexos/cronograma-pedidos-2026.md`](anexos/cronograma-pedidos-2026.md) (Lucho confirmó que el 27 de
marzo es F/L/C y que los tachones y colores de la foto son solo para guiarse; no se usan). Lo importante:

- **Fruver, Lácteos y Carnes (F/L/C): todos los viernes.**
- **Abarrotes (A): cada 14 días desde el viernes 9 de enero de 2026** (2, 16 y 30 de octubre; 13 y 27 de noviembre…).
- **Aseo (AS): el viernes que cae entre el 13 y el 19 de cada mes** (16 de octubre, 13 de noviembre, 18 de diciembre).
- Por eso la lista del 25 de septiembre iba con Abarrotes y Aseo en 0: ese viernes solo tocaba F/L/C.
- **Viernes festivos con pedido** (3 abr, 1 may, 7 ago, 25 dic): **el plazo se adelanta** (confirmado). Se siembra
  como jueves 2 abr → **miércoles 1 abr** (el jueves 2 también es festivo, Jueves Santo; *inferido, confirmar*),
  30 abr, 6 ago y 24 dic.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Formulario o Excel | **Formulario en la app.** Importar el Excel queda como mejora futura. | Respuesta de Lucho. |
| **Precios y totales en pesos** | **Fuera de alcance.** La app solo maneja cantidades y unidades. | Lucho: "saca precios y presupuesto, no es necesario". Si algún día se necesitan, es un plan aparte (los valores ya están en el Excel original). |
| **Presupuesto (hoja RESUMEN)** | **Fuera de alcance.** | Ídem. |
| Aseo | Se incluye. | Lucho. |
| Panadería | **No se incluye** en la lista. El registro es el cuaderno firmado en la panadería; en la app sigue solo en el kardex. | Es compra directa e inmediata con convenio. |
| Catálogo | Tabla **propia** `market_items`, no se reutiliza `products` del kardex. | Los nombres y unidades difieren (Excel: "Porcion"; kardex: "PAQUETE") y hay ítems que solo existen en uno (envueltos, arepas, recorte de charcutería). Un vínculo opcional al producto del kardex queda para la mejora de "saldo al lado". |
| Clave de la lista | **Lunes de la semana de entrega** (`week_start date` = viernes de pedido + 3 días), no (mes, semana 0–4). | Evita la ambigüedad de las 5 semanas (la misma semana es "5 de septiembre" y "1 de octubre") y **no depende de H1**. La pantalla la rotula "Semana 1 de octubre · 28 sep – 4 oct". |
| Semana por defecto | La del **próximo viernes de pedido** (el pedido de hoy → lista de la semana siguiente). Se puede cambiar. | Así funciona el ritual de los viernes. |
| Envío | **Un solo botón "Enviar lista de la semana"** que envía las listas juntas (las que no tocan o están vacías van como "no pedí"), como el libro de Excel. Reenviar se permite (sube contador, vuelve a "sin revisar"). **Reemplaza el correo.** | Mismo hábito actual: un envío, todo el libro. |
| Qué toca cada viernes | Tabla **`market_calendar`** (fecha del viernes → tipos que se piden + plazo), **sembrada con el cronograma 2026**. Para 2027 hay una regla de respaldo (A cada 14 días desde el 9 ene 2026; AS el viernes entre el 13 y el 19) que genera la tabla. La app **marca** "este viernes toca / no toca" por tipo pero **no bloquea** (se puede pedir igual). | El cronograma es oficial y tiene excepciones (festivos, eventos); una tabla es más fiel que una fórmula y se corrige por SQL. Bloquear sería un estorbo. |
| Plazo y tardías | **Sí se marcan** (confirmado). Plazo normal: viernes 5:00 pm Bogotá; en viernes festivo, el día hábil anterior (columna `deadline_at` del calendario). La nutricionista ve cada lista como **a tiempo / tarde / sin enviar**, juzgada por el **primer envío** (reenviar después no vuelve tardía una lista a tiempo, pero se anota "modificada después del plazo"). No bloquea. Pasado el plazo la tabla resalta quién **falta por enviar**. | Informativo: que la nutricionista sepa a quién llamar antes de pedir. |
| Participantes | **Fijos por comunidad** (`communities.participants`): la colaboradora lo cambia solo cuando llega o se va alguien. Cada lista guarda **copia del número vigente** al enviar, así un cambio posterior no altera el histórico. | En el archivo aparece 11, 11, vacío y 9 porque se escribía a mano en cada hoja. |
| Borrador | Se guarda solo mientras se digita (igual que el kardex), para retomar desde otro celular. | Son ~285 ítems; perderlos sería costoso. |
| Campanita | Las listas enviadas y sin revisar suman a la campanita junto con las semanas del kardex (con etiqueta "Lista de mercado"). | Un solo aviso para la nutricionista. |
| Seguridad | Mismo patrón del proyecto: tablas con RLS y `revoke all` a `anon`; funciones `security definer` que validan token; las de comunidad usan el token de comunidad y las de nutricionista el de administradora, sin cruzarse. | Ver plan 001. |

## Diseño

### Base de datos (SQL aditivo; archivo nuevo `supabase/market_lists_N.sql`)

- `market_items` — `id`, `kind` (`fruver` | `carnes` | `abarrotes` | `aseo`), `name`, `unit`, `is_event`,
  `sort_order`, `is_active`. **Sin acceso `anon`**: se lee con `market_catalog(token)`. Semilla desde
  `anexos/lista-mercado-catalogo.json` (`npm run seed:market`).
- `market_lists` — una fila por (`community`, `week_start`, `kind`): `quantities jsonb` (`{item_id: cantidad}` solo no
  ceros), `participants int` (copia del vigente al enviar), `status` (`borrador` | `enviada`), `first_submitted_at`,
  `submitted_at`, `submit_count`, `late bool`, `changed_after_deadline bool`, `reviewed_at`. Único por
  (comunidad, semana, tipo). Cantidades ≥ 0 con decimales (hay 0.25, 0.5…).
- `market_calendar` — `friday date primary key`, `kinds text[]` (p. ej. `{fruver,carnes,abarrotes}`; fruver y lácteos
  van en la misma lista), `deadline_at timestamptz`. Sembrada con 2026. **Sin acceso `anon`**: la comunidad la recibe dentro de `market_list_load`.
- `communities.participants int` — número fijo de participantes (nuevo).

Funciones:

| Fase | Función | Quién | Qué hace |
|---|---|---|---|
| A | `market_catalog(token)` | comunidad | Ítems activos por tipo |
| A | `market_list_load(token, week_start)` | comunidad | Borrador/enviadas de esa semana, calendario y participantes vigentes |
| A | `market_list_save(token, week_start, kind, quantities)` | comunidad | Guarda borrador (valida ítems, ≥ 0, semana = lunes) |
| A | `market_set_participants(token, n)` | comunidad | Cambia el número fijo de la comunidad |
| A | `market_list_submit(token, week_start)` | comunidad | Envía; calcula tardía con el plazo del calendario (rechaza si todas vacías: `LISTA_VACIA`) |
| C | `admin_market_overview(token, week_start)` | admin | Comunidades × tipos: estado, a tiempo/tarde/falta |
| C | `admin_market_list(token, community, week_start)` | admin | Solo los ítems pedidos |
| C | `admin_market_mark_reviewed(token, id)` | admin | Marca revisada |
| C | `admin_notifications(token)` (se amplía) | admin | Suma las listas sin revisar |
| D | `admin_market_consolidated(token, week_start, kind, solo_enviadas)` | admin | Suma por ítem entre comunidades |

### Pantallas

- **Comunidad:** en la pantalla principal, un selector **Kardex | Lista de mercado**. La lista: selector de semana
  (por defecto la del próximo pedido), pestañas Fruver y lácteos / Carnes / Abarrotes / Aseo (con "este viernes toca /
  no toca"), buscador, campos numéricos pensados para celular (teclado decimal), resumen "lo que voy a pedir"
  (solo ítems > 0), participantes editables en un lugar discreto, aviso del plazo (con la hora real: 5 pm, o el día
  hábil anterior si el viernes es festivo) y botón **Enviar lista de la semana** con confirmación.
- **Nutricionista:** pestaña nueva **"Listas de mercado"** en el panel: (1) tabla comunidades × tipos de la semana
  con estado y a tiempo/tarde/falta; (2) detalle de una lista (solo ítems pedidos); (3) consolidado por tipo con Excel.
  Botón para descargar la lista de una comunidad **en el formato actual del Excel, sin columnas de valores**.

## Fases

- [x] **Fase A — Catálogo y base de datos.** *(Hecha: `supabase/market_lists_N.sql`, `market_seed_1.sql` … `_7.sql` (generados, en archivos chicos), `src/lib/marketCalendar.ts`, `marketList.ts`, `marketService.ts`, tipos y 3 niveles de pruebas. Verificada en un Postgres local con todos los .sql del repo y con pruebas de mutación. **Desplegada en Supabase y verificada el 2026-09-30:** consulta de comprobación 3 | 8 | 1 | 285 | 52 y `npm run test:integration` en verde (72 pasan: 14 de la lista de mercado; 41 son las opt-in de administradora, omitidas a propósito).)* los `market_lists_1..5.sql` + semilla del catálogo + `market_calendar`
  (desde `anexos/cronograma-pedidos-2026.md`) + columna `communities.participants` + funciones de comunidad.
  *Aceptación:* un token de comunidad lee el catálogo, guarda borrador y envía; un token falso o de administradora se
  rechaza; las tablas están cerradas a `anon`; el envío marca tardía/a tiempo según el plazo.
- [x] **Fase B — Formulario de la colaboradora.** *(Hecha el 2026-09-30: `CommunityShell` con selector Kardex | Lista de mercado, `useMarketList`, `components/market/*`, `market.css`, cola de guardado genérica `lib/saveQueue.ts`. Verificada con 30 pruebas de pantalla (jsdom) y en un navegador real contra un Supabase simulado, en escritorio y celular de 360 px: guardado con decimales, participantes, envío, aviso de cambios tras enviar, sin scroll horizontal ni errores de consola. **Pendiente:** probarla en un celular real con la base real (las pruebas de integración de la Fase A ya pasan contra Supabase).)* Selector Kardex | Lista, pestañas, buscador, guardado automático,
  envío, avisos (toca/no toca, plazo), participantes. *Aceptación:* se llena y envía desde un celular de 360 px; al
  recargar el borrador sigue; sin red, avisa y reintenta como el kardex.
- [x] **Fase C — Panel de la nutricionista.** *(Programada y probada el 2026-09-30: `supabase/market_admin_1..3.sql`, `useAdminMarket`, `AdminMarketLists`, campanita con dos clases de aviso, `lib/marketAdmin.ts`. Verificada con pruebas SQL en Postgres local (con 5 mutaciones que fallan como deben), 36 pruebas unitarias/de pantalla y en navegador real contra un Supabase simulado (escritorio y 360 px). **Pendiente:** correr los 3 SQL en Supabase, `npm run test:integration` con `ADMIN_LOGIN_PASSWORD`, y probarla con la cuenta real.)* Pestaña nueva, detalle, a tiempo/tarde/falta, marcar revisada,
  campanita. *Aceptación:* lo enviado aparece con lo pedido; reenviar vuelve a sumar a la campanita; las tardías
  se distinguen.
- [ ] **Fase D — Consolidado y Excel.** Suma por ítem entre comunidades, Excel consolidado y Excel por comunidad en el
  formato actual (4 hojas, las que no tocan en 0, sin valores).
- [ ] **Futuro:** importar el Excel; mostrar el saldo del kardex junto a cada ítem (requiere vincular catálogos);
  precios y presupuesto si la organización los pide (plan aparte).

## Pruebas

- SQL local (`tests/db/market_lists.test.sql`, `npm run test:db`): permisos de tablas y funciones, sesión, catálogo, calendario sembrado, cargar/guardar/enviar, participantes, tardías, aislamiento. Corre contra un Postgres desechable, **no toca Supabase**.
- Unitarias (`tests/unit/`): "toca / no toca" (quincenal desde el 9 ene, aseo entre el 13 y el 19) contra las 52
  fechas del cronograma 2026; lunes de entrega = viernes + 3; semana por defecto; plazo (5 pm Bogotá y festivos
  adelantados); a tiempo / tarde / modificada después del plazo.
- Integración (`tests/integration/market-lists.test.ts`, comunidades `ZZZ_TEST_…`): aislamiento entre comunidades,
  tokens cruzados rechazados, validaciones (ítem inexistente, cantidad negativa, semana que no es lunes), reenvío,
  participantes, campanita.
- Manual (`tests/manual/checklist.md`): sección nueva para la lista de mercado y el panel.

## Despliegue

1. Correr `supabase/market_lists_1.sql` … `market_lists_5.sql` (en orden) y luego `market_seed_1.sql` … `_7.sql` (aditivo: no afecta a la app actual).
2. Merge a `main` y push con visto bueno de Lucho.
3. `npm run test:integration` y checklist manual; limpiar datos de prueba (ampliar `cleanup_test_data.sql`).

## Respuestas de Lucho (2026-09-30)

| Pregunta | Respuesta |
|---|---|
| Participantes | Fijos por comunidad; solo cambian si llega o se va alguien. |
| Semanas de abarrotes | Se deducen del cronograma (cada 14 días desde el 9 ene 2026). |
| Precios / presupuesto | Se sacan: no son necesarios. |
| ¿Repo privado? | Sí. |
| ¿Reemplaza el correo? | Sí. |
| Plazo y tardías | Viernes 5 pm; sí se marcan. |
| 27 de marzo | Es F/L/C. Los tachones y colores de la foto son solo para guiarse. |
| Entrega del aseo | La última semana del mismo mes (el pedido del 18 sep llegó el 30 sep). |
| Viernes festivo | El plazo se adelanta. |
| Panadería | Se va a la panadería, se pide lo necesario y se firma un cuaderno. No va en la app. |

## Pendientes por confirmar (menores; no bloquean la Fase A)

1. **Plazo de los viernes festivos:** se sembró jueves 2 abr → miércoles 1 abr (porque el jueves 2 es Jueves Santo),
   30 abr, 6 ago y 24 dic. Confirmar cuando se acerquen (el próximo es 25 dic).

## Riesgos

- Son ~285 ítems en celular: el formulario debe ser ágil (buscador, pestañas, teclado numérico). Se valida con ellas.
- Ítems nuevos o renombrados por la organización: el catálogo vive en BD (`market_items`), se cambia por SQL.
- Dos números distintos de "semana" conviven (semana del kardex y semana de entrega); por eso la lista se clava a
  una fecha (lunes) y no a (mes, semana).
- El cronograma 2027 aún no existe: hasta que la organización lo publique, la regla de respaldo lo genera.
