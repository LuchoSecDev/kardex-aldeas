# 007 — Panel del desarrollador (`/dev`): errores, alertas y diagnóstico

**Estado:** 📝 Propuesta con las decisiones **confirmadas por Lucho el 2026-10-01** (cuenta en la base, alertas por correo y Telegram, acciones remotas con auditoría). Falta programarla (después de la zona de cambios).
**Rama:** `feature/panel-dev` (cuando se programe)  **Fecha:** 2026-10-01
Origen: `../diseno_panel_superusuario_dev.md` (diseño inicial, fuera del repositorio) revisado y corregido aquí.

## Objetivo

Enterarse de los problemas **antes de que las colaboradoras los reporten** y poder auxiliarlas sin tocar SQL:
errores que hoy solo salen en la consola de su navegador, comunidades bloqueadas, saldos que no cuadran y servicio caído.
Es también la forma concreta de cumplir la «vigilancia del servicio» que promete la propuesta.

## Correcciones al diseño inicial

| Hallazgo | Qué se hace |
|---|---|
| El sitio es **estático** (sin servidor): `DEV_ACCESS_KEY` como secreto de servidor y la cookie `httpOnly` no existen. | Cuenta propia en la base: `dev_account` + `dev_sessions` (mismo patrón y pruebas que `admin_auth.sql`), contraseña larga, código de recuperación, bloqueo por intentos. Tokens aparte de los de comunidad y nutricionista. |
| `dev_check_data_integrity` devolvía `negative_balances_count: 0` fijo (mostraría «0 detectados» siempre). | No se muestra ningún chequeo hasta que esté implementado y probado con datos que SÍ fallan. |
| `dev_report_client_error` abierta a `anon`: cualquiera puede inundar la tabla y `p_community` lo manda el cliente (falsificable). | Exige el **token de comunidad** (la comunidad sale del token), tope de tamaño, límite por comunidad y minuto, y purga a los 30 días. |
| El logger podía guardar los argumentos de las llamadas: llevan el **token de sesión**. | Nunca se registran argumentos; solo función, código de error, mensaje acotado y versión. |
| Sin red, el error no se puede reportar (justo cuando importa). Si Supabase cae, nada reporta. | Cola local con reintento + chequeo de disponibilidad externo con aviso por correo (ver Fase A). |
| Nombres que no existen (`save_month`, `load_month`, `client_perf_logs`, `PIN renovado`…) y funciones sin definir. | Se usan los reales: `kardex_save_product`, `kardex_load_month`, `kardex_submit_week`, `login_community`… |
| «Latencia por RPC» guardada en cada llamada: multiplica las escrituras (el kardex guarda por producto). | Se descarta; Supabase ya muestra latencia y tamaño de la base en su panel. Solo se cuentan los **reintentos de `saveQueue`** como advertencias. |
| «Tier gratuito de 500 MB». | Ya es plan de pago (propuesta). |
| Invariante 4 (PIN bloqueado) no es contable. | Pasa al monitor de comunidades. |
| Estimación «1 día + 1 día». | Con el estándar de pruebas del proyecto (SQL con mutaciones, integración, manual) son ~4–6 días en total. |

## Decisiones (confirmadas)

| Tema | Propuesta | Estado |
|---|---|---|
| Acceso | `dev_account` en la base (no variable de entorno). | ✅ confirmada |
| Alertas | **Correo y Telegram** al desarrollador ante error crítico o servicio caído: una Edge Function de Supabase manda los dos (el token del bot de Telegram y el chat van como *secretos* de la función, nunca en el repositorio ni en el navegador) + un chequeo externo gratuito de disponibilidad. | ✅ confirmada |
| Acciones remotas | Sí: **desbloquear** una comunidad y **asignar un PIN temporal** (se muestra una sola vez), con registro de auditoría. Nunca editar datos del kardex desde el panel. | ✅ confirmada |
| Sin datos personales | Los registros no llevan nombres de personas ni cantidades del kardex. | decidido |

## Diseño

- **Tablas** (cerradas a `anon`): `dev_account`, `dev_sessions`, `system_error_logs` (id, fecha, comunidad, origen, nivel, función, código, mensaje ≤ 300, versión, resuelto), `dev_audit_log`.
- **Funciones:** `dev_login/ping/logout/change_password/recover_password`, `dev_report_client_error(token_comunidad, …)`, `dev_list_errors`, `dev_resolve_error`, `dev_community_health` (estado por comunidad: PIN bloqueado, `pin_changed_at`, última actividad, semanas enviadas), `dev_unlock_community`, `dev_set_temp_pin`, `dev_check_data_integrity` (solo los invariantes ya implementados).
- **Cliente:** logger no bloqueante en `authedRpc`/`saveQueue` y `window.onerror`; nunca rompe el guardado ni se reporta a sí mismo; deduplica el mismo error por minuto; cola en `localStorage` si no hay red; la **versión** (hash del commit) viaja en cada reporte para ligar errores a despliegues.
- **Pantalla `/dev`:** `noindex`, no enlazada desde ninguna parte, estética de consola oscura; pestañas Estado de comunidades · Errores · Integridad.
- **Chequeos del dominio:** comunidades sin PIN o con PIN sin cambiar, comunidades `ZZZ_TEST_` en producción, calendario de pedidos sin cubrir las próximas 8 semanas, filas con arreglos de tamaño inesperado, cuenta de nutricionista aún con contraseña temporal.
- **Invariantes contables** (Fase C), definidos antes de programarlos: (1) saldos negativos calculados con la misma regla que `balanceEngine`; (2) continuidad de saldo entre meses (incluida la semana 6); (3) ajustes: el saldo de la semana coincide con el último ajuste vigente; (4) arreglos de 35/5/5 o 42/6/6. El cálculo en SQL se prueba con los **mismos vectores** que `balanceEngine.test.ts` para que no se desfase.

## Fases

- [ ] **Fase A — Errores y alertas** (valor alto, costo bajo): `dev_account`, tabla y reporte de errores, logger de cliente, correo de alerta, chequeo de disponibilidad externo. *Aceptación:* un error forzado en una comunidad de prueba aparece en la tabla con su versión y llega el correo; sin red se reporta al volver.
- [ ] **Fase B — Pantalla `/dev` y acciones remotas:** login, monitor de comunidades, visor de errores, desbloquear / PIN temporal con auditoría.
- [ ] **Fase C — Integridad contable** (solo los invariantes definidos y probados).

## Pruebas

SQL local con mutaciones (acceso, sesión, límites del reporte, aislamiento, auditoría); integración contra Supabase con comunidades `ZZZ_TEST_`; unitarias del logger (deduplicación, cola, sin tokens en el registro); checklist manual.

## Despliegue

SQL aditivo primero, luego la app (el logger debe fallar en silencio si la función aún no existe).

## Riesgos y pendientes

- Un panel pull sin alertas no avisa de una caída total: por eso el correo y el chequeo externo van en la Fase A y no son opcionales.
- Retención: purga automática (`pg_cron`) para que la tabla de errores no crezca sin límite.
