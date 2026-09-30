# 003 — Lista de mercado (pedido semanal de cada comunidad)

**Estado:** 📝 Propuesta (aprobada en lo general por Lucho el 2026-09-30; respondió las dudas del plan y aportó el cronograma de pedidos 2026; quedan 5 detalles menores en "Pendientes por confirmar")
**Rama:** `feature/lista-mercado`  **Fecha:** 2026-09-30

## Objetivo

Hoy, además de llenar el kardex, las colaboradoras llenan **un Excel de "Lista de mercado"** (4 hojas: Carnes,
Fruver, Abarrotes, Aseo) y lo **envían por correo** cada viernes a más tardar a las 5 pm. La nutricionista
necesita tener esas listas a mano, junto al kardex de cada comunidad, cuando toca pedir a los proveedores.

Este plan lleva esa lista **a la app**: la colaboradora la llena en un formulario (con un botón de enviar) y la
nutricionista la ve en una **pestaña nueva** del panel, con totales en pesos, consolidado por proveedor y el
análisis contra el marco presupuestal (la hoja oculta del Excel).

Material de origen: `Lista de mercado 26 septiembre 2026 casa Maná.xlsx` (no está en el repositorio porque
trae precios; el catálogo sin precios está en [`anexos/lista-mercado-catalogo.json`](anexos/lista-mercado-catalogo.json)).

## Lo que dice el Excel (hallazgos)

| Hoja | Ítems | Columnas | Precios en el archivo |
|---|---|---|---|
| CARNES | 35 (5 de evento) | cantidad, unidad, valor unitario, total | **Sí** |
| FRUVER (incluye **lácteos**, huevos, quesos, yogurt) | 117 (4 de evento) | cantidad, unidad, valor unitario, total | No (todo en 0) |
| ABARROTE | 80 (2 de evento) | cantidad, unidad, valor unitario, IVA, total | No (todo en 0) |
| ASEO | 53 | cantidad, unidad, valor unitario **sin IVA**, **con IVA (×1.19)**, total | **Sí** |
| RESUMEN (**oculta**) | — | por casa: carnes + fruver + abarrotes = pedido alimentación vs **presupuesto = 327 600 × participantes**; aseo vs **23 600 × participantes**; dice "SOBREJECUTADO" o "MARCO PRESUPUESTAL" | — |

Cada hoja lleva arriba: **Casa** (lista desplegable), **Semana** (1–15), **Mes** y **Número de participantes**.

**Errores del Excel que la app corrige (avisar a la nutricionista):**
- CARNES: el "valor total pedido" suma desde la fila 10 y **se salta la primera carne** (asar, $28 080): el archivo
  dice 330 364 y lo correcto es 358 444. Además suma los *valores unitarios* en otra celda (no tiene sentido).
- ABARROTE: el total suma hasta la fila 87 y **se salta el último ítem (CARVE)**; además multiplica por el valor
  unitario e ignora la columna IVA.
- RESUMEN (oculta): tiene fórmulas rotas (`#REF!`) y el promedio de participantes no calcula.
- El desplegable "Casa" solo trae 8 comunidades; la app ya tiene las 15 reales.
- Las hojas de Abarrotes y Aseo del archivo traen semana/mes viejos ("Semana 3 Septiembre", "Semana 4 junio"):
  son las que se envían en 0 cuando no toca.

## Cómo se envía hoy (regla de negocio, según Lucho)

| Lista | Frecuencia | Se envía | Entrega programada |
|---|---|---|---|
| Fruver **y lácteos** (misma lista) | Semanal | Viernes | Jueves |
| Carnes | Semanal | Viernes (junto con fruver y lácteos) | Martes |
| Abarrotes | **Quincenal** | Viernes | Jueves, viernes o sábado |
| Aseo | **Mensual** | Viernes | Primera semana del mes |
| Panadería | Semanal | **No se envía**: las colaboradoras compran en la panadería con convenio | Inmediata |

- Todo el libro se manda junto cada viernes; las hojas que no tocan (Abarrotes/Aseo) van **en 0**.
- Nota que reciben las colaboradoras: **enviar por correo a más tardar a las 5 pm**.
- La lista del viernes 25–26 de septiembre se rotuló "Semana 1 de octubre": la **semana es la de la entrega**
  (lunes 28 sep – domingo 4 oct), aunque el lunes–miércoles caigan en septiembre.

## Cronograma de pedidos 2026 (foto de Lucho)

La organización tiene un calendario impreso que dice **qué se pide cada viernes** (códigos F/L/C/A/AS). Está
transcrito en [`anexos/cronograma-pedidos-2026.md`](anexos/cronograma-pedidos-2026.md). Lo importante:

- **Fruver, Lácteos y Carnes (F/L/C): todos los viernes.**
- **Abarrotes (A): cada 14 días desde el viernes 9 de enero de 2026** (2 de octubre, 16 de octubre, 30 de octubre…).
- **Aseo (AS): el viernes que cae entre el 13 y el 19 de cada mes** (16 de octubre, 13 de noviembre, 18 de diciembre).
- Por eso la lista del 25 de septiembre iba con Abarrotes y Aseo en 0: ese viernes solo tocaba F/L/C.
- Hay viernes festivos con pedido (3 abr, 1 may, 7 ago, 25 dic).

## Decisiones


| Tema | Decisión | Por qué |
|---|---|---|
| Formulario o Excel | **Formulario en la app.** Importar el Excel queda como mejora futura. | Respuesta de Lucho (preg. 1). |
| Precios | (Lucho: "no lo tengas en cuenta" sobre quién los mantiene y los precios faltantes → se siguen cargando del Excel y se editan por SQL; sin pantalla de precios por ahora.) **Solo la nutricionista los ve.** Las colaboradoras nunca los reciben (la función que usa la comunidad no los devuelve). Totales en pesos solo en el panel. | Hoy ya están ocultos para ellas (preg. 2). |
| Hoja RESUMEN (presupuesto) | **Entra ahora**, solo en el panel de la nutricionista (fase E). | Preg. 3. |
| Aseo | Se incluye. | Preg. 5. |
| Panadería | **No se incluye** en la lista ni **en el marco presupuestal** (confirmado). Se sigue controlando solo en el kardex. | No se envía, es compra directa a la panadería con convenio. |
| Catálogo | Tabla **propia** `market_items`, no se reutiliza `products` del kardex. | Los nombres y unidades difieren (Excel: "Porcion"; kardex: "PAQUETE"), hay ítems que solo existen en uno (envueltos, arepas, recorte de charcutería) y el Excel trae IVA. Un vínculo opcional al producto del kardex queda para la mejora de "saldo al lado". |
| Precios en BD | Tabla aparte `market_item_prices` (sin acceso `anon`, solo la leen funciones `admin_*`), con `unit_price` **sin IVA** y `iva_rate` (0 o 0.19). | Que un error de permisos en el catálogo no filtre precios. |
| Clave de la lista | **Lunes de la semana de entrega** (`week_start date`), no (mes, semana 0–4). | Evita la ambigüedad de las 5 semanas (la misma semana es "5 de septiembre" y "1 de octubre") y **no depende de H1**. La pantalla la rotula "Semana 1 de octubre · 28 sep – 4 oct". |
| Semana por defecto | La **semana siguiente** (el lunes que viene): el viernes se pide para la semana que sigue. Se puede cambiar. | Así funciona el ritual de los viernes. |
| Envío | **Un solo botón "Enviar lista de la semana"** que envía las 4 listas juntas (las vacías van como "no pedí"), como el libro de Excel. Reenviar se permite (sube contador, vuelve a "sin revisar"). **Reemplaza el correo** (confirmado por Lucho). | Mismo hábito actual: un envío, todo el libro. |
| Qué toca cada viernes | Tabla **`market_calendar`** (fecha del viernes → tipos que se piden), **sembrada con el cronograma 2026 de la foto**. Para años siguientes hay una regla de respaldo (A cada 14 días desde el 9 ene 2026; AS el viernes entre el 13 y el 19) que genera la tabla de 2027. La app **marca** "Este viernes toca / no toca" por tipo pero **no bloquea** (se puede pedir igual). | El cronograma es oficial y tiene excepciones (festivos, eventos); una tabla es más fiel que una fórmula y se corrige por SQL. Bloquear sería un estorbo. |
| Hora límite y tardías | **Confirmado por Lucho: sí se marcan.** Aviso visible "Envía a más tardar el viernes a las 5:00 pm". La nutricionista ve cada lista como **a tiempo / tarde / sin enviar**; se juzga por el **primer envío** (reenviar después no convierte una lista a tiempo en tardía, pero se anota "modificada después del plazo"). No bloquea nada. A las 5 pm la tabla resalta quién **falta por enviar**. | Informativo: que la nutricionista sepa a quién llamar antes de pedir. |
| Participantes | **Fijos por comunidad** (respuesta de Lucho): un solo número guardado por comunidad (`communities.participants`), que la colaboradora cambia solo cuando llega o se va alguien. Cada lista envía **copia del número vigente** (así un cambio posterior no altera el histórico ni el presupuesto de semanas pasadas). | En el archivo aparece 11, 11, vacío y 9 porque se escribía a mano en cada hoja. |
| Borrador | Se guarda solo mientras se digita (igual que el kardex), para retomar desde otro celular. | Son ~285 ítems; perderlos sería costoso. |
| Campanita | Las listas enviadas y sin revisar suman a la campanita junto con las semanas del kardex (con etiqueta "Lista de mercado"). | Un solo aviso para la nutricionista. |
| Seguridad | Mismo patrón del proyecto: tablas con RLS y `revoke all` a `anon`; funciones `security definer` que validan token; las de comunidad usan el token de comunidad y las de nutricionista el de administradora, sin cruzarse. | Ver plan 001. |

## Diseño

### Base de datos (SQL aditivo; archivo nuevo `supabase/market_lists.sql`)

- `market_items` — `id`, `kind` (`fruver` | `carnes` | `abarrotes` | `aseo`), `name`, `unit`, `is_event`,
  `sort_order`, `is_active`. Lectura `anon` solo de activos (mismo patrón que `products`), sin precios.
- `market_item_prices` — `item_id`, `unit_price`, `iva_rate`, `updated_at`. Sin acceso `anon`.
- `market_lists` — una fila por (`community`, `week_start`, `kind`): `quantities jsonb` (`{item_id: cantidad}` solo
  no ceros), `participants int` (copia del vigente al enviar), `first_submitted_at`, `late bool`, `status` (`borrador` | `enviada`), `submitted_at`, `submit_count`, `reviewed_at`.
  Único por (comunidad, semana, tipo). Cantidades ≥ 0 con decimales (hay 0.25, 0.5…).
- `market_calendar` — `friday date primary key`, `kinds text[]` (p. ej. `{fruver,carnes,abarrotes,aseo}`); fruver, lácteos y carnes viajan juntos. Sembrada con 2026; lectura `anon` (no tiene datos sensibles).
- `communities.participants int` — número fijo de participantes (nuevo; lo edita la comunidad con una función `market_set_participants`).
- `market_settings` — fila única: `food_per_person` (327 600), `aseo_per_person` (23 600). Editable solo por funciones `admin_*`.

Funciones:

| Fase | Función | Quién | Qué hace |
|---|---|---|---|
| A | `market_catalog(token)` | comunidad | Ítems activos por tipo, **sin precios** |
| A | `market_list_load(token, week_start)` | comunidad | Borrador/enviadas de esa semana + último número de participantes |
| A | `market_list_save(token, week_start, kind, participants, quantities)` | comunidad | Guarda borrador (valida ítems, ≥ 0, semana = lunes) |
| A | `market_list_submit(token, week_start)` | comunidad | Envía las 4 (rechaza si todas vacías: `LISTA_VACIA`) |
| C | `admin_market_overview(token, week_start)` | admin | Comunidades × tipos: estado, tarde, total $ |
| C | `admin_market_list(token, community, week_start)` | admin | Líneas con precio, IVA y totales |
| C | `admin_market_mark_reviewed(token, id)` | admin | Marca revisada |
| C | `admin_notifications(token)` (se amplía) | admin | Suma las listas sin revisar |
| D | `admin_market_consolidated(token, week_start, kind, solo_enviadas)` | admin | Suma por ítem entre comunidades |
| E | `admin_market_budget(token, year, month)` | admin | Pedido del mes vs marco por comunidad |
| E | `admin_market_settings_get/set` | admin | Las dos constantes del presupuesto |

Los precios se cargan con un SQL de semilla **que no se sube a git** (ver Pendientes: visibilidad del repo).

### Pantallas

- **Comunidad:** en la pantalla principal, un selector **Kardex | Lista de mercado**. La lista: selector de semana
  (por defecto la siguiente), pestañas Fruver y lácteos / Carnes / Abarrotes / Aseo (con "toca / no toca esta
  semana"), buscador, campo de participantes, campos numéricos pensados para celular (teclado decimal), resumen
  "lo que voy a pedir" (solo ítems > 0), aviso de las 5 pm, botón **Enviar lista de la semana** con confirmación.
- **Nutricionista:** pestaña nueva **"Listas de mercado"** en el panel: (1) tabla comunidades × tipos de la semana
  con estado y total $; (2) detalle de una lista (solo ítems pedidos, con precio/IVA/total; ítems sin precio
  marcados "sin precio" y el total avisa que está incompleto); (3) consolidado por proveedor/tipo con Excel;
  (4) presupuesto del mes (fase E). Botón para descargar la lista de una comunidad **en el formato actual del Excel**.

## Fases

- [ ] **Fase A — Catálogo y base de datos.** `market_lists.sql` + semilla del catálogo (desde `anexos/lista-mercado-catalogo.json`)
  + `market_calendar` (desde `anexos/cronograma-pedidos-2026.md`) + columna `communities.participants`
  + precios (semilla; el repo es privado) + funciones de comunidad. *Aceptación:* un token de comunidad lee el catálogo sin
  precios, guarda borrador y envía; un token falso o de administradora se rechaza; las tablas están cerradas a `anon`.
- [ ] **Fase B — Formulario de la colaboradora.** Selector Kardex | Lista, pestañas, buscador, guardado automático,
  envío, avisos (toca/no toca, 5 pm). *Aceptación:* se llena y envía desde un celular de 360 px; al recargar el
  borrador sigue; sin red, avisa y reintenta como el kardex.
- [ ] **Fase C — Panel de la nutricionista.** Pestaña nueva, detalle con precios, tarde/a tiempo, marcar revisada,
  campanita. *Aceptación:* lo enviado aparece con total correcto (Carnes incluye la primera fila); reenviar vuelve a
  sumar a la campanita.
- [ ] **Fase D — Consolidado y Excel.** Suma por ítem entre comunidades, Excel consolidado y Excel por comunidad en
  el formato actual (4 hojas, con las no-toca en 0).
- [ ] **Fase E — Presupuesto (solo nutricionista).** Suma mensual de listas vs `327 600 × participantes`
  (alimentación) y `23 600 × participantes` (aseo); "SOBREJECUTADO" / "MARCO PRESUPUESTAL".
- [ ] **Futuro:** importar el Excel; mostrar el saldo del kardex junto a cada ítem (requiere vincular catálogos);
  pantalla para que la nutricionista actualice precios; calendario de entregas.

## Pruebas

- Unitarias (`tests/unit/`): totales con IVA y decimales, "toca / no toca" (quincenal, mensual), semana por defecto
  (lunes siguiente), rotulado de semana, hora límite (viernes 5 pm Bogotá), presupuesto.
- Integración (`tests/integration/market-lists.test.ts`, comunidades `ZZZ_TEST_…`): la comunidad nunca recibe
  precios, aislamiento entre comunidades, tokens cruzados rechazados, validaciones, reenvío, campanita.
- Manual (`tests/manual/checklist.md`): sección nueva para la lista de mercado y el panel.

## Despliegue

1. Correr `supabase/market_lists.sql` y la semilla (aditivo: no afecta a la app actual).
2. Merge a `main` y push con visto bueno de Lucho.
3. `npm run test:integration` y checklist manual; limpiar datos de prueba (ampliar `cleanup_test_data.sql`).

## Respuestas de Lucho (2026-09-30)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Participantes | Fijos por comunidad; solo cambian si llega o se va alguien. |
| 2 | Semanas de abarrotes | Resuelto con el cronograma de la foto (cada 14 días desde el 9 ene 2026). |
| 3 | Quién mantiene los precios | "No lo tengas en cuenta" → sin pantalla de precios; se cargan por SQL. |
| 4 | ¿Repo privado? | **Sí, es privado** → la semilla de precios sí puede ir en git. |
| 5 | Presupuesto (constantes, participantes) | "No lo tengas en cuenta": se dejan 327 600 y 23 600 por participante como **configurables** (`market_settings`), iguales para todas. La panadería **no** entra al marco. |
| 6 | ¿Reemplaza el correo? | Sí. |
| 7 | Hora límite / tardías | Viernes 5 pm; sí se marcan (ver decisión). |

## Pendientes por confirmar (menores; no bloquean la Fase A)

1. **Aseo:** se pide a mitad de mes (viernes 13–19) pero la leyenda dice entrega "1.ª semana del mes": ¿es la del mes siguiente?
2. **Viernes festivos** con pedido (3 abr, 1 may, 7 ago, 25 dic): ¿el plazo de las 5 pm sigue siendo ese viernes o se adelanta al jueves?
3. **Colores** pintados a mano en el cronograma: ¿qué significan? (no se usan en la app).
4. **Panadería:** la hoja dice "según negociación" y Lucho la describe como inmediata: ¿hay algo que la app deba registrar? (por ahora no).
5. **Presupuesto:** confirmar que los 327 600 / 23 600 son por participante **por mes** cuando la nutricionista los vaya a usar (fase E).

## Riesgos

- Son ~285 ítems en celular: el formulario debe ser ágil (buscador, pestañas, teclado numérico). Se valida con ellas.
- Ítems nuevos o renombrados por la organización: el catálogo vive en BD (`market_items`), se cambia por SQL.
- Dos números distintos de "semana" conviven (semana del kardex y semana de entrega); por eso la lista se clava a
  una fecha (lunes) y no a (mes, semana).
