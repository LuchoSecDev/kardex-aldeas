# 002 — Resumen semanal para el pedido a proveedores

**Estado:** ✅ Desplegado en producción (2026-09-30). Pendiente: cantidad sugerida a pedir (requiere la regla de la organización).
**Rama:** `feature/resumen-semanal`  **Fecha:** 2026-09-30

## Objetivo

La nutricionista arma el pedido a proveedores con lo que le reportan las comunidades. Hoy tendría
que abrir cada kardex y sumar a mano. Esta vista le da, para **una semana**, el total por producto
entre comunidades. Salió como "fase futura" del plan 001 y Lucho pidió implementarla.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Qué muestra | Por producto y semana: **saldo anterior, entradas, salidas (consumo) y saldo final**, sumados entre comunidades; el detalle por comunidad se despliega. | Son las cuatro cifras del kardex; con ellas ella decide. |
| Qué NO hace | **No calcula una cantidad a pedir.** | Depende de una regla que la organización no ha definido (stock objetivo, días de cobertura, mínimos por producto: hoy `min_stock` es 5 para todos). Ver "Pendientes". |
| De quién | Por defecto, solo las comunidades que **ya enviaron** esa semana (`week_submissions`); un interruptor incluye a todas las que tengan datos. Una línea indica qué comunidades entran y cuáles **faltan por enviar**. | Reutiliza el flujo "Enviar semana": lo enviado es lo que la nutricionista debe considerar; sin el aviso, un total incompleto parecería completo. |
| Semana modificada tras el envío | Se incluye con sus datos **actuales** (no con la foto). | La nutricionista siempre revisa los datos vivos; el aviso de "modificada" ya existe en la campanita y la tabla. |
| Filas | Solo productos con algún movimiento o saldo distinto de cero; en el **orden del catálogo** (el mismo del kardex). | Evita 240 filas vacías. |
| Redondeo | 2 decimales al sumar. | Hay medias unidades (0.5); la coma flotante da restos como 0.30000000000000004. |
| Excel | Dos hojas: **Resumen** (por producto) y **Detalle por comunidad** (por producto y comunidad), con las comunidades incluidas en el encabezado. | Se puede pasar a proveedores o trabajar en Excel. |
| Dónde | Pestaña "Resumen semanal" en el panel de la nutricionista (junto a "Comunidades"). Comparte selector de mes y año. | Mismo lugar, mismas herramientas. |

## Diseño

- **SQL** `supabase/admin_weekly_summary.sql` (aditivo, solo lectura):
  `admin_weekly_totals(token, año, mes, semana, solo_enviadas)` → una fila por (comunidad, producto) con
  `prev_balance`, `entries` y `exits` de esa semana (suma de los 7 días); exige token de administradora;
  valida rangos; omite filas todo en cero. La suma entre comunidades y el saldo final se calculan en la app
  (`src/lib/weeklySummary.ts`, funciones puras con pruebas).
- **UI** `AdminWeeklySummary.tsx`: selector de semana (Sem 1–5, con el rango de fechas), interruptor de
  solo-enviadas, buscador y filtro por categoría, tabla con encabezado fijo, detalle por comunidad
  desplegable, saldo negativo en rojo, y botón de Excel.
- **Excel** `src/lib/exporters/weeklySummaryExporter.ts`.

## Fases

- [x] **Única fase.** *(Verificada: 8 pruebas de integración con sesión de administradora, 59 unitarias con el contenido real del Excel, y en navegador con datos reales: semana 1 con 15 comunidades y 21 productos, detalle por comunidad, descarga del Excel, ancho de celular. Se corrigió en el camino: nombres largos sin espacios se salían de la tarjeta.)* SQL + lógica pura + componente + Excel + pruebas.
  *Aceptación:* con la semana 1 enviada por una comunidad, el resumen la incluye y suma bien; una semana no
  enviada no aparece salvo con el interruptor; el Excel descarga las dos hojas; los tokens falsos o de
  comunidad se rechazan.

## Pruebas

- Unitarias (`tests/unit/weeklySummary.test.ts`): suma, detalle, orden del catálogo, productos sin filas o
  desconocidos, medias unidades, saldos negativos, rango de fechas de la semana, semana por defecto.
- Integración (`tests/integration/admin-weekly-summary.test.ts`, opt-in): solo-enviadas, semana no enviada,
  todas las comunidades y suma correcta, suma solo de los 7 días de la semana, saldo heredado, rangos, tokens.
  **No modifica la cuenta** (solo inicia sesión): se corre con
  `$env:ADMIN_LOGIN_PASSWORD = "<contraseña vigente>"; npm run test:integration`. Es distinta de
  `admin-lifecycle.test.ts`, que cambia la contraseña y NO debe correrse sobre la cuenta ya entregada.
  Rechazo de token de comunidad en `week-submissions.test.ts` (siempre activa).
- Manual (`tests/manual/checklist.md`): ver sección del resumen semanal.

## Despliegue

1. Correr `supabase/admin_weekly_summary.sql` en Supabase (aditivo: no afecta a la app actual).
2. Merge a `main` y push (con visto bueno de Lucho).
3. `npm run test:integration` y el ciclo de administradora (opt-in) para las pruebas nuevas.

## Riesgos y pendientes

- **Cantidad sugerida a pedir:** falta que la organización defina la regla (p. ej. stock objetivo por
  producto o días de cobertura). Con `min_stock` fijo en 5 para todos los productos no habría un
  resultado útil. Cuando exista, se agrega una columna "Sugerido".
- **H1 (meses que no caben en 5 semanas):** el resumen usa las mismas 5 semanas del kardex, así que
  arrastra esa limitación hasta que se decida (ver `planes/README.md`).
- Las unidades de un mismo producto son las del catálogo (KG, BOLSA…); la vista **no convierte** unidades.
