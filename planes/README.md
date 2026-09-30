# Planes de cambios y features

Cada cambio importante (feature nueva, cambio de seguridad, refactor) tiene aquí **un plan**
antes de programarse y se mantiene actualizado hasta que se despliega. Sirve para:

- Saber **qué se decidió y por qué** (sobre todo cuando la decisión no es obvia en el código).
- Saber **en qué estado está** cada cosa y qué falta para desplegarla.
- Encontrar rápido **qué tocó cada cambio** (archivos, SQL, pruebas) si algo falla más adelante.

## Índice

| # | Plan | Estado | Commits / notas |
|---|---|---|---|
| 001 | [Panel de la nutricionista](001-panel-nutricionista.md) | 🚧 En curso (rama `feature/panel-admin`) | — |
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
