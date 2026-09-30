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

## Lista de mercado (comunidad)
- [ ] Arriba aparece el selector **Kardex | Lista de mercado**; cambiar de uno a otro no pierde el mes/semana del kardex.
- [ ] La lista abre en la **semana del próximo pedido** (p. ej. entre semana: la del lunes que viene) con su rótulo («Semana 2 de octubre · 5 oct – 11 oct»), el viernes de pedido y el plazo (5:00 p. m.).
- [ ] Los botones ← → cambian de semana; «Ir a la semana del próximo pedido» solo aparece cuando estás en otra.
- [ ] Una comunidad sin participantes los pide (y no deja enviar sin ellos); con participantes, «Cambiar (llegó o se fue alguien)» permite editarlos.
- [ ] Cada pestaña (Fruver y lácteos, Carnes, Abarrotes, Aseo) muestra sus productos; dice si ese viernes **sí o no toca** ese tipo; el contador verde cuenta lo pedido.
- [ ] Escribir una cantidad (con coma, p. ej. 2,5): «Guardando…» y luego «✓ Todos los cambios guardados»; al recargar y volver a entrar, sigue ahí.
- [ ] No deja escribir letras; el buscador encuentra sin importar tildes (p. ej. «limon» → LIMÓN).
- [ ] Sin internet: tras unos segundos aparece el aviso rojo con **Reintentar**, y el botón de enviar queda bloqueado hasta que se guarde.
- [ ] «Enviar lista de la semana» pide confirmación con el resumen por tipo y muestra «✓ Enviada el … (a tiempo)». Un envío después del plazo dice «(después del plazo)».
- [ ] Editar después de enviar muestra «⚠ … cambiaste algo después» y el botón pasa a «Volver a enviar la lista».
- [ ] En un teléfono real (360 px): la página no se desliza hacia los lados, las 4 pestañas caben en 2 columnas y el teclado de las cantidades es numérico con coma.

## Listas de mercado (panel de la nutricionista)
- [ ] La pestaña **Listas de mercado** abre la semana de las listas más recientes (desde el viernes 5 p. m. hasta el martes en la tarde; luego, la del próximo pedido) y muestra su plazo.
- [ ] Los botones ← → cambian de semana; «Ir a la semana más reciente» vuelve.
- [ ] La línea de arriba dice cuántas enviaron, cuántas por revisar, cuántas tarde y **cuántas faltan (plazo vencido)**; antes del plazo no hay «faltan», solo «aún con tiempo».
- [ ] Cada comunidad muestra su estado (Aún sin enviar / Falta por enviar / Por revisar / Revisada), «Tarde», «Llenando» y «cambios sin enviar» cuando corresponde.
- [ ] Los números por tipo son los productos **enviados** (no el borrador); «—» si ese viernes no tocaba el tipo.
- [ ] «Ver lista» (solo con envío) muestra solo lo pedido por tipo, con unidad y cantidad, **sin precios**; avisa si la comunidad cambió algo después de enviar.
- [ ] «Marcar revisada» la pasa a Revisada, baja el contador de la campanita y actualiza el resumen.
- [ ] Si la comunidad reenvía **con cambios**, vuelve a «Por revisar» y a la campanita; si reenvía **sin cambios**, sigue revisada.
- [ ] La campanita mezcla semanas del kardex y listas de mercado («Lista de mercado · Semana N de mes»); «Ver lista» abre esa comunidad y semana.
- [ ] En un teléfono real: la tabla se desliza dentro de su marco y el detalle se lee bien.

## Panel de la nutricionista (`/admin`)
- [ ] Desde el inicio, el enlace pequeño "Acceso administrativo" abre el login; "← Volver al inicio" regresa.
- [ ] Contraseña temporal → obliga a crear una propia → muestra el código de recuperación una sola vez.
- [ ] "Olvidé mi contraseña" con el código funciona y entrega un código nuevo; 5 intentos fallidos bloquean 15 min.
- [ ] La tabla lista las comunidades con los colores de semana correctos y la leyenda.
- [ ] "Ver kardex" abre el kardex en solo lectura (sin lápiz ni edición); "Historial" muestra meses y ajustes; se puede cambiar de mes.
- [ ] "Excel" descarga el archivo de esa comunidad y mes; si falla la lectura, avisa y no descarga.
- [ ] Campanita (esquina izquierda de la barra azul, junto a "Accesibilidad visual"): el contador y el título de la pestaña coinciden con los envíos sin revisar; se ve también dentro del kardex de una comunidad; el menú se abre justo debajo de ella; "Ver kardex" abre esa semana; "Marcar revisada" lo saca de la lista.
- [ ] Si la comunidad cambia una semana ya revisada, vuelve a la campanita como modificada.
- [ ] En un teléfono real: el menú de la campanita cabe en pantalla y la tabla se desplaza dentro de su marco.
- [ ] En el teléfono, al deslizar la tabla de comunidades hasta el final, **la página no se desliza** más allá de la tabla (solo se mueve el marco de la tabla). Mismo control en "Ver kardex".

## Resumen semanal (panel de la nutricionista, pestaña «Resumen semanal»)
- [ ] Por defecto muestra la semana de hoy con su rango de fechas; los botones Sem 1–5 cambian de semana.
- [ ] Con «Solo las comunidades que ya enviaron esta semana» activado, incluye únicamente las que enviaron, y la línea de arriba nombra cuáles entran y cuáles **faltan**.
- [ ] Desactivar el interruptor incluye a todas las comunidades con datos y avisa que pueden estar incompletas.
- [ ] Los totales cuadran con la suma a mano de 2 o 3 productos (saldo anterior + entradas − salidas = saldo final); el saldo negativo sale en rojo.
- [ ] «Ver (n)» despliega el detalle por comunidad y «Ocultar» lo cierra.
- [ ] El buscador y el filtro de categoría reducen la lista; sin coincidencias avisa.
- [ ] Una semana sin envíos muestra el mensaje y el botón «Ver también las comunidades que no han enviado».
- [ ] «Descargar Excel» baja `Resumen_SemanaN_Mes_Año.xlsx` con dos hojas (Resumen y Detalle por comunidad) y las comunidades incluidas en el encabezado.
- [ ] En el celular, la página no se desliza más allá de la tabla y el detalle desplegable se lee bien.

## Exportar
- [ ] Excel: descarga, 5 hojas por categoría, saldos correctos.
- [ ] PDF: descarga y se lee bien.

## Diseño
- [ ] Móvil 360 px: sin scroll horizontal de la página; la tabla se desplaza dentro de su marco; el aviso de error cabe.
- [ ] Escritorio y portátil (≥ 1080 px de ancho): la tabla del kardex usa el scroll de la **página** y ocupa todo el alto de la pantalla; el encabezado de la tabla queda fijo arriba al desplazar. Probar también con un portátil de 14" (≈ 1280×620 útiles).
- [ ] Ventana angosta o celular (< 1080 px): la tabla conserva su marco con scroll propio y el encabezado sigue fijo dentro de él.
- [ ] Panel de la nutricionista (≥ 860 px): el encabezado de la tabla de comunidades queda fijo al desplazar la página.
- [ ] Alto contraste y tamaños de letra A / A+ / A++ se ven bien.

## Después de desplegar
- [ ] El sitio en vivo carga y se puede entrar y guardar con una comunidad de prueba.
- [ ] `npm run test:integration` en verde (confirma permisos de la base de datos).
- [ ] Limpiar datos de prueba: `supabase/cleanup_test_data.sql`.
