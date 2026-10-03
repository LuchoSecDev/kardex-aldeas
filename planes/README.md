# Planes de cambios y features

Cada cambio importante (feature nueva, cambio de seguridad, refactor) tiene aquí **un plan**
antes de programarse y se mantiene actualizado hasta que se despliega. Sirve para:

- Saber **qué se decidió y por qué** (sobre todo cuando la decisión no es obvia en el código).
- Saber **en qué estado está** cada cosa y qué falta para desplegarla.
- Encontrar rápido **qué tocó cada cambio** (archivos, SQL, pruebas) si algo falla más adelante.

## Índice

| # | Plan | Estado | Commits / notas |
|---|---|---|---|
| 001 | [Panel de la nutricionista](001-panel-nutricionista.md) | ✅ **Desplegado en producción el 2026-09-30** (merge a `main` + push, `b3e60df`). Falta: entregar la cuenta a la nutricionista (reset con la contraseña temporal real) y limpiar datos de prueba | `cfc3d80` (A) · `fc6934c` (B) · `53e474d` (C) · `5b3eaa7` acceso administrativo · `dee3ef1` campanita · `8e49fd2`/`b3e60df` ajustes de scroll |
| 002 | [Resumen semanal para el pedido a proveedores](002-resumen-semanal.md) | ✅ Desplegado en producción el 2026-09-30. Pendiente de diseño: cantidad sugerida a pedir (falta la regla de la organización) | ver `git log` (rama `feature/resumen-semanal`) |
| 003 | [Lista de mercado](003-lista-de-mercado.md) | ✅ **Desplegada** (Fases A–D en `main`; SQL aplicado, pruebas de integración en verde el 2026-10-01). **Sin precios ni presupuesto.** Pendiente: probarla en celulares reales | `e73c09c` … `4b907cf` |
| 004 | [Semana 6 de cierre (hallazgo H1)](004-semana-6-fin-de-mes.md) | ✅ **Desplegada** (`six_weeks_1..5.sql` corridos en Supabase, confirmado el 2026-10-01). Próximo caso real: lunes 30 nov 2026 | `57318b5` · `5b2618a` |
| 005 | [Comunidades fijas (cierre de la creación libre)](005-comunidades-fijas.md) | ✅ **Desplegada el 2026-10-01** (SQL aplicado y pruebas de integración en verde) | `4bb3956` |
| 006 | [Cambiar PIN](006-cambiar-pin.md) | ✅ **Desplegada el 2026-10-01** (`change_pin.sql` corrido, pruebas en verde) | `fcd1591` |
| 007 | [Panel del desarrollador `/dev` (errores, alertas, diagnóstico)](007-panel-dev.md) | 🚧 **Fase A (registro de errores y alertas por correo y Telegram) y Fase B1 (pantalla `/dev` con los problemas explicados) en `main` desde el 2026-10-03**; SQL corrido en Supabase y pruebas de integración en verde. Falta: B2 (estado de comunidades y acciones remotas), B3 (copias de seguridad, sin decidir) y la Fase C | `c2c764e` … `97f97ca` |
| 008 | [Zona de cambios en la lista de mercado (notas del pedido, con respuesta de la nutricionista y campanita para las comunidades)](008-zona-de-cambios.md) | ✅ **Desplegada** (Fases A–D en `main`; SQL aplicado y pruebas de integración en verde el 2026-10-02) | `7c878f8` … `9147a9c` |
| 009 | [Avisos de confirmación («toasts»)](009-avisos-de-confirmacion.md) | ✅ **Desplegada** (`9990ea4`, 2026-10-02) | `9990ea4` |
| 010 | [Sitio estático y migración a Cloudflare Pages](010-hosting-estatico-cloudflare.md) | 🚧 Sitio estático y `_headers` en `main` (`4e76947`); falta que Lucho cree el proyecto en Cloudflare (pasos en el plan) antes del primer cobro | `4e76947` |
| 011 | [Minuta patrón: cumplimiento de gramajes, pedido sugerido y «Salida de hoy»](011-minuta-patron.md) | 📝 Borrador v2 (2026-10-02), **feature futura**: Lucho prefiere no complicar por ahora el trabajo de las «tías». Con los tres documentos del ICBF y sus respuestas; al reactivarlo falta completar los documentos y cerrar D4, D11 y D12. Función nueva, fuera de la suscripción | — |
| — | Historial anterior a esta carpeta (ver abajo) | ✅ Desplegado | — |

### Historial anterior (antes de existir `planes/`)

| Cambio | Estado | Commits |
|---|---|---|
| Refactor interno en 5 fases (servicio, hooks, subcomponentes, CSS, catálogo en BD) | ✅ Desplegado | `79eef63` `4ed4fdd` `e75cfb6` `03c682f` — plan original en `../plan_refactorizacion.md` |
| Catálogo de 240 productos en 5 categorías | ✅ Desplegado | `54c1616` `ee894ed` |
| PIN de 4 dígitos por comunidad | ✅ Desplegado | `c867f31` — `supabase/community_pin.sql` |
| Límite de intentos del PIN (5 fallos = 15 min) | ✅ Desplegado | `e720dd0` — `supabase/pin_rate_limit.sql` |
| Acceso a datos por token de sesión (el PIN protege los datos) | ✅ Desplegado | `2fe3945` — `supabase/session_access.sql`, `lock_down_direct_access.sql` |
| Indicador de guardado, reintentos y cola ordenada | ✅ Desplegado | `670bc8d` — `src/hooks/useSaveQueue.ts` |

La propuesta original del proyecto está en `../propuesta_kardex.md` (fuera del repositorio).

## Hallazgos abiertos

Problemas encontrados que todavía no se corrigen (con su prueba marcada como falla conocida):

| # | Hallazgo | Estado | Prueba |
|---|---|---|---|
| H1 | **Meses que no caben en 5 semanas** | ✅ **Resuelto y desplegado** (plan 004; SQL aplicado) | `tests/unit/calendar.test.ts` (ya no es `it.fails`) |
| H2 | **Dos equipos de la misma comunidad pueden pisarse: el último guardado gana** | ⚠️ **Abierto** (encontrado el 2026-10-03; sin cambios, requiere SQL y tu aprobación) | — |

**H1 — detalle.** El kardex tiene 5 semanas (lunes a domingo). Un mes de 30/31 días que empieza en sábado o domingo pierde sus últimos 1–2 días: **no se pueden registrar**. En 2026: 30 y 31 de marzo, 31 de agosto y 30 de noviembre; en 2027: 31 de mayo y 30–31 de agosto.

**Cómo lo resuelven hoy en papel (aclarado por Lucho el 2026-09-30).** Toman **otra hoja** y la tratan como un mes nuevo solo para esos días: en la semana 1 llenan las casillas que faltan (p. ej. lunes 30 y martes 31 de marzo) y dejan el saldo final al final de esa hoja. **Esa hoja sigue siendo de marzo** (queda cerrada como parte de marzo y no se reutiliza), y para abril hay que abrir **otra hoja aparte**, que arranca con el saldo con que cerró esa hoja.

**La propuesta anterior ("semana compartida entre meses", que ponía esos días en la semana 1 del mes siguiente) queda DESCARTADA**: contradice la práctica (los días deben quedar en marzo y abril no debe heredar esas salidas como suyas).

**Propuesta nueva (por confirmar): "semana 6 parcial" del mismo mes.**
- Los meses que no caben muestran una **6.ª semana** con solo los 1–2 días sobrantes (con su propia casilla de entrada y su saldo), que hereda el saldo de la semana 5.
- El mes siguiente hereda el saldo final **después** de esa semana 6 (hoy hereda el de la semana 5, ver `finalBalanceOfMonth`).
- Los totales de marzo incluyen el 30 y 31 (como en papel); el Excel/PDF muestran una hoja/bloque extra solo cuando aplica.
- **Impacto técnico (no es solo pantalla):** hoy `kardex_save_product` valida arreglos de 35 salidas / 5 entradas / 5 saldos, y `week_submissions`, `ajustes` y `admin_weekly_totals` limitan la semana a 0–4. Habría que aceptar 35 **o** 42 (los registros viejos de 35 siguen válidos, se leen rellenados con ceros), ampliar esos límites, `calendar.ts`, `monthState.ts`, `balanceEngine.ts`, los exportadores y el resumen semanal. Es un plan propio (004) con su SQL y pruebas (`calendar.test.ts` hoy tiene el `it.fails` de esta falla).
- **Precisiones de Lucho (2026-09-30):** (1) el saldo anterior de la semana 6 **no se edita a mano**: solo es copiar el número de cierre de la semana 5, así que se calcula solo (la corrección con motivo sigue igual que en las demás semanas); (2) como en esa hoja extra **solo se puede terminar de completar esa semana**, en ella las demás semanas deben verse **deshabilitadas**, y también los **números (casillas) de los días que no son los sobrantes**. Alcance exacto por afinar al programar el plan 004.
- **Falta confirmar:** (a) que en esa hoja extra solo se registran los días sobrantes, con su propia entrada de la semana; (b) próximo caso: **lunes 30 de noviembre de 2026**.
- La **lista de mercado (plan 003) no depende de H1**: se clava a la fecha (lunes de la semana de entrega), no a (mes, semana 0–4).

## Cómo se usa esta carpeta

1. **Antes de programar**, crear `NNN-nombre.md` con la plantilla de abajo y agregarlo al índice.
2. Trabajar en una **rama** (`feature/...`), no directamente en `main` (que despliega solo a producción).
3. Al terminar cada fase: marcar sus casillas, anotar el commit y correr las pruebas de [`../tests/`](../tests/README.md).
4. Al desplegar: pasar el estado a ✅ y anotar el orden real en que se corrió el SQL.
5. Si en el camino cambia una decisión, **se corrige el plan** (y se anota por qué en "Decisiones").

## Plantilla

```markdown
# NNN — Título

**Estado:** 📝 Propuesta | 🚧 En curso | ✅ Desplegado | ❌ Descartado
**Rama:** feature/...  **Fecha:** AAAA-MM-DD

## Objetivo
Qué problema resuelve y para quién (1–3 frases).

## Decisiones
Qué se decidió y por qué; alternativas descartadas.

## Diseño
Base de datos (tablas, funciones), pantallas, seguridad.

## Fases
- [ ] Fase A — … (criterio de aceptación)
- [ ] Fase B — …

## Pruebas
Automáticas que se agregan y puntos del checklist manual que cambian.

## Despliegue
Orden exacto: qué SQL corre, cuándo se hace push, cómo se revierte.

## Riesgos y pendientes
```

**H2 — detalle (VERIFICADO leyendo `supabase/session_access.sql`, `kardex_save_product`).** Cada guardado reescribe la fila COMPLETA del producto (`on conflict … do update` de salidas, entradas y saldos anteriores) sin comprobar qué versión tenía quien guarda. Si dos computadores de la misma comunidad (comparten PIN) tienen abierto el mismo mes y editan el mismo producto, o si uno de ellos se reconecta con cambios viejos, **el último en guardar borra lo del otro sin avisar**: es el equivalente digital de dos personas escribiendo sobre la misma hoja de papel. Es un riesgo que ya existía; la recuperación automática tras un corte de internet (2026-10-03) lo hace algo más probable porque un guardado pendiente puede esperar más tiempo. **Mitigación propuesta (no hecha):** control de versión optimista: `kardex_save_product` recibe la `updated_at` que el cliente leyó y rechaza el guardado (`CONFLICTO_VERSION`) si la fila cambió; la pantalla avisa, recarga ese producto y deja elegir. Toca SQL de producción y el flujo de guardado: hay que diseñarlo y probarlo (SQL con mutaciones, integración y manual) antes de desplegar. Mientras tanto, la práctica segura es **un solo computador por comunidad a la vez**.
