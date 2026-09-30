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
| H1 | **Meses que no caben en 5 semanas** | ⚠️ **PENDIENTE DE REVISIÓN (importante)** — decisión de Lucho/organización | `tests/unit/calendar.test.ts` (`it.fails`) |

**H1 — detalle.** El kardex tiene 5 semanas (lunes a domingo). Un mes de 30/31 días que empieza en sábado o domingo pierde sus últimos 1–2 días: **no se pueden registrar**. En 2026: 30 y 31 de marzo, 31 de agosto y 30 de noviembre; en 2027: 31 de mayo y 30–31 de agosto.

**Propuesta (sin 6.ª semana): "semana compartida entre meses".** La semana lunes–domingo que contiene el fin de mes también contiene el inicio del mes siguiente, y la primera semana del mes siguiente **ya tiene celdas vacías** justo en esos días. Los días que no caben (siempre los últimos 1–2) se registran en esas celdas, en la semana 1 del mes siguiente, rotulados con su fecha real (ej. «30 mar»).
- Sin cambios de base de datos: las mismas 35 posiciones (las celdas iniciales de la semana 1 hoy quedan siempre vacías).
- El saldo sigue coherente: la semana 1 del mes siguiente hereda el saldo de cierre del anterior y suma esas salidas, como una semana física normal; encaja con el envío semanal a la nutricionista.
- Solo se habilitan las celdas de los días que de verdad no caben en el mes anterior (no las que ya están registradas allí).
- Contras: los totales *mensuales* de marzo no incluirían el 30–31 (quedan en abril) → se avisa en pantalla y Excel/PDF; cambia el cálculo del calendario, la pantalla, el Excel y el PDF.
- Alternativas descartadas: columnas extra en la semana 5 (tabla irregular), bloques fijos por día del mes 1–7, 8–14… (rompe la semana lunes–domingo y el ritmo de envío semanal), sexta semana (cambia base de datos y validaciones).
- **Antes de decidir:** preguntar cómo maneja hoy el kardex de papel esos días.

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
