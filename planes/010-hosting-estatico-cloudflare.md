# 010 — Sitio estático y migración a Cloudflare Pages

**Estado:** 🚧 El código está listo y probado en local (2026-10-01). **Falta que Lucho cree la cuenta y el proyecto en Cloudflare** (no se puede automatizar: crear cuentas es cosa de la persona) y publicar. Debe quedar hecho **antes del primer cobro** (Vercel gratis no permite uso comercial).
**Rama:** `feature/hosting-estatico`  **Fecha:** 2026-10-01

## Objetivo

Que lo único que se pague sea la base de datos (Supabase). La app no necesita servidor: el navegador habla directo con
Supabase. Se publica como **archivos estáticos** en un hosting gratuito.

## Qué se hizo

| Cambio | Para qué |
|---|---|
| `next.config.ts`: `output: "export"` | `npm run build` deja `out/` con HTML, JS y CSS (3 MB), sin código de servidor. Verificado: no hay claves secretas en el resultado. |
| `public/_headers` | Cabeceras de seguridad que Cloudflare Pages aplica solo: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` y una **política de contenido (CSP)** que solo deja cargar lo propio, la tipografía Inter de Google Fonts y las llamadas a `*.supabase.co`. Sin `unsafe-eval`. Además `noindex` en `/admin` y caché de un año para `/_next/static/*`. |
| Se borraron las 5 imágenes de plantilla de `public/` | Nadie las usaba. |
| CI: comprueba que el build deje `out/index.html` y `out/admin.html` | Para que un cambio que rompa la exportación estática se vea de inmediato. |
| `tests/unit/staticExport.test.ts` | Falla si alguien agrega algo que exige servidor (rutas API, acciones de servidor, cookies/headers, middleware) o si se debilitan las cabeceras. |

**Verificado en un navegador real** sirviendo `out/` con las cabeceras aplicadas (como lo haría Cloudflare): entrar a una comunidad con su PIN contra Supabase, abrir el kardex, descargar Excel y PDF, agregar un cambio en la lista de mercado y abrir `/admin` (con su `noindex`): **cero violaciones de la política de contenido y cero errores en la consola**; la tipografía Inter carga.

## Pasos de Lucho en Cloudflare (una sola vez)

1. Crear una cuenta en Cloudflare (gratis) con un correo que controles tú.
2. *Workers & Pages → Create → Pages → Connect to Git* y dar acceso al repositorio `kardex-aldeas` (el repo es privado: Cloudflare te pide instalar su app en GitHub solo para ese repo).
3. Configuración de compilación:
   - **Framework preset:** Next.js (Static HTML Export)
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
   - **Rama de producción:** `main`
4. *Environment variables* (las mismas de `.env.local`; son públicas por diseño, la clave `anon`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_VERSION` *(opcional, plan 007)*: el hash corto del commit o un número de versión (letras, números, `.`, `_` y `-`). Viaja en cada aviso de error para ligarlo a un despliegue; en Vercel se toma solo, en Cloudflare Pages hay que ponerlo a mano. Sin él queda «local».
   - `NODE_VERSION` = `22`
   (**No** pongas `PROVISION_KEY` ni ninguna contraseña: el sitio no las necesita y todo lo que empieza por `NEXT_PUBLIC_` queda visible en el navegador.)
5. Esperar el primer despliegue y abrir la dirección `*.pages.dev` que te da Cloudflare. Probar con el checklist manual (entrar con una comunidad de prueba, enviar una lista, descargar un Excel, abrir `/admin`).
6. Si quieren un dominio propio: *Custom domains* en el mismo proyecto.
7. Cuando todo funcione, **cambiar el enlace que se les da a las colaboradoras** y apagar el proyecto de Vercel.

## Riesgos y pendientes

- El plan gratuito de Cloudflare Pages tiene límites (por ejemplo, un número de compilaciones al mes) que alcanzan de sobra para este uso, pero conviene confirmarlos en su página al crear el proyecto: pueden haber cambiado.
- Si Cloudflare cambia o retira «Pages» en favor de otra opción de la misma empresa para sitios estáticos, los archivos de `out/` y `_headers` se pueden publicar igual allí.
- Las variables `NEXT_PUBLIC_*` se incrustan en el momento de compilar: si algún día se cambia de proyecto de Supabase hay que volver a desplegar.
- La política de contenido permite scripts «inline» (los necesita Next para arrancar un sitio estático). Si se quiere endurecer más, hay que pasar a hashes por script (más trabajo, y se rompe en cada actualización de Next).
- Vercel no lee `_headers`: mientras el sitio siga publicado allí, esas cabeceras no se aplican (el sitio funciona igual).
