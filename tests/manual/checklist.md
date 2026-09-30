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
