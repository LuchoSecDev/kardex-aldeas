# 008 — Zona de cambios en la lista de mercado (notas del pedido)

**Estado:** 📝 Propuesta con las decisiones **confirmadas por Lucho el 2026-10-01** (nota con producto opcional, 20 por lista, la nutricionista responde y la comunidad recibe campanita). Falta programarla.
**Rama:** `feature/zona-de-cambios` (cuando se programe)  **Fecha:** 2026-10-01

## Objetivo

Hoy la lista de mercado solo lleva cantidades. Cuando una comunidad necesita pedir **un cambio** (p. ej. «pescado por
pechuga» en el pedido de carnes), en el Excel lo dejaba como una **nota en la celda**; en la app no tiene dónde. Este plan agrega
una **zona de cambios** a cada lista, que viaja con el pedido y que la nutricionista ve junto a lo pedido.

## Decisiones (confirmadas)

| Tema | Propuesta | Por qué |
|---|---|---|
| Qué es una nota | Una **entrada de la zona de cambios** de un tipo de lista (carnes, fruver y lácteos, abarrotes, aseo): texto libre de hasta 200 caracteres y, **opcionalmente, un producto** del catálogo al que se refiere. | Cubre las dos formas: «nota en una celda» (con producto) y un cambio general (sin producto). |
| Dónde se escribe | En cada pestaña de la lista, un bloque «Cambios del pedido» con «Agregar cambio». En cada producto, un ícono 📝 que abre una nota rápida de ese producto. | Rápido desde el celular, sin salir de la lista. |
| Límites | Máx. **20 notas por lista** (por tipo de lista y semana, en total, repartidas entre todos los productos; no 20 por producto) y 200 caracteres cada una. El tope es una constante fácil de cambiar. | Es una nota, no un chat; evita abusos. |
| Se guarda y se envía como la lista | Mismo guardado automático y mismo botón «Enviar lista de la semana». Se guarda la copia de trabajo y la **enviada**, igual que las cantidades. Editar o agregar una nota **después de enviar** marca la lista como «modificada». | Coherente con lo que ya hace la lista (`quantities` / `sent_quantities`). |
| Qué ve la nutricionista | En el detalle de cada lista, un bloque destacado «Cambios solicitados» (con el producto cuando lo tiene); un indicador en la tabla de la semana cuando una lista trae cambios. | Que no se le pase un cambio importante. |
| Excel | Nota real de celda (`cell.note`) en la fila del producto **y** una hoja «Cambios» con todos los cambios de la comunidad. El consolidado lista los cambios por comunidad. | Igual que el Excel original, y a la vista sin abrir cada celda. |
| Respuesta de la nutricionista | **Sí** (cambio de la propuesta inicial): a cada nota enviada puede responder con un texto de hasta 200 caracteres (p. ej. «Se envía pechuga, no hay pescado»). Una respuesta por nota (puede editarla); la comunidad **no** contesta de vuelta (si necesita algo más, agrega otra nota). | Cierra el ciclo sin convertirlo en un chat. |
| Campanita de la comunidad | **Nueva**: la comunidad ve una campanita en la barra azul (igual que la de la nutricionista) con las respuestas nuevas; al abrirla ve «Carnes · semana del 28 sep: pescado por pechuga → Se envía pechuga» y al tocarla va a esa lista; al verla se marca como leída. Se actualiza por consulta periódica (como la campanita de la nutricionista). | Que la comunidad se entere de la respuesta antes del pedido sin tener que revisar cada lista. |

## Diseño

- **Respuestas** (Fase D): tabla aparte `market_change_replies` (lista, id de la nota, texto, fecha, `seen_at`), porque el guardado automático de la comunidad reemplaza todo el arreglo de notas y borraría una respuesta guardada dentro de él. Funciones: `admin_market_reply` (nutricionista), `market_replies_unseen` y `market_replies_mark_seen` (comunidad, por token). `market_list_load` devuelve las respuestas de cada nota. Sin acceso `anon` a la tabla.
- **Base de datos** (aditivo, archivos chicos `market_changes_N.sql`): `market_lists.changes jsonb not null default '[]'` y `sent_changes jsonb`; cada entrada `{id, item_id|null, text, at}`. `market_list_save_changes(token, week_start, kind, changes)` (valida: ≤ 20, texto 1–200 sin saltos de línea, `item_id` existente y del mismo tipo). `market_list_submit` copia `changes` a `sent_changes`. `admin_market_list` y `admin_market_overview` devuelven los cambios enviados y un conteo; el cálculo de «modificada» incluye los cambios. Sin acceso `anon` a las tablas.
- **App:** `hooks/useMarketList` guarda los cambios con la misma cola que las cantidades; `components/market/MarketChanges` (bloque por pestaña) y el ícono en `MarketItemsPanel`; en el panel de la nutricionista, bloque en `AdminMarketLists` y columna/indicador; `marketExporter` con notas de celda y hoja «Cambios».
- **Seguridad:** igual que el resto de la lista (token de comunidad; el texto se muestra como texto, nunca como HTML).

## Fases

- [x] **Fase A — Base de datos y pruebas.** *(Hecha el 2026-10-01: `supabase/market_changes_1..6.sql` (columnas `changes`/`sent_changes` con tope de 20 por tabla, `market_list_save_changes` y `market_list_load`, `market_list_submit`, `admin_market_overview` y `admin_market_list` actualizadas), `tests/db/market_changes.test.sql` con 15 mutaciones comprobadas, y `tests/integration/market-changes.test.ts`. **Falta correr los 6 SQL en Supabase** y `npm run test:integration`.)*
- [x] **Fase B — Formulario de la comunidad.** *(Hecha el 2026-10-01: `MarketChanges` (bloque «Cambios del pedido» por tipo, con producto opcional, editar, quitar, contador y tope de 20), el 📝 por producto en `MarketItemsPanel`, `useMarketList` (las notas se guardan solas con la misma cola y se vacían antes de cambiar de semana o enviar), `lib/marketList.ts` (límites y limpieza iguales a los del servidor), confirmación y resumen de envío con los cambios. Una nota ligada a un producto que ya no está activo se guarda sin el vínculo. Probada con `unit/marketChangesZone.test.tsx` (22 pruebas, 8 mutaciones comprobadas) y en el navegador (escritorio y 360 px, con el guardado simulado).)*
- [x] **Fase C — Panel de la nutricionista y Excel.** *(Hecha el 2026-10-01: en el detalle de cada comunidad, bloque «📝 Cambios solicitados» por tipo y aviso arriba; en la tabla de la semana, «📝 n cambios»; en el consolidado, bloque agrupado por comunidad (se piden solo los detalles de las comunidades que enviaron notas, sin SQL nuevo) y el Excel se bloquea si no cargaron; Excel por comunidad con nota de celda en el producto y hoja «CAMBIOS»; Excel consolidado con hoja «Cambios». Probada con `unit/adminMarketChanges.test.tsx` y `unit/marketChangesExport.test.ts` (incluye abrir el .xlsx real y comprobar que las notas sobreviven; 10 mutaciones comprobadas).)*
- [ ] **Fase D — Respuestas y campanita de la comunidad** (campo de respuesta en el panel de la nutricionista, campanita nueva en la barra de la comunidad con consulta periódica, respuesta visible junto a cada nota, marcar como leída). *Aceptación:* la nutricionista responde y la comunidad ve la campanita con la respuesta; al abrirla se marca leída y no vuelve a sumar.

## Pruebas

SQL: límites (21.ª nota rechazada), aislamiento entre comunidades (una comunidad no ve respuestas de otra), solo la nutricionista responde, respuesta a una nota inexistente, marcar leída, tipo/ítem inválido, envío copia los cambios, «modificada» al editar después de enviar. Unitarias: pantalla de la lista y exportador (se abre el Excel real y se comprueban las notas y la hoja). Manual: celular de 360 px.

## Despliegue

SQL aditivo primero (`market_changes_N.sql`), luego la app. La app anterior sigue funcionando (ignora las columnas nuevas).

## Riesgos y pendientes

- Una nota ligada a un producto que luego se **desactiva** se sigue leyendo, pero al reguardar la lista falla con «Producto inválido» (igual que las cantidades): la pantalla (Fase B) debe quitar la referencia al producto.

- Un cambio escrito pero no enviado no llega a la nutricionista: el resumen «lo que voy a pedir» debe mostrar también los cambios para que se vean antes de enviar.
- Las notas son texto libre: se pide no escribir nombres de personas (igual que el motivo de un ajuste).
