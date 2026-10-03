"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type AutoRetryStatus = "idle" | "saving" | "saved" | "error";

// Pausas entre reintentos automáticos mientras el guardado siga en error (la última se repite) y cuántos se hacen como máximo.
// Con 12 reintentos son unos 11 minutos; pasado ese tiempo ya solo se reintenta al volver la conexión, al volver a la pestaña o
// con el botón «Reintentar» (así un error que repetirlo no arregla, como uno de validación, no queda reintentándose para siempre).
export const AUTO_RETRY_DELAYS_MS = [15_000, 30_000, 60_000];
export const AUTO_RETRY_MAX = 12;

// «Sin conexión» según el navegador (eventos online/offline). Se lee con useSyncExternalStore para no desfasar la hidratación.
const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const getOffline = () => navigator.onLine === false;
const getOfflineOnServer = () => false;

// Recuperación automática de los cambios que no se pudieron guardar. Los cambios YA se conservan en la memoria de la página
// (la pantalla y la cola de guardado los recuerdan); esto se encarga de enviarlos solos sin que nadie pulse nada:
//   - al volver la conexión (evento «online»),
//   - al volver a la pestaña o a la ventana,
//   - y cada 15, 30 y luego 60 s mientras el navegador crea que hay internet pero el guardado siga fallando.
// Sin conexión no reintenta por reloj (sería inútil): espera el evento de reconexión.
//
// Devuelve `offline` (el navegador no tiene conexión) y `recovering` (hubo una falla y todavía no se logró guardar), que sirve
// para que el aviso rojo no parpadee mientras se reintenta.
export function useSaveAutoRetry(status: AutoRetryStatus, retry: () => void) {
  const offline = useSyncExternalStore(subscribeOnline, getOffline, getOfflineOnServer);

  // Se ajusta en el render (patrón de React para estado derivado): activo desde la primera falla hasta el próximo «guardado».
  const [recovering, setRecovering] = useState(false);
  if (status === "error" && !recovering) setRecovering(true);
  else if (status === "saved" && recovering) setRecovering(false);

  const retryRef = useRef(retry);
  const statusRef = useRef(status);
  const attempts = useRef(0);
  useEffect(() => {
    retryRef.current = retry;
    statusRef.current = status;
    if (status === "saved") attempts.current = 0;
  });

  // Reintento por reloj, solo con conexión y mientras el guardado esté en error.
  useEffect(() => {
    if (status !== "error" || offline || attempts.current >= AUTO_RETRY_MAX) return;
    const delay = AUTO_RETRY_DELAYS_MS[Math.min(attempts.current, AUTO_RETRY_DELAYS_MS.length - 1)];
    const timer = setTimeout(() => {
      attempts.current += 1;
      retryRef.current();
    }, delay);
    return () => clearTimeout(timer);
  }, [status, offline]);

  // Al volver la conexión: reintento inmediato.
  useEffect(() => {
    if (!offline && statusRef.current === "error") retryRef.current();
  }, [offline]);

  // Al volver a la pestaña o a la ventana: reintento inmediato (con conexión).
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState === "visible" && statusRef.current === "error" && navigator.onLine !== false) retryRef.current();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, []);

  return { offline, recovering };
}
