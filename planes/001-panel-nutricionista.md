# 001 — Panel de la nutricionista

**Estado:** 🚧 En curso
**Rama:** `feature/panel-admin`  **Fecha:** 2026-09-30

## Objetivo

Una persona (la nutricionista) revisa que cada comunidad haya llenado bien su kardex semanal
para poder hacer el pedido a los proveedores. Hoy tendría que pedirle a cada comunidad que
le muestre su pantalla. Pedido por el personal de la organización en las pruebas manuales.

Necesita, en **solo lectura**:
1. Ver **todas las comunidades** y qué semanas ya enviaron.
2. Abrir el kardex de una comunidad, **descargar el Excel del mes actual** y **ver meses anteriores**.
3. Una **campanita** que avise cuando una comunidad envía la actualización de la semana.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Quién entra | Una sola cuenta compartida ("nutricionista"), en la ruta `/admin`, no enlazada desde la pantalla de comunidades. | Una sola persona lo usará; evita construir un sistema de usuarios. |
| Contraseña | Larga (mín. 10 caracteres), con hash bcrypt, mismo bloqueo por intentos que el PIN. La inicial la pone Lucho por SQL como **temporal**; el primer ingreso obliga a cambiarla. | Un PIN de 4 dígitos no basta para ver todo. |
| Recuperación | Al cambiarla por primera vez se genera un **código de recuperación** de un solo uso (se muestra una vez). "Olvidé mi contraseña" + código permite poner otra. Si se pierde el código, Lucho resetea por SQL. | No hay correo/SMS en la app; recuperación por correo (Supabase Auth) queda como alternativa si la organización la pide. |
| Sesión | Token de 8 h (deslizante), guardado solo como hash; mismo patrón que las comunidades pero **tabla y rol aparte**. | Un token de comunidad jamás debe servir en el panel ni al revés. |
| Solo lectura | Las funciones `admin_*` solo leen, salvo `admin_mark_reviewed`, que solo marca el estado de revisión. | La nutricionista no puede alterar el kardex de nadie. |
| Enviar semana | Botón **"Enviar semana N"** en cada comunidad. | Ver aclaración abajo. |
| Modificaciones tras enviar | Al enviar se guarda una **foto (snapshot)** de esa semana; el panel la compara con los datos actuales. | Ver aclaración abajo. |
| Campanita | Cuenta los envíos **sin revisar** (incluye los modificados tras el envío). Se consulta cada 60 s con el panel abierto. | Sin Realtime: las tablas están cerradas al acceso directo. |

### Por qué existe "Enviar semana" (aunque ella pueda ver todo)

Ver datos y saber que **la comunidad terminó** son cosas distintas. El kardex se guarda solo
mientras se digita, así que un miércoles la nutricionista ve números a medias y no puede saber
si están incompletos o si la comunidad ya cerró. "Enviar semana" es el equivalente a entregar
el papel:

- Marca esa semana como **lista para revisar** y dispara la campanita.
- No es "la semana que se manda al proveedor": el pedido lo hace ella, fuera de la app, con lo
  que revisó (una vista consolidada por producto queda como fase futura).

Estados por comunidad y semana:

| Estado | Significa |
|---|---|
| Pendiente | La comunidad todavía no la envía |
| Enviada | Enviada, esperando revisión (suma a la campanita) |
| Revisada | La nutricionista la marcó como revisada |
| Modificada tras envío | Los datos de esa semana cambiaron después de enviarla (vuelve a sumar a la campanita) |

**Snapshot en vez de comparar fechas:** `kardex_records.updated_at` es por producto y mes, no por
semana. Si solo se comparara esa fecha, editar la semana 3 marcaría como "modificada" a la
semana 1 ya enviada (que es el flujo normal). Por eso al enviar se guarda, por producto, un
arreglo con `[saldo anterior, entrada, salida día 1 … día 7]` de esa semana, y el estado
"modificada" sale de comparar la foto con los datos actuales. Un cambio en una semana anterior
que altere el saldo de la siguiente también la marca (los números que ella revisó cambiaron).

## Diseño

### Base de datos (SQL aditivo por fase)

- `admin_account` — fila única (`id = 1`): `password_hash`, `must_change`, `recovery_hash`,
  `failed_count`, `locked_until`, `updated_at`.
- `admin_sessions` — `token_hash`, `expires_at`.
- `week_submissions` — `community` (fk, `on delete cascade`), `year`, `month`, `week_index` (0–4),
  `submitted_at`, `submit_count`, `snapshot jsonb`, `reviewed_at`; único por
  (comunidad, año, mes, semana). Reenviar refresca la foto, sube el contador y borra `reviewed_at`.
- Todas las tablas nuevas con RLS activo y `revoke all` para `anon` (solo las funciones `security definer` las tocan).

Funciones (todas validan token y, en las de administradora, el rol):

| Fase | Función | Quién | Qué hace |
|---|---|---|---|
| A | `admin_login(password)` | anon | Devuelve token y `must_change`; usa bloqueo por intentos |
| A | `admin_change_password(token, actual, nueva)` | admin | Cambia; si era temporal, devuelve el código de recuperación |
| A | `admin_recover_password(codigo, nueva)` | anon | Restablece con el código (con bloqueo por intentos) |
| A | `admin_logout(token)` | admin | Cierra la sesión |
| B | `admin_communities_overview(token, año, mes)` | admin | Comunidades y estado de sus 5 semanas |
| B | `admin_load_month / admin_load_ajustes / admin_months_with_data(token, comunidad, …)` | admin | Lo mismo que ve la comunidad, para cualquiera |
| C | `kardex_submit_week(token, año, mes, semana)` | comunidad | Guarda el envío y su foto |
| C | `kardex_week_submissions(token, año, mes)` | comunidad | Qué semanas ya envió |
| C | `admin_notifications(token)` | admin | Envíos sin revisar / modificados |
| C | `admin_mark_reviewed(token, id)` | admin | Marca revisada |

### Pantallas

- `/admin`: acceso (contraseña; primer ingreso → cambio obligatorio + código de recuperación; "Olvidé mi contraseña").
- Panel: tabla comunidades × semanas del mes (con selector de mes/año), campanita, cerrar sesión.
- Detalle de comunidad: la misma pantalla del kardex **en solo lectura** (campos deshabilitados,
  sin lápiz de ajuste), con Excel/PDF y selector de mes para ver anteriores. Se reutiliza
  `KardexDashboard` con un modo `readOnly` y una fuente de datos `admin_*`.
- Comunidades: botón "Enviar semana N" (con confirmación) y estado "Enviada el …".

## Fases

- [x] **Fase A — Acceso de administradora.** *(Verificada en navegador: ingreso temporal, cambio obligatorio, código de recuperación, cambio voluntario, recuperación con código. Bug hallado y corregido: `DELETE` sin `WHERE` rechazado por Supabase. Pendiente: correr el ciclo automatizado opt-in.)*
  SQL `supabase/admin_auth.sql` (+ `admin_reset_password.sql`); ruta `/admin` con login,
  cambio obligatorio, código de recuperación y cambio voluntario.
  *Aceptación:* la contraseña temporal entra y obliga a cambiar; la nueva funciona; el código restablece;
  5 fallos bloquean 15 min; un token de comunidad no sirve en `admin_*`.
- [ ] **Fase B — Consulta en solo lectura.** *(Código escrito y probado por tipos/unitarias; falta correr `supabase/admin_read.sql` y verificar en navegador. Incluye además: si la carga de un mes falla, la tabla se bloquea y se avisa, para no sobrescribir datos ni exportar ceros; hallazgo H1 en `planes/README.md`.)*
  Tabla de comunidades, detalle en `readOnly`, Excel/PDF y meses anteriores.
  *Aceptación:* ve todas las comunidades; el Excel coincide con el que descarga la comunidad; no hay forma de editar.
- [ ] **Fase C — Envío de semana y campanita.** Botón en comunidades, estados, snapshot, campanita, "marcar revisada".
  *Aceptación:* enviar suma 1 a la campanita; editar esa semana la marca "modificada"; editar otra semana no;
  revisar la quita; reenviar la vuelve a sumar.

## Pruebas

Automáticas (en `tests/integration/`), por fase:
- **A:** login correcto/incorrecto, contraseña temporal fuerza cambio, recuperación con código (un solo uso),
  bloqueo por intentos, token de comunidad rechazado por `admin_*` y token de admin rechazado por `kardex_*`, sesión expira/logout.
- **B:** `admin_*` devuelven datos de cualquier comunidad, no aceptan escritura, rechazan token inválido.
- **C:** enviar guarda foto; editar la misma semana → modificada; editar otra semana → no; reenvío reinicia revisión;
  la comunidad no puede enviar por otra comunidad.

Las pruebas de admin necesitan la contraseña temporal: se pasa por variable de entorno local
(`ADMIN_TEST_PASSWORD` en `.env.local`, nunca en git). Ver `tests/README.md`.

Manual: se agregan al checklist los puntos del panel (login, campanita, Excel, solo lectura, móvil).

## Despliegue

1. Cada fase trae SQL **aditivo**: se puede correr antes del despliegue sin afectar a la app actual.
2. Merge de la rama a `main` y push cuando las 3 fases estén verificadas (o por fases si Lucho prefiere).
3. Lucho define la contraseña temporal con el SQL de `admin_auth.sql` y se la entrega a la nutricionista por un canal seguro.
4. Correr `npm run test:integration` y el checklist manual; limpiar datos de prueba con `supabase/cleanup_test_data.sql`.

Reversa: las tablas/funciones nuevas no afectan a las existentes; basta con no enlazar `/admin` o revertir el merge.

## Riesgos y pendientes

- Una sola cuenta compartida: quien tenga la contraseña ve todo. Mitigación: cambio obligatorio, contraseña larga, bloqueo por intentos.
- Alguien podría bloquear la cuenta de administradora con intentos fallidos (15 min, no borra nada); mismo compromiso que el PIN.
- La campanita solo funciona con el panel abierto. **Fase futura:** aviso por correo/WhatsApp.
- **Fase futura:** vista consolidada del pedido a proveedores (suma por producto de todas las comunidades para una semana).
