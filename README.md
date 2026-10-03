# Kardex Digital

Aplicación web para llevar el **kardex de alimentos** y la **lista de mercado semanal** de las casas de
**Aldeas Infantiles SOS Colombia**. Reemplaza el formato en papel «Movimiento Diario de Alimentos» y los libros de Excel que
las colaboradoras mandaban por correo, y le da a la nutricionista una vista de todas las comunidades.

**Estado (3 de octubre de 2026):** en producción con datos reales, como **piloto dentro de una propuesta comercial en curso**
con la organización. Lo construye y mantiene una sola persona (Lucho); este documento resume dónde está el proyecto, cómo
correrlo y dónde está cada cosa. El detalle de cada decisión vive en [`planes/`](planes/README.md).

## Qué hace

**Para las colaboradoras de cada comunidad** (entran con el PIN de 4 dígitos de su casa):

- **Kardex diario:** entradas, salidas y saldos por producto, por semana (5 semanas, más una semana 6 de cierre en los meses que no
  caben, como el 30 y 31 de marzo de 2026). El saldo se recalcula solo, avisa cuando una salida supera el saldo y permite corregir
  un saldo con motivo (queda en el historial). Catálogo de **240 productos** en 5 categorías.
- **Buscador de productos** por nombre (sin importar tildes ni mayúsculas), combinable con la categoría.
- **Guardado automático** con indicador, reintentos y aviso si no se pudo guardar; descarga a **Excel y PDF**.
- **Enviar semana** a la nutricionista, con confirmación; la semana queda marcada y avisa si cambia después.
- **Lista de mercado semanal** (fruver y lácteos, carnes, abarrotes, aseo): cantidades por producto, número de participantes,
  plazo del viernes, **notas de cambios** para la nutricionista y sus respuestas (con campanita).
- **Cambiar su propio PIN.**
- Pensado para personas adultas mayores y para computador o portátil: barra de accesibilidad (letra grande, alto contraste),
  textos con contraste AA, avisos que se cierran al tocar y confirmaciones propias de la app (no ventanas del navegador).

**Para la nutricionista** (`/admin`, contraseña propia con cambio obligatorio y código de recuperación de un solo uso):
ver el kardex de cualquier comunidad (solo lectura), campanita de semanas enviadas, **resumen semanal** consolidado para el
pedido a proveedores, listas de mercado por comunidad y consolidadas, y respuesta a las notas de cambios.

**Para el desarrollador** (`/dev`, sin enlace desde ninguna parte): los **errores del navegador** agrupados y explicados en
lenguaje natural, con botón «resuelto». Además, **alertas por correo y Telegram** (Edge Function `dev-alert`) cuando se acumulan
errores. Es la parte de «vigilancia del servicio» de la propuesta. Lo que falta de este panel (estado de comunidades y acciones
remotas) está en el [plan 007](planes/007-panel-dev.md).

## Cómo está hecho

| Pieza | Detalle |
|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript. **Sitio 100 % estático** (`output: "export"`): no hay servidor propio. |
| Datos | Supabase (Postgres). La app solo llama a **funciones RPC `security definer`**; las tablas están cerradas (RLS) y el rol público solo ejecuta funciones. |
| Sesiones | Un token de 12 h por comunidad (PIN con bcrypt, **5 intentos fallidos = 15 minutos de bloqueo**), uno aparte para la nutricionista y otro para el desarrollador: ninguno sirve en las otras pantallas. |
| Exportación | ExcelJS y jsPDF, en el navegador. |
| Seguridad web | `public/_headers` con la política de contenido; sin rutas de API ni acciones de servidor (lo comprueba una prueba). |
| Hosting | Hoy en Vercel; migración a Cloudflare Pages planeada antes del primer cobro ([plan 010](planes/010-hosting-estatico-cloudflare.md)). |

Estructura del código:

```
src/app          páginas: / (comunidades), /admin (nutricionista), /dev (desarrollador) y sus hojas de estilo
src/components   pantallas y piezas (kardex, lista de mercado, admin, dev, diálogos, avisos)
src/hooks        estado y carga de datos de cada pantalla
src/lib          lógica pura (saldos, calendario, búsqueda), servicios de Supabase y exportadores
supabase         todo el SQL (se corre a mano, en orden) y la Edge Function dev-alert
tests            unit, integration, db (SQL en Postgres local) y manual
planes           un plan por cambio importante: decisiones, estado y qué tocó
```

## Cómo correrlo

Requisitos: Node 22 y un `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Los secretos nunca van
en el repositorio (`.env*` está ignorado).

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build      # exporta el sitio estático a out/
```

## Pruebas

| Comando | Qué corre |
|---|---|
| `npm test` | Pruebas unitarias y de pantalla (sin red). |
| `npx tsc --noEmit` y `npm run lint` | Tipos y lint (lo mismo que el CI). |
| `npm run test:db` | Los scripts SQL en un Postgres local desechable, con mutaciones para comprobar que las pruebas detectan fallos. |
| `npm run test:integration` | Contra el Supabase real, solo con comunidades `ZZZ_TEST_BORRAR_AUTO_*`. Algunas son opt-in porque usan las cuentas de la nutricionista o del desarrollador. |
| `tests/manual/checklist.md` | Lista de verificación a mano antes de desplegar. |

El CI de GitHub corre tipos, lint, pruebas unitarias, build y las pruebas SQL en cada push a `main`. Cómo correr cada tipo y
las precauciones están en [`tests/README.md`](tests/README.md).

## Base de datos

No hay migraciones automáticas ni copia del esquema de producción: cada cambio es un `.sql` en [`supabase/`](supabase/README.md)
que se corre a mano en el SQL Editor, **en el orden de ese README**. Los datos de prueba se borran con
`supabase/cleanup_test_data.sql`.

## Lo que hay que tener presente

- **PIN de 4 dígitos:** es una desviación consciente respecto a un mínimo de 8 caracteres, por la comodidad de las colaboradoras;
  se compensa con el bloqueo por intentos y con que los datos solo se leen con el token de sesión.
- **Copias de seguridad:** el plan gratuito de Supabase no tiene copias automáticas. Está pendiente decidir entre una copia
  semanal propia, un botón de descarga de datos o pasar al plan de pago ([plan 007, B3](planes/007-panel-dev.md)).
- **Ubicación de los datos:** Supabase en la región oeste de EE. UU. (fuera de Colombia).
- **Datos personales de los niños:** la aplicación no los guarda; está pendiente de confirmarlo formalmente con la organización.
- **Pendientes del proyecto:** logo de Aldeas (requiere su autorización escrita), IVA de la cuenta de cobro, migración a
  Cloudflare, y las siguientes etapas del panel `/dev`. La minuta patrón del ICBF ([plan 011](planes/011-minuta-patron.md)) es una
  función futura, aplazada a propósito para no complicar el trabajo de las colaboradoras.

## Más documentación

- [`planes/README.md`](planes/README.md): índice de planes con su estado y los hallazgos abiertos.
- [`supabase/README.md`](supabase/README.md): orden y propósito de cada script SQL.
- [`tests/README.md`](tests/README.md): qué prueba cada archivo y cómo correrlas.
- [`CLAUDE.md`](CLAUDE.md): reglas de trabajo para el asistente de programación (zonas que requieren aprobación, comandos verificados).
