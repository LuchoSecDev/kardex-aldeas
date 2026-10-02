"use client";

import { useEffect, useState } from "react";

// Cuánto hay que bajar para que aparezca el botón: no estorba al inicio de la página, pero sale en cuanto la persona se
// aleja (una pantalla de kardex o de lista de mercado es larga y el último producto queda lejos del menú).
export const SCROLL_TOP_THRESHOLD_PX = 400;

// Flecha fija abajo a la derecha para volver al principio de un toque, sin deslizar toda la página con el dedo o la rueda.
// Está en el layout, así que sirve en todas las pantallas. Respeta «reducir movimiento»: en ese caso salta sin animación.
export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Sin una lectura inicial a propósito: al recargar, el navegador restaura la posición y dispara «scroll».
    const onScroll = () => setVisible(window.scrollY > SCROLL_TOP_THRESHOLD_PX);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  const goTop = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button type="button" className="scroll-top-btn" onClick={goTop} aria-label="Volver arriba" title="Volver arriba">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
