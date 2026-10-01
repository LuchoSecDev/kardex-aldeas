# Checklist manual (antes de cada push a `main`)

Lo que las pruebas automáticas no pueden ver. Usa una comunidad `ZZZ_TEST_BORRAR_...`
(y luego límpiala con `supabase/cleanup_test_data.sql`). Márcalo en cada release.

Antes de empezar: `npx tsc --noEmit`, `npm run build`, `npm run test:all` en verde.

## Entrada y sesión
- [ ] La pantalla de entrada es un selector con las 8 comunidades: no se puede escribir un nombre nuevo ni crear comunidades.
- [ ] Elegir una comunidad pide solo el PIN (sin «Confirma el PIN» ni «Omitir»); uno incorrecto muestra "PIN incorrecto."
- [ ] «Cambiar PIN» (arriba a la derecha, en Kardex y en Lista de mercado) abre el diálogo: pide PIN actual, nuevo y confirmación; con 0000 o 1234 avisa que es fácil de adivinar; con un PIN actual equivocado avisa; con datos correctos muestra «✓ Tu PIN se cambió».
- [ ] Tras cambiarlo: «Cambiar Comunidad» y volver a entrar con el PIN NUEVO funciona y con el anterior no (probar con una comunidad ZZZ_TEST_, nunca con una real).
- [ ] Una comunidad sin PIN avisa «todavía no tiene PIN…» y no entra.
- [ ] Sin internet, la pantalla de entrada avisa que no cargó la lista y «Reintentar» la vuelve a pedir.
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

## Zona de cambios de la lista de mercado (plan 008)
- [ ] En la lista de mercado, cada producto tiene un 📝; al tocarlo se abre «Cambios del pedido de …» con ese producto elegido y el cursor listo para escribir.
- [ ] Agregar «cambiar pescado por pechuga» (con y sin producto): aparece en la lista de cambios, el contador sube y «Guardando…» termina en «✓ Todos los cambios guardados»; al recargar y volver a entrar la nota sigue.
- [ ] Editar y quitar una nota funcionan; con 20 notas el campo se bloquea y avisa.
- [ ] Al enviar, la confirmación dice cuántos cambios lleva cada tipo.
- [ ] Como nutricionista: en la tabla de la semana aparece «📝 n cambios»; en «Ver lista» el bloque «Cambios solicitados» sale sobre los productos del tipo; en «Consolidado» salen agrupados por comunidad.
- [ ] En el Excel de una comunidad el producto lleva una nota de celda (triángulo rojo) y hay una hoja «CAMBIOS»; el consolidado trae la hoja «Cambios». Ábrelos en Excel.
- [ ] Celular de 360 px: sin scroll horizontal y los botones se pueden tocar sin errar.

## Semana 6 de cierre (meses que no caben en 5 semanas: marzo, agosto y noviembre de 2026)
- [ ] Marzo 2026 muestra **Sem 6 (cierre)**; septiembre 2026 (y los demás meses que caben) **no** la muestran.
- [ ] En la Sem 6 solo están habilitados el **30 y el 31** (y su **entrada**); los demás días y números salen deshabilitados, con el aviso de «Cierre del mes».
- [ ] El saldo anterior de la Sem 6 sale solo del cierre de la Sem 5; registrar el 30 y 31 recalcula su saldo final.
- [ ] Abril hereda como saldo anterior el cierre de marzo **después** de la Sem 6 (compararlo con la hoja de papel).
- [ ] «Enviar semana 6» funciona y la nutricionista la ve (chip S6, campanita, resumen semanal «Sem 6 (cierre)»).
- [ ] Excel y PDF de marzo traen «SEMANA 6 (CIERRE)» con el 30 y 31; los meses que caben siguen con 5 semanas.
- [ ] Un mes ya guardado antes de este cambio (p. ej. febrero) se abre igual que antes y se puede seguir editando.

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
- [ ] **Consolidado:** suma lo **enviado** por producto entre comunidades (comparar 2 o 3 a mano); dice qué comunidades entran, cuáles faltan y cuáles tienen cambios sin enviar; «Ver (n)» muestra el detalle por comunidad; el buscador funciona.
- [ ] «Descargar Excel consolidado» baja `Lista_de_mercado_consolidado_SemanaN_Mes_Año.xlsx` con hoja de Resumen y una hoja por tipo (total + una columna por comunidad); **sin precios**.
- [ ] En el detalle de una comunidad, «Descargar Excel (formato actual)» baja un libro con las hojas CARNES, FRUVER, ABARROTES y ASEO: encabezado (casa, semana, mes, participantes), **todos** los productos y la cantidad pedida (0 en los demás). Compararlo con el Excel que mandaban por correo.

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

## Rendimiento (después de correr perf_1.sql y perf_2.sql)
- [ ] Con una semana enviada: editar un número de esa semana → sigue apareciendo «modificada» (en la comunidad y en la campanita/panel de la nutricionista).
- [ ] Volver a dejar el número como estaba → deja de aparecer «modificada».
- [ ] La campanita de la nutricionista sigue mostrando los envíos sin revisar y, al revisarlos, desaparecen.

## Después de desplegar
- [ ] El sitio en vivo carga y se puede entrar y guardar con una comunidad de prueba.
- [ ] `npm run test:integration` en verde (confirma permisos de la base de datos).
- [ ] Limpiar datos de prueba: `supabase/cleanup_test_data.sql`.
