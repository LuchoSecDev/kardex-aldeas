"use client";

import { useEffect } from "react";

// En una casilla numérica con el cursor adentro, girar la rueda del mouse (o deslizar dos dedos en el panel táctil de un
// portátil) CAMBIA el número sin querer: el kardex pasaba de 3 a 3,5 con solo hacer scroll. Aquí, si la rueda se mueve
// sobre una casilla numérica que está escrita en ese momento, se la «suelta» (blur) justo antes de que el navegador la
// cambie: el número se queda quieto y la página hace scroll con normalidad. Para seguir escribiendo basta tocar la casilla.
// Protege todas las casillas numéricas de la app (kardex y corrección de saldo) y las que se agreguen después.
export default function NumberWheelGuard() {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "number" && document.activeElement === target) {
        target.blur();
      }
    };
    // Fase de captura: corre antes que la acción por defecto del navegador, que es la que cambia el valor.
    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  return null;
}
