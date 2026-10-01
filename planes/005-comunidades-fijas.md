# 005 — Comunidades fijas (cierre de la creación libre)

**Estado:** 🚧 Programada y probada en local (2026-10-01); **falta correr el SQL en Supabase y desplegar** (orden en «Despliegue»).
**Rama:** `feature/comunidades-fijas`  **Fecha:** 2026-10-01

## Objetivo

Hasta ahora cualquiera que abriera la web podía **crear una comunidad** (con `create_community_with_pin`) o
**quedarse con el PIN** de una que no lo tuviera (`claim_pin_for_existing_community`), y una comunidad sin PIN
entraba sin pedirlo. Eso permitía llenar el panel de la nutricionista de comunidades basura y entrar a Fortaleza
(que no tenía PIN). Como la organización tiene **8 comunidades fijas**, este plan las precarga con su PIN y cierra
las tres puertas.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Las 8 comunidades | Maná, Fortaleza, Shalom, Renacer, Casa Blanca, Esmeralda, Leones y Primavera (los nombres del desplegable «Casa» del Excel de la lista de mercado; Maná se conserva con tilde porque así está en la base con sus datos). | El Excel original solo trae esas 8 y coincide con las 8 de la propuesta. |
| Quién crea comunidades | Solo quien tenga acceso al SQL Editor (tú), o un script con la **clave de aprovisionamiento**. Una novena comunidad se agrega con `provision_community` o con un `insert` en el SQL Editor. | Es la «guía de operación» que promete la propuesta; no hay pantalla de altas porque no hace falta con 8 comunidades. |
| PIN iniciales | `fixed_communities.sql` genera un PIN aleatorio de 4 dígitos **solo a las que no tienen** y lo muestra **una vez** (en la base queda el hash bcrypt). Maná conserva el suyo. | No quedan PIN escritos en archivos ni en el repositorio. |
| Pruebas | Las pruebas de integración crean comunidades `ZZZ_TEST_…` con `provision_community(clave, …)`. La clave (`PROVISION_KEY`) vive en `.env.local`, su hash en `community_provision_key` (sha-256, como los tokens de sesión). | Mantiene las pruebas contra Supabase real sin dejar una puerta abierta en producción. La clave es de 256 bits: no se adivina; se compara con sha-256 (barato) y no con bcrypt para que una ráfaga de intentos no consuma CPU. |
| Comunidad sin PIN | `login_community` devuelve `null` si no hay PIN guardado (antes entraba). La pantalla muestra «todavía no tiene PIN… pídele a la administradora». | Cierra el acceso de Fortaleza y de cualquier comunidad futura sin PIN. |
| Pantalla de entrada | Selector con la lista (no se puede escribir un nombre nuevo). `PinGate` solo pide el PIN: se quitaron los modos «crear» y «reclamar» y `CommunityCombobox`. Si no carga la lista, avisa y permite **Reintentar** (antes quedaba vacía). | Menos pasos para las colaboradoras y sin posibilidad de duplicados por escribir mal el nombre. |

## Diseño

- `supabase/fixed_communities.sql` — aditivo e idempotente: crea las 8 que falten y pone PIN solo a las que no lo tengan; devuelve la tabla `comunidad | pin`.
- `supabase/lock_down_community_creation_1.sql` — tabla `community_provision_key` (cerrada a `anon`), función `provision_community(p_key, p_name, p_pin)` y `revoke execute` de `create_community_with_pin` y `claim_pin_for_existing_community`.
- `supabase/lock_down_community_creation_2.sql` — `login_community` exige PIN guardado.
- App: `src/app/page.tsx`, `src/components/PinGate.tsx`, `kardexService` (sin crear/reclamar), estilos `.home-select`.

## Fases

- [x] **Fase A — SQL y pruebas.** `tests/db/community_creation.test.sql` (con 5 mutaciones comprobadas: `grant` de las funciones cerradas, `provision_community` sin comprobar la clave, `login` sin PIN y clave legible por `anon`), y los otros 4 `tests/db/*.test.sql` ahora crean sus comunidades con `provision_community`.
- [x] **Fase B — Pantalla.** `tests/unit/homePage.test.tsx` (9 pruebas, con 2 mutaciones comprobadas) y verificación en navegador (escritorio y 360 px, sin scroll horizontal ni errores de consola; la lista real mostró solo Fortaleza y Maná, y Fortaleza avisó «todavía no tiene PIN»).
- [ ] **Fase C — Producción.** Correr el SQL, desplegar, correr `npm run test:integration` (incluye `community-creation.test.ts`) y el checklist manual.

## Despliegue

**Orden obligatorio** (la app anterior seguía ofreciendo «crear comunidad»):

1. En el SQL Editor corre `supabase/fixed_communities.sql`. **Anota la tabla de PIN** (se ve una sola vez) y entrégale a cada comunidad el suyo. Es aditivo: la app actual sigue funcionando.
2. Merge a `main` y push (con tu visto bueno); espera a que Vercel termine.
3. Corre `supabase/lock_down_community_creation_1.sql`. Luego define la clave de aprovisionamiento con el `insert` que está en los comentarios del propio archivo (una clave larga y aleatoria) y guárdala en `.env.local` como `PROVISION_KEY=…`.
4. Corre `supabase/lock_down_community_creation_2.sql`.
5. `npm run test:integration` y el checklist manual (sección «Entrada y sesión»); limpia con `supabase/cleanup_test_data.sql`.

**Reversa** (solo si algo sale mal): `grant execute on function create_community_with_pin(text, text), claim_pin_for_existing_community(text, text) to anon;` y volver a correr la definición de `login_community` de `session_access.sql`.

## PIN que no se vieron

`fixed_communities.sql` solo le pone PIN a las comunidades que **no tienen** y los muestra una sola vez. Si se corre dos veces, 
la segunda no devuelve filas («No rows returned») y los PIN de la primera ya no se pueden ver (en la base solo queda el hash). 
Para generar otros: primero mira cuáles tienen datos y luego quítales el PIN SOLO a las que no (Maná nunca):

```sql
select c.name, c.has_pin, (select count(*) from kardex_records k where k.community = c.name) as registros
from communities c order by c.name;

update communities set pin_hash = null
 where name in ('Fortaleza','Shalom','Renacer','Casa Blanca','Esmeralda','Leones','Primavera')
   and not exists (select 1 from kardex_records k where k.community = communities.name);
```

Después se vuelve a correr `fixed_communities.sql` completo y esta vez sí muestra la tabla.

## Riesgos y pendientes

- Si en el paso 3 se corre el SQL antes de desplegar, la app anterior (que aún ofrece «crear») fallaría con «No se pudo crear la comunidad» en ese flujo; no se pierde nada, pero por eso el orden.
- Si alguna comunidad pierde su PIN, se resetea desde el SQL Editor (`community_pin.sql` trae la instrucción) y vuelve a quedar sin acceso hasta que se le ponga uno: ya no puede «reclamarlo» cualquiera.
- Si en la base aparecen otras comunidades que no son las 8 (con otro nombre o con errores de tipeo), el script no las borra: revísalas con `select name, has_pin from communities;` antes de eliminar nada (puede tener datos en `kardex_records`).
- La clave `PROVISION_KEY` hay que guardarla (gestor de contraseñas): si se pierde se define otra con el mismo `insert`.
- **Si la clave lleva `#` o `$`, va entre comillas dobles en `.env.local`** (`PROVISION_KEY="tu-clave"`): sin comillas, el `#` empieza un comentario y el valor queda vacío o cortado (las pruebas dicen que falta la clave). Lo más simple es una clave solo con letras y números.
