# 013 — Corregir un mes anterior en una ventana aislada («Guardar corrección»)

**Estado:** 📝 Propuesta del 2026-10-03, con la idea de Lucho (ventana emergente aislada para corregir y botón «Guardar corrección» al terminar). **Depende del plan 012** (control de versión) y necesita sus decisiones abajo. Nada de SQL se corre en Supabase sin su OK.
**Rama:** `feature/correccion-de-meses` (cuando se programe)  **Origen:** hallazgo H3 de [`README.md`](README.md)

## El problema (H3, VERIFICADO leyendo el SQL y el código)

Cada mes guarda, por producto, un saldo anterior por semana (`prev_balances`) que **se calcula a partir del cierre del mes anterior**. Hoy cada tecla se guarda sola, mes por mes. Si alguien corrige una cifra de **marzo** después de que **abril** ya tiene datos:

- marzo queda bien, pero el saldo anterior **guardado** de abril sigue siendo el viejo;
- la pantalla y el Excel de abril lo recalculan al abrir y se ven bien, pero **el resumen para proveedores (`admin_weekly_totals`) y la «foto» de la semana enviada leen lo guardado**, así que la nutricionista podría ver un saldo de abril que no cuadra;
- es el error de papel clásico: se corrige la hoja vieja y no se arrastra el cambio a las siguientes.

Con el cambio libre y automático de hoy nadie se entera. Que ocurra en la práctica es INFERIDO (depende de si las colaboradoras corrigen meses pasados); el defecto del guardado es verificado.

## La propuesta

**Los meses anteriores se corrigen en una ventana aparte, con un borrador, y se guardan de una sola vez junto con sus meses siguientes.**

1. En un mes **anterior** al vigente, la tabla se ve pero **no se edita directamente**; arriba aparece «Mes cerrado» y un botón **«Corregir este mes»** por producto (o el lápiz de la fila).
2. Se abre una ventana aislada con **un producto** y sus datos de ese mes **y de todos los meses siguientes que ya tengan datos**. Lo que se escriba es un **borrador**: no se guarda nada mientras tanto.
3. A medida que se escribe, la ventana recalcula en vivo y muestra, mes por mes, **antes → después** del saldo anterior, entradas, salidas y saldo final, resaltando lo que cambia. Avisa si alguna semana ya enviada a la nutricionista quedará «modificada».
4. El botón **«Guardar corrección»** está desactivado hasta que haya al menos un cambio válido (sin negativos, valores como en el kardex normal) y un **motivo** escrito. Al pulsarlo pide confirmación con el resumen.
5. El guardado es **atómico** (todo o nada) y usa el control de versión del plan 012: si otra persona cambió algo de esos meses mientras tanto, no se guarda nada, se avisa y se recarga.
6. Queda un **registro de auditoría** (quién —la comunidad—, cuándo, producto, meses tocados, valores anteriores y nuevos, motivo), como ya ocurre con los ajustes de saldo.

Así el borrador evita estados intermedios a medias (hoy cada tecla viaja sola) y el arrastre a los meses siguientes ocurre por una **acción deliberada y visible**.

## Diseño técnico

- **El cálculo del encadenado sigue en un solo lugar:** `computeCascade` / `finalBalanceOfMonth` de `balanceEngine.ts` (que ya respetan los ajustes auditados). La ventana lo usa mes por mes en el borrador y manda al servidor las filas ya calculadas. **No se duplica la lógica en SQL** (dos implementaciones que se desfasan serían otro riesgo); el servidor valida y guarda.
- **SQL nuevo (a diseñar con tu OK):**
  - lectura: `kardex_product_history(token, producto, desde_año, desde_mes)` → filas del producto desde ese mes hasta el último mes con datos, con sus ajustes vigentes;
  - escritura atómica: `kardex_save_months(token, producto, motivo, filas jsonb)`: cada fila lleva año, mes, arreglos y la `updated_at` esperada; se bloquean las filas, se comparan versiones (`CONFLICTO_VERSION` revierte todo), se guardan y se escribe la auditoría en una tabla cerrada `kardex_corrections`; devuelve las versiones nuevas;
  - mismas validaciones de tamaño y valores que `kardex_save_product`; tope de meses por llamada.
- **Cliente:** hook `useMonthCorrection`, componente `MonthCorrectionModal` (con el estilo de las demás ventanas: foco, Esc, teclado), reutiliza `ConfirmDialog` para la confirmación y `ConflictDialog` para el conflicto.

## Decisiones por confirmar (propuesta marcada con ★)

| # | Tema | Opciones |
|---|---|---|
| D1 | Qué es «mes anterior» | ★ Los meses anteriores al mes calendario actual, **con 5 días de gracia** (hasta el día 5 el mes pasado sigue editable normal, porque a veces se registran los últimos días el 1.º). Alternativas: sin gracia; o solo los meses que ya tienen un mes siguiente con datos. |
| D2 | Motivo | ★ Obligatorio (igual que en los ajustes de saldo). |
| D3 | Alcance de la ventana | ★ Un producto a la vez (todos sus meses afectados). Varios productos juntos queda para después. |
| D4 | Quién ve la auditoría | ★ Solo se guarda por ahora; luego, una pestaña en `/admin` y en `/dev`. |
| D5 | Edición directa de meses anteriores | ★ Se bloquea y se usa la ventana. Alternativa: se deja editable pero con aviso (no resuelve H3). |

## Fases (cada una rama y aprobación de push aparte)

- [ ] **Fase 1 — SQL y pruebas:** `kardex_product_history`, `kardex_save_months`, `kardex_corrections` (tabla cerrada), con pruebas SQL y mutaciones (atomicidad, conflicto que revierte todo, auditoría, aislamiento entre comunidades, tope, validaciones). Lucho corre el SQL antes de desplegar.
- [ ] **Fase 2 — Ventana y cálculo del borrador:** `useMonthCorrection`, `MonthCorrectionModal`, vista antes → después, botón deshabilitado hasta que haya cambio válido y motivo, bloqueo de la edición directa (D1/D5). Pruebas unitarias con los mismos vectores de `balanceEngine.test.ts`.
- [ ] **Fase 3 — Integración y producción:** prueba de integración con comunidad `ZZZ_TEST_`, checklist manual (corregir marzo con abril y mayo con datos y comprobar el resumen semanal), despliegue SQL primero.
- [ ] **Fase 4 (opcional):** lectura de la auditoría en `/admin`; varios productos a la vez.

## Riesgos

- **Hábito de las colaboradoras:** hoy corrigen en la misma tabla; hay que explicarles la ventana (y la gracia de 5 días evita estorbar el cierre normal del mes).
- **Saldos con ajustes auditados en meses siguientes:** el encadenado se corta en cada ajuste (`computeCascade`); la vista antes → después lo muestra para que se entienda por qué un mes no cambia.
- **Datos ya inconsistentes en producción** (por correcciones pasadas): este plan evita los nuevos, no repara los viejos. Una consulta de diagnóstico de solo lectura (saldo anterior guardado ≠ cierre del mes previo) diría cuántos hay antes de decidir si hace falta un script de reparación (zona de aprobación).
- **Dos personas a la vez:** cubierto por el control de versión del plan 012.

## Fuera de alcance

Corregir ajustes ya registrados, borrar meses, y correcciones de varias comunidades (la nutricionista sigue en solo lectura).
