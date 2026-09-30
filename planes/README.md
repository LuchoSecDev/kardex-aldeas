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
| 003 | [Lista de mercado](003-lista-de-mercado.md) | 🚧 En curso: Fase A lista en código y probada en local (falta correr el SQL en Supabase); **sin precios ni presupuesto** | — |
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
| H1 | **Meses que no caben en 5 semanas** | ⚠️ **PENDIENTE (importante)** — práctica en papel aclarada; propuesta "semana 6 parcial" por confirmar (ver detalle) | `tests/unit/calendar.test.ts` (`it.fails`) |

**H1 — detalle.** El kardex tiene 5 semanas (lunes a domingo). Un mes de 30/31 días que empieza en sábado o domingo pierde sus últimos 1–2 días: **no se pueden registrar**. En 2026: 30 y 31 de marzo, 31 de agosto y 30 de noviembre; en 2027: 31 de mayo y 30–31 de agosto.

**Cómo lo resuelven hoy en papel (aclarado por Lucho el 2026-09-30).** Toman **otra hoja** y la tratan como un mes nuevo solo para esos días: en la semana 1 llenan las casillas que faltan (p. ej. lunes 30 y martes 31 de marzo) y dejan el saldo final al final de esa hoja. **Esa hoja sigue siendo de marzo** (queda cerrada como parte de marzo y no se reutiliza), y para abril hay que abrir **otra hoja aparte**, que arranca con el saldo con que cerró esa hoja.

**La propuesta anterior ("semana compartida entre meses", que ponía esos días en la semana 1 del mes siguiente) queda DESCARTADA**: contradice la práctica (los días deben quedar en marzo y abril no debe heredar esas salidas como suyas).

**Propuesta nueva (por confirmar): "semana 6 parcial" del mismo mes.**
- Los meses que no caben muestran una **6.ª semana** con solo los 1–2 días sobrantes (con su propia casilla de entrada y su saldo), que hereda el saldo de la semana 5.
- El mes siguiente hereda el saldo final **después** de esa semana 6 (hoy hereda el de la semana 5, ver `finalBalanceOfMonth`).
- Los totales de marzo incluyen el 30 y 31 (como en papel); el Excel/PDF muestran una hoja/bloque extra solo cuando aplica.
- **Impacto técnico (no es solo pantalla):** hoy `kardex_save_product` valida arreglos de 35 salidas / 5 entradas / 5 saldos, y `week_submissions`, `ajustes` y `admin_weekly_totals` limitan la semana a 0–4. Habría que aceptar 35 **o** 42 (los registros viejos de 35 siguen válidos, se leen rellenados con ceros), ampliar esos límites, `calendar.ts`, `monthState.ts`, `balanceEngine.ts`, los exportadores y el resumen semanal. Es un plan propio (004) con su SQL y pruebas (`calendar.test.ts` hoy tiene el `it.fails` de esta falla).
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
