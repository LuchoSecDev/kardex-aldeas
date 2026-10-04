@AGENTS.md

# Kardex Digital (kardex-app)

Kardex de alimentos y lista de mercado para Aldeas Infantiles SOS Colombia: sitio estático Next.js 16 + Supabase (Postgres, solo por funciones RPC).

## Modo y criticidad
- Producción, con un piloto/propuesta comercial en curso. Criticidad media-alta: hay datos de la organización y autenticación propia (PIN por comunidad, sesión por token, panel de la nutricionista), sin pagos. "Sin datos personales de los niños": PENDIENTE DE CONFIRMAR por Lucho (no sale de ningún archivo).
- ASVS 5.0.0: nivel 1 como base y nivel 2 en V6 (autenticación), V7 (sesiones) y V8 (autorización). Si Lucho confirma que hay datos personales, V14 (protección de datos) sube también a nivel 2.
- Desviación conocida: el PIN de comunidad (4 dígitos numéricos) no cumple 6.2.1 (mínimo 8 caracteres) ni 6.2.5 (sin límites de tipo de caracteres), ambos de nivel 1. Se mantiene por la comodidad de las colaboradoras (adultas mayores, entrada rápida y compartida por comunidad), con el control compensatorio de 5 intentos fallidos = 15 min de bloqueo por comunidad (`supabase/pin_rate_limit.sql`). No cambies el diseño del PIN ni el límite de intentos sin aprobación de Lucho, y señala esta desviación cada vez que una tarea toque autenticación.

## Comandos (verificados contra package.json y .github/workflows/ci.yml)
- Instalar: `npm ci` — Local: `npm run dev` (puerto 3000) — Build: `npm run build` (exporta a `out/`)
- Pruebas unitarias: `npm test` (= `vitest run tests/unit`)
- Integración (contra Supabase real, necesita `.env.local`; usa comunidades `ZZZ_TEST_*`): `npm run test:integration`
- Todas: `npm run test:all` — SQL en Postgres local desechable: `npm run test:db` (la configuración de esta máquina está en `CLAUDE.local.md`)
- Lint: `npm run lint` — Typecheck: no hay script; se usa `npx tsc --noEmit` (igual que el CI)
- No existen en este proyecto: formateo, análisis estático, pruebas end-to-end, herramienta de migraciones ni scripts de rollback (el SQL se corre a mano en el SQL Editor de Supabase, en el orden de `supabase/README.md`).
- Verificación previa a push (lo que corre el CI): `npx tsc --noEmit && npm run lint && npm test && npm run build`, más `npm run test:db` si cambió SQL. Sin `.env.local`, el build necesita `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` ficticias.

## Arquitectura
- Sitio 100 % estático (`output: "export"`, `public/_headers` con la CSP); sin servidor propio. Todo el acceso a datos es por RPC `security definer`; las tablas están cerradas (RLS) y el rol anon solo ejecuta funciones.
- Sesión por token (PIN de 4 dígitos por comunidad, bcrypt, bloqueo tras 5 intentos); la nutricionista entra a `/admin` con contraseña propia.
- No hay copia del esquema de producción y `kardex_records` se creó a mano (`supabase/README.md`): no asumas que el SQL del repo coincide con producción.
- El kardex y la lista de mercado viven en `src/components`, `src/hooks`, `src/lib`; los planes de cada módulo, en `planes/`; las pruebas, en `tests/` (`unit`, `integration`, `db`, `manual`).
- `KardexDashboard.tsx` solo orquesta: lo nuevo va en componentes, hooks o exportadores nuevos.
- Hosting: Vercel hoy (PENDIENTE DE CONFIRMAR por Lucho, no sale de ningún archivo); Cloudflare Pages planeado (`planes/010-hosting-estatico-cloudflare.md`).

## Zonas que requieren aprobación de Lucho antes de tocarlas
- SQL de producción: ningún script se corre en Supabase sin su OK; entrégaselo para que lo corra él.
- PIN, sesiones, tokens y rate limit; el panel `/admin` y sus funciones `admin_*`; políticas RLS y grants.
- Los scripts `lock_down_*`, `fixed_communities.sql` y todo lo que borre o reescriba datos.
- CI/CD (`.github/workflows`), `public/_headers`, `next.config.ts` y el hosting.
- Los interruptores `kardex_settings` (`closed_month_rule`, `server_chain`): están **apagados** en producción y no se encienden sin la Fase 2 del plan 013 y la aprobación de Lucho (planes/013, sección 15).
- Las reglas de negocio acordadas en `planes/` y la propuesta comercial.

## Convenciones
- Código, comentarios y documentación en español; commits en español con prefijo (`feat:`, `fix:`, `chore:`, `docs:`).
- Ramas por plan (`feature/...`); commit y push son aprobaciones separadas; el push va a `main` de los dos remotos (`luchoteso` y `origin`) por fast-forward.
- SQL: reglas en `.claude/rules/sql.md`.
- Los secretos solo en `.env.local` (valores con `#` entre comillas). No leer ni mostrar `.env*`.
- Pruebas de integración: solo escriben en comunidades `ZZZ_TEST_BORRAR_AUTO_*`; limpiar con `supabase/cleanup_test_data.sql`.
- Las personas que usan la app son adultas mayores: letra grande, contraste, avisos visibles y que se cierren al tocar.
