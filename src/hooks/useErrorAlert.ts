import { useState, useEffect, useRef, useCallback } from "react";

export function useErrorAlert() {
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorCheckTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Beep corto de alerta, sintetizado con Web Audio
  const playErrorBeep = useCallback(() => {
    try {
      type WindowWithWebkitAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 440;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.35);
      oscillator.onended = () => ctx.close();
    } catch (e) {
      console.error("No se pudo reproducir el sonido de alerta:", e);
    }
  }, []);

  // Timer para borrar el toast automáticamente
  useEffect(() => {
    if (!errorToast) return;
    const timer = setTimeout(() => setErrorToast(null), 5000);
    return () => clearTimeout(timer);
  }, [errorToast]);

  // Espera a que la persona haga una pausa (600ms) antes de avisar, para no
  // sonar en cada tecla mientras se escribe un número de varias cifras. La
  // llave incluye la semana para que revisar otra semana del mismo producto
  // no cancele un aviso pendiente de esta.
  const scheduleErrorCheck = useCallback((productId: string, productName: string, weekIndex: number, newBalance: number) => {
    const key = `${productId}-${weekIndex}`;
    if (errorCheckTimers.current[key]) {
      clearTimeout(errorCheckTimers.current[key]);
    }
    if (newBalance < 0) {
      errorCheckTimers.current[key] = setTimeout(() => {
        delete errorCheckTimers.current[key];
        setErrorToast(`⚠️ ${productName} — el saldo de la Semana ${weekIndex + 1} quedó en ${newBalance}. Revisa las salidas.`);
        playErrorBeep();
      }, 600);
    }
  }, [playErrorBeep]);

  return {
    errorToast,
    setErrorToast,
    scheduleErrorCheck,
  };
}
