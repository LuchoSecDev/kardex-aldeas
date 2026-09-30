"use client";

import { useEffect, useState } from "react";

// La hora actual (en milisegundos), refrescada cada `everyMs`. Sirve para que
// avisos como "el plazo venció" cambien solos sin recargar la página y sin
// llamar a Date.now() mientras se pinta.
export function useNow(everyMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
