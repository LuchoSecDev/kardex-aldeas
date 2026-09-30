# Checklist manual (antes de cada push a `main`)

Lo que las pruebas automáticas no pueden ver. Usa una comunidad `ZZZ_TEST_BORRAR_...`
(y luego límpiala con `supabase/cleanup_test_data.sql`). Márcalo en cada release.

Antes de empezar: `npx tsc --noEmit`, `npm run build`, `npm run test:all` en verde.

## Entrada y sesión
- [ ] Comunidad nueva: pide crear PIN + confirmarlo, y entra.
- [ ] Comunidad con PIN: pide el PIN; uno incorrecto muestra "PIN incorrecto."
- [ ] Tras 5 PIN incorrectos muestra "Demasiados intentos fallidos…"
- [ ] "Cambiar Comunidad" vuelve a la pantalla de entrada.
- [ ] Recargar la página pide el PIN otra vez.

## Registro diario
- [ ] Escribir una entrada y una salida (con decimal, ej. 1.5): el saldo se recalcula al instante.
- [ ] Debajo del título aparece "Guardando…" y luego "✓ Todos los cambios guardados".
- [ ] Recargar y volver a entrar: los datos siguen ahí.
- [ ] Salida mayor al saldo: suena/vibra la alerta de error de digitación.
- [ ] Ajuste de saldo (lápiz): pide motivo, actualiza el saldo y aparece en Historial → Ajustes.
- [ ] Historial → Meses: salta al mes elegido.
- [ ] Cambiar de semana, de categoría y de mes/año funciona.

## Fallos de red
- [ ] Sin internet (modo avión) al escribir: tras unos segundos aparece el aviso rojo con **Reintentar**.
- [ ] Al volver la red, **Reintentar** guarda y el aviso desaparece.
- [ ] Con el aviso visible, cerrar/recargar la pestaña pide confirmación.

## Enviar semana (comunidad)
- [ ] Debajo de la navegación aparece "Enviar semana N"; sin datos en esa semana avisa que no se puede enviar.
- [ ] Con datos: pide confirmación, envía y muestra "✓ enviada el …"; el botón de la semana marca ✓.
- [ ] Al editar esa semana después, aparece "⚠ … cambió después" (aviso y botón de semana); "Volver a enviar" lo limpia.
- [ ] El botón se bloquea mientras hay un guardado en curso.

## Panel de la nutricionista (`/admin`)
- [ ] Desde el inicio, el enlace pequeño "Acceso administrativo" abre el login; "← Volver al inicio" regresa.
- [ ] Contraseña temporal → obliga a crear una propia → muestra el código de recuperación una sola vez.
- [ ] "Olvidé mi contraseña" con el código funciona y entrega un código nuevo; 5 intentos fallidos bloquean 15 min.
- [ ] La tabla lista las comunidades con los colores de semana correctos y la leyenda.
- [ ] "Ver kardex" abre el kardex en solo lectura (sin lápiz ni edición); "Historial" muestra meses y ajustes; se puede cambiar de mes.
- [ ] "Excel" descarga el archivo de esa comunidad y mes; si falla la lectura, avisa y no descarga.
- [ ] Campanita: el contador y el título de la pestaña coinciden con los envíos sin revisar; "Ver kardex" abre esa semana; "Marcar revisada" lo saca de la lista.
- [ ] Si la comunidad cambia una semana ya revisada, vuelve a la campanita como modificada.
- [ ] En un teléfono real: el menú de la campanita cabe en pantalla y la tabla se desplaza dentro de su marco.

## Exportar
- [ ] Excel: descarga, 5 hojas por categoría, saldos correctos.
- [ ] PDF: descarga y se lee bien.

## Diseño
- [ ] Móvil 360 px: sin scroll horizontal de la página; la tabla se desplaza dentro de su marco; el aviso de error cabe.
- [ ] Escritorio: encabezado de la tabla fijo al desplazar.
- [ ] Alto contraste y tamaños de letra A / A+ / A++ se ven bien.

## Después de desplegar
- [ ] El sitio en vivo carga y se puede entrar y guardar con una comunidad de prueba.
- [ ] `npm run test:integration` en verde (confirma permisos de la base de datos).
- [ ] Limpiar datos de prueba: `supabase/cleanup_test_data.sql`.
