# 009 — Avisos de confirmación («toasts») para las acciones manuales

**Estado:** ✅ **Desplegada** (`9990ea4`, 2026-10-02; sin SQL). Pendiente: probarla en el celular real de una colaboradora (ver «Pendientes»).
**Rama:** `feature/toasts`  **Fecha:** 2026-10-01

## Objetivo

Las colaboradoras son personas mayores y necesitan **ver** que lo que hicieron quedó bien. Antes solo había un aviso rojo
para los saldos negativos y mensajes sueltos dentro de cada pantalla. Este plan agrega un aviso visual de confirmación
(«toast») para las acciones que la persona hace **a mano**.

## Decisiones (de Lucho, 2026-10-01)

| Tema | Decisión |
|---|---|
| Duración | **5 segundos** (8 era demasiado). |
| Cómo se cierra | **Tocando el propio aviso**, sin una «X» (lleva la pista «Toca para cerrar»). |
| Sonido / vibración | **Solo visual** en los éxitos. El aviso de saldo negativo conserva el sonido y la vibración que ya tenía. |
| Errores | Se **quedan hasta que se toquen** (decisión mía, fácil de cambiar con `TOAST_DURATION_MS` y la regla de `ToastItem`): un error que desaparece solo se puede perder. |
| Qué NO avisa | El guardado automático de cada tecla (para eso está el indicador fijo «✓ Todos los cambios guardados»). Solo avisa cuando un guardado que **falló** por fin se logra («Listo: tus cambios se guardaron.»). |
| Lo importante no depende del toast | En lo crítico (lista enviada, semana enviada) se mantiene también el mensaje fijo de la pantalla. |

## Diseño

- `src/components/toast/ToastProvider.tsx`: `ToastProvider` + `useToast()` con `success`, `warning` y `error`. Sin proveedor, las llamadas no hacen nada (así cada pantalla se prueba sola).
- Se ve arriba y al centro, encima de todo (también de los diálogos), con ✓ o ⚠ en un círculo, texto en negrita y **letra que sigue A / A+ / A++** (usa `em`: el tamaño lo fija el `body`, no el `html`, así que `rem` no cambiaría). En **alto contraste**: fondo negro, borde blanco grueso y texto blanco (el color solo no distingue éxito de error; lo distingue el ícono). Respeta `prefers-reduced-motion`.
- Máximo 3 a la vez (el más viejo se va); el mismo aviso repetido no se apila, se renueva.
- Dos zonas para lectores de pantalla (`role="status"` para éxitos y avisos, `role="alert"` para errores), siempre presentes aunque vacías.
- Reemplaza al antiguo `ErrorToast` (saldo negativo), que ahora sale como aviso ámbar sin el emoji repetido.

## Dónde avisa

| Pantalla | Aviso |
|---|---|
| Kardex (comunidad) | Descargar Excel / PDF; corregir un saldo (y error si falla, antes fallaba en silencio); enviar la semana (éxito y errores); saldo negativo; guardado recuperado |
| Lista de mercado (comunidad) | Lista enviada (a tiempo o tarde) y sus errores; participantes guardados; cambio agregado / actualizado / quitado; guardado recuperado |
| Cambiar PIN | «Tu PIN se cambió…» |
| Panel de la nutricionista | Lista o semana marcada como revisada (tabla y campanita); descargar el Excel de una comunidad, el consolidado o el resumen semanal (y error si falla) |

## Pruebas

`unit/toast.test.tsx` (duración exacta de 5 s, errores que se quedan, cierre al tocar, sin «X», dedupe, máximo 3, sin proveedor, tamaños en `em`), `unit/toastKardex.test.tsx`, `unit/toastMarketAdmin.test.tsx`; 16 mutaciones comprobadas.
Verificado en el navegador: éxito verde con ✓ y error rojo con ⚠, tocar los cierra, alto contraste (negro con borde blanco), la letra pasa de 18,4 a 23 y 27,6 px con A / A+ / A++, y a 360 px cabe sin scroll horizontal.

## Despliegue

Solo código (no hay SQL): merge a `main` y push.

## Pendientes

- Probar en el celular real de una colaboradora (¿5 segundos alcanzan para leerlo con letra A++? es la duración que pidió Lucho).
- Con A++ en un celular angosto un aviso puede ocupar bastante pantalla; se cierra tocándolo.
