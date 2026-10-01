# 006 — Cambiar PIN (la comunidad cambia su propio PIN)

**Estado:** ✅ Desplegada el 2026-10-01 (`fcd1591`); `change_pin.sql` corrido y pruebas de integración en verde.
**Rama:** `feature/cambiar-pin`  **Fecha:** 2026-10-01

## Objetivo

Los PIN que reparte la administración (plan 005) son **temporales**, pero la app no tenía forma de cambiarlos:
solo se podían reemplazar por SQL. Este plan deja que **la propia comunidad** elija su PIN desde un botón
«Cambiar PIN», sin depender de nadie.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Qué se exige | La sesión de la comunidad **y su PIN actual**. | Una sesión abierta (celular prestado, pestaña olvidada) no debe bastar para quitarle el PIN a la comunidad. |
| PIN actual equivocado | Devuelve `false` y **cuenta como intento fallido** (5 = bloqueo de 15 min, igual que el login). | Que la función no sirva para adivinar el PIN con una sesión robada. Se reusa `verify_community_pin`. |
| PIN nuevo | 4 dígitos, distinto del actual y **no «débil»**: se rechazan 0000…9999 (dígitos iguales) y las secuencias 0123…6789 y 9876…3210 (24 PIN en total). | Con solo 10.000 combinaciones, evitar los primeros que alguien probaría. La pantalla avisa antes de enviar; el servidor lo vuelve a comprobar (`_pin_is_weak`). |
| Otras sesiones | Al cambiar el PIN **se cierran las demás sesiones** de esa comunidad (la que lo cambió sigue). | Si el PIN estaba comprometido, no quedan sesiones viejas abiertas. |
| Registro | Columna `communities.pin_changed_at` (no legible desde internet). En `null` mientras la comunidad siga con el PIN asignado. | Ver quién ya cambió el PIN temporal: `select name, pin_changed_at from communities order by name;`. |
| Dónde está el botón | En la barra de arriba (junto a Kardex \| Lista de mercado), visible en las dos pantallas. | Una sola entrada para toda la comunidad. |
| PIN olvidado | Sigue siendo por SQL (administración): quitar el PIN con `update … set pin_hash = null` y volver a correr `fixed_communities.sql` (ver plan 005, «PIN que no se vieron»). | No hay «recuperar con correo»: no hay cuentas de usuario. |

## Diseño

- `supabase/change_pin.sql` — columna `pin_changed_at`, `_pin_is_weak` (interna, cerrada a internet) y `change_community_pin(p_token, p_current_pin, p_new_pin)`.
- App: `src/lib/pin.ts` (reglas y mensajes), `src/components/ChangePinModal.tsx`, botón en `CommunityShell`, `kardexService.changePin`.

## Fases

- [x] **Fase A — SQL.** `tests/db/change_pin.test.sql` (7 mutaciones comprobadas: sin verificar el PIN actual, sin cerrar sesiones, sin regla de PIN débil, permitir PIN igual, no contar el intento, no registrar la fecha, helper abierto a internet).
- [x] **Fase B — Pantalla.** `unit/pin.test.ts`, `unit/changePinModal.test.tsx` y `unit/communityShell.test.tsx` (mutaciones comprobadas); verificada en el navegador (escritorio y 360 px) con Casa Blanca y la llamada de cambio **simulada** (no se tocó ningún PIN real).
- [ ] **Fase C — Producción.** Correr el SQL, desplegar, `npm run test:integration` (incluye `change-pin.test.ts`) y el checklist manual (con una comunidad `ZZZ_TEST_`).

## Despliegue

**Orden:** 1) correr `supabase/change_pin.sql` (aditivo: la app actual sigue igual) → 2) desplegar (push). Si se desplegara primero, el botón fallaría con «No se pudo cambiar el PIN» hasta correr el SQL.
Reversa: `drop function change_community_pin(text, text, text);` (la columna y `_pin_is_weak` pueden quedarse).

## Riesgos y pendientes

- Un PIN actual equivocado suma al bloqueo: una persona con la sesión abierta que se equivoque 5 veces **bloquea el login de toda la comunidad 15 minutos** (la sesión abierta sigue funcionando). Es el mismo compromiso del login.
- Los PIN que escoja cada comunidad solo los conoce ella: si lo olvida, hay que resetearlo por SQL (ver arriba).
