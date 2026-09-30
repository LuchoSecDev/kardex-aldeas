# 004 — Semana 6 de cierre (meses que no caben en 5 semanas) · hallazgo H1

**Estado:** 🚧 En curso (2026-09-30). Próximo caso real: **lunes 30 de noviembre de 2026**.
**Rama:** `claude/dazzling-wozniak-gkxfkz` (continúa la del plan 003)  **Fecha:** 2026-09-30

## Objetivo

El kardex tiene 5 semanas (lunes a domingo). Un mes de 30/31 días que empieza en sábado o domingo pierde sus
últimos 1–2 días: **no se podían registrar**. En 2026: 30 y 31 de marzo, 31 de agosto y 30 de noviembre; en 2027:
31 de mayo y 30–31 de agosto.

## Cómo lo resuelven hoy en papel (Lucho, 2026-09-30)

Toman otra hoja, la tratan como un mes nuevo solo para esos días y llenan las casillas que faltan; el saldo con que
cierra esa hoja se copia a mano a la hoja del mes siguiente. Esa hoja **sigue siendo del mes que termina** (marzo).
La propuesta anterior ("semana compartida entre meses", que los movía a abril) **se descartó** por contradecir esa práctica.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Qué se agrega | Una **semana 6 parcial** del mismo mes, solo en los meses que la necesitan (hoy: 30/31 mar, 31 ago, 30 nov de 2026). | Es lo que hacen en papel, sin mezclar días entre meses. |
| Qué se puede editar en ella | **Solo los días que sobran** (con su propia casilla de **entrada**). Los demás días de esa semana (los del mes siguiente) quedan **deshabilitados**, igual que el resto de números que no corresponden. | Confirmado por Lucho: "solo se registran los días que sobran, con su propia entrada; el resto de números y de semanas deben quedar deshabilitadas". |
| Saldo anterior de la semana 6 | **Se calcula solo** desde el cierre de la semana 5 (en papel solo era copiar el número). La corrección con motivo (el lápiz) sigue igual que en las demás semanas. | Sin transcripción manual y sin perder la trazabilidad. |
| Mes siguiente | Hereda el saldo de cierre **después** de la semana 6 (hoy hereda el de la semana 5). | Es lo que hacen en papel. |
| Totales del mes | Los de marzo incluyen el 30 y 31. | Esos días son de marzo. |
| Formato de datos | Las filas nuevas guardan **42 salidas, 6 entradas y 6 saldos**. El servidor sigue aceptando **35/5/5** (filas y clientes anteriores); las filas viejas se leen rellenadas con ceros. | Nada se migra ni se rompe; el cambio es compatible hacia atrás. |
| Envío a la nutricionista | La semana 6 se puede **enviar** como cualquier otra (índice 5) y aparece en el resumen semanal, la campanita y el panel. | Es una semana más del mes. |
| Cuándo aparece | Solo en los meses que la necesitan: la botonera muestra "Sem 6" únicamente ahí. | Los demás meses no cambian en nada. |

## Diseño

- **`calendar.ts`**: `buildCalendarWeeks` devuelve 5 semanas, o 6 si sobran días; la 6.ª trae solo los días sobrantes
  (los demás huecos en `null`, que la tabla ya deshabilita). `WEEKS_MAX = 6`.
- **`balanceEngine.ts`**: el encadenado de saldos recorre 6 semanas; el saldo final del mes sale de la última semana
  guardada (índice 5 si la fila tiene 6 semanas, 4 si es una fila anterior).
- **`monthState.ts` / `KardexDashboard`**: los arreglos se rellenan a 42/6/6 al leer; se guardan siempre completos.
- **Pantalla**: botonera con "Sem 6" cuando hace falta, con su encabezado "Cierre del mes"; si se cambia a un mes con
  menos semanas, vuelve a la semana 1.
- **Excel y PDF**: una semana más (columnas) solo cuando el mes la tiene.
- **Resumen semanal y panel**: selector y chips con 6 semanas cuando aplica (`admin_communities_overview` devuelve 6 banderas).
- **SQL** (`supabase/six_weeks_N.sql`, archivos chicos): amplía los CHECK de `ajustes` y `week_submissions`
  (0–4 → 0–5) y reemplaza `kardex_save_product`, `kardex_insert_ajuste`, `kardex_submit_week`,
  `admin_communities_overview` y `admin_weekly_totals` para aceptar la semana 6. `_week_snapshot` y `_week_has_activity`
  ya eran genéricos.

## Fases

- [ ] **Fase 1 — Lógica y pantalla** (calendario, saldos, tabla, navegación, exportadores, resumen). *Aceptación:* marzo 2026
  muestra "Sem 6" con solo el 30 y 31 editables; el saldo de abril hereda el cierre de esa semana; los meses que caben no cambian.
- [ ] **Fase 2 — Base de datos** (`six_weeks_1..N.sql`) y sus pruebas (Postgres local + integración). *Aceptación:* se guarda,
  ajusta y envía la semana 6; 35/5/5 sigue aceptado; semanas fuera de 0–5 se rechazan.
- [ ] **Fase 3 — Verificación en navegador** y cierre de la prueba `it.fails` de `calendar.test.ts`.

## Despliegue

**Orden obligatorio:** 1) correr los SQL `six_weeks_N.sql` (aceptan los dos formatos; no rompen la app actual) → 2) desplegar la
app (push a `main`). Si se desplegara la app primero, sus guardados de 42/6/6 serían rechazados por el servidor anterior.
Reversa: revertir el merge; las filas guardadas con 42/6/6 siguen siendo válidas para el servidor nuevo.

## Riesgos y pendientes

- Una sesión abierta con la versión anterior de la app que guarde un mes con datos de la semana 6 lo truncaría a 35 días
  (solo durante la ventana del despliegue, y solo en los 3 meses afectados).
- Los meses afectados hasta 2027 están en la tabla de arriba; la lógica es general (no hay lista fija).
