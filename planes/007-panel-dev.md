# 007 — Panel del desarrollador (`/dev`): errores, alertas y diagnóstico

**Estado:** 🚧 **Fase A, parte 1 construida en local el 2026-10-02 (sin commitear ni desplegar):** registro de errores (SQL `dev_errors_1.sql`, logger del cliente y pruebas). Decisiones confirmadas por Lucho el 2026-10-01 (cuenta en la base, alertas por correo y Telegram, acciones remotas con auditoría). Falta lo que necesita a Lucho en la PC (correr el SQL, correo y Telegram) y las Fases B y C.
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

- [ ] **Fase A — Errores y alertas** (valor alto, costo bajo). *Aceptación:* un error forzado en una comunidad de prueba aparece en la tabla con su versión y llega el correo; sin red se reporta al volver.
  - [x] **A1 — Registro de errores** *(construido el 2026-10-02, sin desplegar)*: `supabase/dev_errors_1.sql` (tabla cerrada `system_error_logs` y `dev_report_client_error`: la comunidad sale del token, texto limpio y tiras largas tapadas, tope de 20 por minuto y 300 por día, limpieza de más de 30 días cada 50 reportes sin tareas programadas), `src/lib/errorReporter.ts` y `appErrors.ts` (no repite ni inunde, nunca manda argumentos, cola en memoria sin red, se apaga solo si la función aún no existe), `ErrorReporter` en el layout y la conexión en `authedRpc`. Pruebas: `tests/db/dev_errors.test.sql` (16 mutaciones detectadas y una equivalente: quitar el `grant` a `anon`), `tests/unit/errorReporter.test.ts` y `appErrorsWiring.test.tsx` (25 detectadas y una equivalente), `tests/integration/dev-errors.test.ts`. Una revisión de código (2026-10-02) encontró y corrigió un bug del reintento sin red (la cola quedaba atascada tras el primer envío exitoso), el tapado de tokens demasiado ancho (ahora exige 4 o más dígitos), el nivel de los errores de red de la página, y la atribución del error a la sesión de la propia llamada. **Falta correr `dev_errors_1.sql` en Supabase** y `npm run test:integration`.
  - [x] **A2a — Función de alertas** *(construida el 2026-10-02, sin desplegar)*: `supabase/functions/dev-alert/index.ts` (un solo archivo, para pegarlo en el editor del panel), `supabase/dev_alerts_1.sql` (una fila cerrada con la hora del último aviso) y sus pruebas (`tests/db/dev_alerts.test.sql`, `tests/unit/devAlertFunction.test.ts`). Avisa por correo (Resend) y Telegram cuando hay **3 errores o 10 advertencias en 10 minutos** de cualquier comunidad, **un aviso cada 30 minutos como máximo**. Los umbrales se pueden cambiar con variables (`ALERT_ERRORS`, `ALERT_WARNINGS`, `ALERT_WINDOW_MIN`, `ALERT_COOLDOWN_MIN`).
  - [ ] **A2b — Desplegar las alertas** (necesita a Lucho en la PC; pasos abajo) y el chequeo de disponibilidad externo.
  - [ ] **A3 — Cuenta del desarrollador** (`dev_account`, sesiones y bloqueo): **se movió a la Fase B**, que es donde hace falta (la pantalla `/dev`); mientras tanto los errores se ven en el Editor de tablas de Supabase. Así no se abre una superficie de autenticación nueva sin tener quién la use.
- [ ] **Fase B — Pantalla `/dev` y acciones remotas:** login, monitor de comunidades, visor de errores, desbloquear / PIN temporal con auditoría.
- [ ] **Fase C — Integridad contable** (solo los invariantes definidos y probados).

## Pruebas

SQL local con mutaciones (acceso, sesión, límites del reporte, aislamiento, auditoría); integración contra Supabase con comunidades `ZZZ_TEST_`; unitarias del logger (deduplicación, cola, sin tokens en el registro); checklist manual.

## Despliegue

SQL aditivo primero, luego la app (el logger debe fallar en silencio si la función aún no existe).

## Riesgos y pendientes

- Un panel pull sin alertas no avisa de una caída total: por eso el correo y el chequeo externo van en la Fase A y no son opcionales.
- Retención: purga automática (`pg_cron`) para que la tabla de errores no crezca sin límite.

## Decisiones de la construcción (2026-10-02)

- **Cola sin red solo en memoria**, no en `localStorage`: el token de sesión también vive solo en memoria, así que tras recargar la página un reporte guardado no se podría atribuir con seguridad a su comunidad. Cada reporte espera con la sesión con la que nació (si se cambia de comunidad en el mismo equipo no se mezcla).
- **Qué es un fallo y qué no:** las condiciones esperadas del negocio se lanzan en MAYÚSCULAS (`LISTA_VACIA`, `PIN_DEBIL`, `SESION_INVALIDA`…) y no se reportan; un error de validación con frase («Cambios inválidos») sí, porque es un fallo del cliente. Sin código de base de datos = fallo de red = `warning`; con código = `error`.
- **Limpieza sin `pg_cron`:** cada 50 reportes se borran los de más de 30 días; evita depender de una extensión.
- **Sin `critical` desde el navegador:** ese nivel lo pondrá el sistema (umbrales) cuando existan las alertas.
- **Versión:** `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (Vercel); en Cloudflare Pages hay que definir `NEXT_PUBLIC_APP_VERSION` en las variables del build (se anota también en el plan 010). Sin ninguna queda «local».
- **Datos que sí viajan:** el mensaje de error del servidor o del navegador (hasta 300 caracteres; puede traer un nombre de comunidad). No viajan los argumentos de las llamadas ni cantidades.

## Despliegue de las alertas (A2b) — pasos para Lucho

El código fuente es `supabase/functions/dev-alert/index.ts`; el editor del panel no tiene control de versiones ni retroceso, así que **siempre se edita en el repositorio y se vuelve a pegar**.

**Por qué un trigger y no el formulario de «Database Webhooks»:** en el proyecto de Lucho el formulario falla con `schema "supabase_functions" does not exist` aunque `pg_net` figure como instalado. Se evita con un trigger propio (`supabase/dev_alerts_2.sql`) que llama a la función con `pg_net` y lee la URL y las claves de la **Vault** (así no quedan en el repositorio ni en el historial del SQL Editor). Manda el mismo formato que el webhook.

1. **Clave compartida:** inventar UNA clave larga y guardarla en un gestor de contraseñas. Generar con `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. Va en **dos** sitios y debe ser idéntica: el secreto `ALERT_WEBHOOK_SECRET` de la función (paso 2) y la Vault (paso 4).
2. **Secretos de la función** (panel → Edge Functions → Secrets; no pueden empezar por `SUPABASE_`): `ALERT_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`. Opcional: `ALERT_EMAIL_FROM`. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen puestos.
3. **Función:** Edge Functions → Deploy a new function → *Via Editor* → nombre `dev-alert` → pegar todo el archivo → *Deploy function* (10–30 s).
4. **Vault** (Integrations → Vault → Secrets → *Add new secret*), tres secretos: `alert_function_url` = `https://<ID-DEL-PROYECTO>.supabase.co/functions/v1/dev-alert`; `alert_webhook_secret` = la clave del paso 1; `alert_anon_key` = la clave **anon** pública (Settings → API Keys → pestaña de claves heredadas, `eyJ…`; va en `Authorization: Bearer`, que es lo que el panel pone en sus propios webhooks); opcional `alert_api_key` = la clave publicable (`sb_publishable_…`, cabecera `apikey`). **Ojo:** el `401 INVALID_CREDENTIALS` que salió el 2026-10-03 NO venía de Supabase sino de la **plantilla** que el editor pone al crear la función (con un middleware de claves): hay que **reemplazar todo el código de la plantilla** por `supabase/functions/dev-alert/index.ts`.
5. **SQL:** correr `supabase/dev_alerts_1.sql` (si aún no) y `supabase/dev_alerts_2.sql` (60 líneas, reejecutable).
6. **Probar los dos canales sin esperar una falla real:** con `curl.exe` (PowerShell) o `curl` (Git Bash): POST a `https://<ID>.supabase.co/functions/v1/dev-alert` con las cabeceras `apikey` (la clave publicable), `x-alert-secret` (la clave compartida) y `x-alert-test: 1`, sin cuerpo. Responde `{"test":true,"email":"ok","telegram":"ok"}` y llegan un correo y un mensaje de Telegram.
7. **Autoprueba del trigger de punta a punta** (SQL Editor):
   ```sql
   insert into system_error_logs (community, source, level, fn, message, app_version)
   select 'ZZZ_TEST_alerta', 'rpc', 'error', 'autoprueba', 'prueba de alerta ' || g, 'manual' from generate_series(1, 3) g;
   select * from net._http_response order by created desc limit 5;
   ```
   Deben llegar **un solo** correo y un solo mensaje (3 llamadas, pero solo una toma el turno) y `net._http_response` debe mostrar respuestas 200. Para repetirla antes de 30 minutos: `update dev_alert_state set last_alert_at = 'epoch' where id = 1;`. Al terminar, `supabase/cleanup_test_data.sql` borra esas filas.
8. **Remitente de Resend:** `onboarding@resend.dev` es el remitente de pruebas; con él solo se puede enviar al correo de la propia cuenta (INFERRED, confirmarlo). Para otros destinatarios hace falta verificar un dominio.
9. Ver `tests/manual/checklist.md` («Alertas al desarrollador»).

**Secretos pegados con espacios o saltos de línea:** al pegar un valor en el panel suelen colarse un espacio o un salto de línea al final, o comillas; la función los quita sola (un valor que queda vacío cuenta como «sin configurar»), pero conviene pegarlos limpios.

**Si un canal dice `"error"`:** la respuesta trae `email_detail` o `telegram_detail` con el código y el motivo que da el servicio (por ejemplo Telegram: `HTTP 400: Bad Request: chat not found` = chat id equivocado o el bot sin iniciar; `HTTP 401: Unauthorized` = token del bot mal copiado; Resend: `HTTP 403: You can only send testing emails to your own email address` = el remitente de pruebas solo envía al correo de tu propia cuenta). Los secretos se tapan y de una excepción de red no se toma el mensaje (puede llevar el token en la dirección).

**Si la respuesta es `500 Internal Server Error` en texto plano** (cabecera `sb-error-code: EDGE_FUNCTION_ERROR`): la función se cayó con una excepción; el motivo está en Edge Functions → `dev-alert` → **Logs**. Desde el 2026-10-03 la función captura esas excepciones, escribe `Error interno: <nombre>: <mensaje>` en el log y responde `{"error":"Error interno"}`; pegar de nuevo el archivo para tener esa versión.

**Si algo falla:** en la respuesta del probador, `401 INVALID_CREDENTIALS` o un `500` con `SyntaxError: Unexpected end of JSON input` en el Log = la función desplegada es la **plantilla** del editor y no nuestro código (pegarlo de nuevo y desplegar); `{"error":"No autorizado"}` = la clave de la Vault y la del secreto no coinciden; `"sin configurar"` = falta o está mal escrito un secreto del canal; `net._http_response` con `status_code` vacío y un `error_msg` = el trigger no llegó a la función (revisar `alert_function_url`).

## Seguridad de las alertas

La función solo acepta al webhook con la clave compartida (comparación en tiempo constante; sin clave configurada rechaza todo), usa la clave de servicio solo del lado del servidor (nunca llega al navegador), manda texto plano a Telegram (sin `parse_mode`) y no escribe secretos en los logs ni en las respuestas. Lleva el último reporte ya limpiado por el servidor (sin argumentos de llamadas ni cantidades del kardex).
