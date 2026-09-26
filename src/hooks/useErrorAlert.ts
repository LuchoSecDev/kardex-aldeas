import { useState, useEffect, useRef, useCallback } from "react";

export function useErrorAlert() {
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorCheckTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Doble beep + vibración corta. El audio generado desde una página web en
  // Android sale por el volumen de "medios", no por el de notificaciones, así
  // que por más fuerte que se programe puede sonar débil si el usuario tiene
  // ese volumen bajo. La vibración es el respaldo real: no depende de ningún
  // volumen y funciona con el teléfono en silencio (no existe en iOS/Safari,
  // que nunca implementó la Vibration API — ahí sigue dependiendo del sonido).
  const triggerAlertFeedback = useCallback(() => {
    try {
      type WindowWithWebkitAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      const playTone = (startOffset: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = 880;
        const start = ctx.currentTime + startOffset;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.8, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.16);
      };

      playTone(0);
      playTone(0.2);

      setTimeout(() => ctx.close(), 500);
    } catch (e) {
      console.error("No se pudo reproducir el sonido de alerta:", e);
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([80, 60, 80]);
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
        triggerAlertFeedback();
      }, 600);
    }
  }, [triggerAlertFeedback]);

  return {
    errorToast,
    setErrorToast,
    scheduleErrorCheck,
  };
}
