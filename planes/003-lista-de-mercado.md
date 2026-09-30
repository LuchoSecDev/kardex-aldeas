# 003 — Lista de mercado (pedido semanal de cada comunidad)

**Estado:** 📝 Propuesta (plan aprobado en lo general por Lucho el 2026-09-30; faltan las decisiones de "Pendientes por confirmar" antes de programar)
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

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Formulario o Excel | **Formulario en la app.** Importar el Excel queda como mejora futura. | Respuesta de Lucho (preg. 1). |
| Precios | **Solo la nutricionista los ve.** Las colaboradoras nunca los reciben (la función que usa la comunidad no los devuelve). Totales en pesos solo en el panel. | Hoy ya están ocultos para ellas (preg. 2). |
| Hoja RESUMEN (presupuesto) | **Entra ahora**, solo en el panel de la nutricionista (fase E). | Preg. 3. |
| Aseo | Se incluye. | Preg. 5. |
| Panadería | **No se incluye** en la lista (se sigue controlando solo en el kardex). | No se envía, es compra inmediata. |
| Catálogo | Tabla **propia** `market_items`, no se reutiliza `products` del kardex. | Los nombres y unidades difieren (Excel: "Porcion"; kardex: "PAQUETE"), hay ítems que solo existen en uno (envueltos, arepas, recorte de charcutería) y el Excel trae IVA. Un vínculo opcional al producto del kardex queda para la mejora de "saldo al lado". |
| Precios en BD | Tabla aparte `market_item_prices` (sin acceso `anon`, solo la leen funciones `admin_*`), con `unit_price` **sin IVA** y `iva_rate` (0 o 0.19). | Que un error de permisos en el catálogo no filtre precios. |
| Clave de la lista | **Lunes de la semana de entrega** (`week_start date`), no (mes, semana 0–4). | Evita la ambigüedad de las 5 semanas (la misma semana es "5 de septiembre" y "1 de octubre") y **no depende de H1**. La pantalla la rotula "Semana 1 de octubre · 28 sep – 4 oct". |
| Semana por defecto | La **semana siguiente** (el lunes que viene): el viernes se pide para la semana que sigue. Se puede cambiar. | Así funciona el ritual de los viernes. |
| Envío | **Un solo botón "Enviar lista de la semana"** que envía las 4 listas juntas (las vacías van como "no pedí"), como el libro de Excel. Reenviar se permite (sube contador, vuelve a "sin revisar"). | Mismo hábito actual: un envío, todo el libro. |
| Qué toca cada semana | Fruver y Carnes: siempre. Abarrotes: quincenal. Aseo: primera semana del mes. La app **marca** "Esta semana toca / no toca" pero **no bloquea** (se puede pedir igual). | Las reglas reales tienen excepciones (eventos); bloquear sería un estorbo. |
| Hora límite | Aviso visible "Envía a más tardar el viernes a las 5:00 pm". La nutricionista ve si una lista llegó **tarde** (después del viernes 5 pm, hora de Bogotá). No bloquea. | Informativo. |
| Participantes | Campo por lista, **se precarga con el último valor** y se puede editar cada semana. | Varía (en el archivo: 11, 11, vacío y 9). *Por confirmar.* |
| Borrador | Se guarda solo mientras se digita (igual que el kardex), para retomar desde otro celular. | Son ~285 ítems; perderlos sería costoso. |
| Campanita | Las listas enviadas y sin revisar suman a la campanita junto con las semanas del kardex (con etiqueta "Lista de mercado"). | Un solo aviso para la nutricionista. |
| Seguridad | Mismo patrón del proyecto: tablas con RLS y `revoke all` a `anon`; funciones `security definer` que validan token; las de comunidad usan el token de comunidad y las de nutricionista el de administradora, sin cruzarse. | Ver plan 001. |

## Diseño

### Base de datos (SQL aditivo; archivo nuevo `supabase/market_lists.sql`)

- `market_items` — `id`, `kind` (`fruver` | `carnes` | `abarrotes` | `aseo`), `name`, `unit`, `is_event`,
  `sort_order`, `is_active`. Lectura `anon` solo de activos (mismo patrón que `products`), sin precios.
- `market_item_prices` — `item_id`, `unit_price`, `iva_rate`, `updated_at`. Sin acceso `anon`.
- `market_lists` — una fila por (`community`, `week_start`, `kind`): `quantities jsonb` (`{item_id: cantidad}` solo
  no ceros), `participants int`, `status` (`borrador` | `enviada`), `submitted_at`, `submit_count`, `reviewed_at`.
  Único por (comunidad, semana, tipo). Cantidades ≥ 0 con decimales (hay 0.25, 0.5…).
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
  + precios (semilla privada) + funciones de comunidad. *Aceptación:* un token de comunidad lee el catálogo sin
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

## Pendientes por confirmar con la organización

1. **Participantes:** ¿se escribe cada semana (con el último valor precargado), o es fijo por comunidad?
2. **Abarrotes quincenal:** ¿en qué semanas del mes (1.ª y 3.ª, 2.ª y 4.ª…)? El archivo trae "Semana 3" como la última.
3. **Precios:** ¿quién los mantiene? Fruver y Abarrotes están en 0 en el archivo: ¿la nutricionista los tiene?
   ¿Se actualizan por SQL (Lucho) o se construye una pantalla (fase futura)?
4. **Visibilidad del repositorio:** los precios de Carnes y Aseo son datos comerciales; antes de commitear una
   semilla con precios confirmar que el repo es privado, o cargarlos solo por SQL Editor sin guardarlos en git.
5. **Presupuesto:** ¿los 327 600 y 23 600 son **por participante por mes**, iguales para todas las comunidades?
   ¿Cómo se promedian los participantes del mes? ¿La panadería cuenta dentro del marco?
6. **El correo:** ¿el envío en la app **reemplaza** el correo de los viernes, o la colaboradora sigue mandando el
   Excel? (Si hay que seguir enviándolo, la fase D lo genera con un clic.)
7. **Hora límite:** confirmar que es el viernes a las 5 pm (Bogotá) y si importa marcar las tardías.

## Riesgos

- Son ~285 ítems en celular: el formulario debe ser ágil (buscador, pestañas, teclado numérico). Se valida con ellas.
- Ítems nuevos o renombrados por la organización: el catálogo vive en BD (`market_items`), se cambia por SQL.
- Dos números distintos de "semana" conviven (semana del kardex y semana de entrega); por eso la lista se clava a
  una fecha (lunes) y no a (mes, semana).
