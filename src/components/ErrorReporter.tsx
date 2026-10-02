"use client";

import { useEffect } from "react";
import { appErrors } from "@/lib/appErrors";

// Escucha los errores no capturados de la página (window.onerror y promesas rechazadas) y los manda al desarrollador
// (plan 007). No dibuja nada. Está en el layout, así que cubre todas las pantallas.
export default function ErrorReporter() {
  useEffect(() => appErrors.installGlobalHandlers(window), []);
  return null;
}
