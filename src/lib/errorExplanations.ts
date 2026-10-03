// Explicaciones en lenguaje natural de los fallos que el navegador reporta (plan 007): qué significa cada uno, si hay datos en
// riesgo y qué hacer. Lo usa la pantalla /dev.
//
// El bloque de abajo (desde `export type Explanation` hasta `explain`) es una COPIA LITERAL del de la función de alertas
// (supabase/functions/dev-alert/index.ts), que se pega entera en el editor de Supabase y por eso no puede importar de aquí.
// tests/unit/errorExplanations.test.ts comprueba que las dos copias sean idénticas: si cambias una, cambia la otra.

export type Explanation = { what: string; risk: string; action: string };

const RELOAD = "Pedir que recarguen la página. Si se repite, revisar el internet de la casa o avisarme.";
const NO_RISK_LOAD = "No se perdió nada; solo no se ve en pantalla hasta que se recargue.";

export const EXPLANATIONS: Record<string, Explanation> = {
  kardex_save_product: {
    what: "No se pudo guardar un cambio del kardex.",
    risk: "Lo que escribió la colaboradora podría no haberse guardado.",
    action: "Pedir que revisen que el cambio quedó (la pantalla muestra un aviso rojo de «no se pudo guardar» con un botón para reintentar). Si se repite, revisar el internet de la casa.",
  },
  kardex_load_month: { what: "No se pudo cargar el kardex de un mes.", risk: "No se perdió nada: la pantalla puede quedar vacía o bloqueada hasta que se recargue.", action: RELOAD },
  kardex_load_ajustes: { what: "No se pudieron cargar las correcciones de saldo.", risk: NO_RISK_LOAD, action: RELOAD },
  kardex_load_ajustes_history: { what: "No se pudo cargar el historial de correcciones de saldo.", risk: NO_RISK_LOAD, action: RELOAD },
  kardex_months_with_data: { what: "No se pudo cargar la lista de meses con datos.", risk: "No se perdió nada; el selector de meses puede verse incompleto.", action: RELOAD },
  kardex_week_submissions: { what: "No se pudo consultar qué semanas ya se enviaron.", risk: "No se perdió nada; los marcadores de «enviada» pueden no verse bien.", action: RELOAD },
  kardex_submit_week: {
    what: "No se pudo enviar la semana a la nutricionista.",
    risk: "La nutricionista no verá esa semana hasta que se envíe de nuevo.",
    action: "Pedir que vuelvan a pulsar «Enviar semana».",
  },
  kardex_insert_ajuste: {
    what: "No se pudo registrar una corrección de saldo.",
    risk: "La corrección no quedó guardada: el saldo sigue como estaba.",
    action: "Pedir que la repitan.",
  },
  change_community_pin: { what: "No se pudo cambiar el PIN de la casa.", risk: "El PIN no cambió: sigue siendo el anterior.", action: "Pedir que lo intenten de nuevo." },
  market_catalog: { what: "No se pudo cargar la lista de productos del pedido.", risk: "No se perdió nada; no se puede armar el pedido hasta que cargue.", action: RELOAD },
  market_list_load: { what: "No se pudo cargar la lista de mercado de una semana.", risk: NO_RISK_LOAD, action: RELOAD },
  market_list_save: {
    what: "No se pudo guardar lo que la casa marcó para el pedido.",
    risk: "Las cantidades que marcó podrían no haberse guardado.",
    action: "Pedir que revisen la lista antes de enviarla.",
  },
  market_list_save_changes: {
    what: "No se pudo guardar una nota de cambio del pedido.",
    risk: "La nota podría no haberse guardado.",
    action: "Pedir que la revisen antes de enviar la lista.",
  },
  market_replies_unseen: {
    what: "No se pudo consultar las respuestas de la nutricionista (la campanita).",
    risk: "Sin riesgo: solo puede tardar en aparecer el aviso de una respuesta.",
    action: RELOAD,
  },
  market_replies_mark_seen: {
    what: "No se pudo marcar una respuesta como leída.",
    risk: "Sin riesgo: la campanita puede seguir mostrándola.",
    action: RELOAD,
  },
  market_set_participants: {
    what: "No se pudo guardar el número de participantes.",
    risk: "El número podría no haberse guardado.",
    action: "Pedir que lo revisen en la lista de mercado.",
  },
  market_list_submit: {
    what: "No se pudo enviar el pedido semanal.",
    risk: "La nutricionista no recibirá ese pedido hasta que se envíe de nuevo. Ojo con el plazo del viernes.",
    action: "Pedir que vuelvan a pulsar «Enviar lista de la semana».",
  },
  "window.onerror": {
    what: "Una pantalla de la app tuvo un fallo inesperado.",
    risk: "Algo puede no verse o no responder; lo que ya estaba guardado no se pierde.",
    action: "Pedir que recarguen la página. Si se repite, es un fallo de la app que debo revisar.",
  },
  "window.unhandledrejection": {
    what: "Una acción de la app falló sin avisar en pantalla.",
    risk: "Puede que una acción no se haya completado.",
    action: "Pedir que recarguen la página. Si se repite, es un fallo de la app que debo revisar.",
  },
};

export const GENERIC_EXPLANATION: Explanation = {
  what: "Una operación de la app falló.",
  risk: "No se sabe qué parte quedó sin guardar.",
  action: "Avisarme para revisarlo.",
};

// Por qué pasó, según el nivel y el código: sin código de base de datos es que la llamada ni llegó al servidor (internet).
export function causeOf(r: { level: string; code?: string | null }): string {
  if (r.level === "warning") return "Parece un problema de conexión a internet: la llamada no llegó al servidor.";
  if (r.code === "P0001") return "El servidor rechazó los datos que mandó la app. Es un posible fallo de la app, no de internet.";
  if (r.code) return `Supabase respondió con un error (código ${r.code}).`;
  return "Fallo inesperado dentro de la app.";
}

export function explain(r: { community: string; fn: string; level: string; code?: string | null }) {
  const e = Object.prototype.hasOwnProperty.call(EXPLANATIONS, r.fn) ? EXPLANATIONS[r.fn] : GENERIC_EXPLANATION;
  return { title: `${r.community}: ${e.what}`, what: e.what, cause: causeOf(r), risk: e.risk, action: e.action };
}
