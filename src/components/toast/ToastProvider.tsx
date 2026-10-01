"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Avisos de confirmación («toasts») para las acciones que la persona hace a mano: enviar la lista, descargar un Excel,
// corregir un saldo... Pensados para personas mayores: letra grande (sigue el tamaño A+/A++), color y ✓/⚠ además del
// texto, solo visuales, y se cierran TOCANDO el aviso (sin una X que atinar). Éxitos y avisos duran 5 segundos; los
// errores se quedan hasta que se toquen, para que no se pierdan.
export type ToastKind = "success" | "warning" | "error";

export const TOAST_DURATION_MS = 5000;
// Cuántos avisos se ven a la vez: si llegan más, desaparece el más viejo.
export const MAX_TOASTS = 3;

type ToastItemData = { id: number; kind: ToastKind; text: string };

export interface ToastApi {
  success: (text: string) => void;
  warning: (text: string) => void;
  error: (text: string) => void;
}

// Sin proveedor (p. ej. una pantalla probada sola) los avisos simplemente no se muestran.
const noop = () => {};
const NOOP_API: ToastApi = { success: noop, warning: noop, error: noop };

const ToastContext = createContext<ToastApi>(NOOP_API);

export const useToast = () => useContext(ToastContext);

const ICON: Record<ToastKind, string> = { success: "✓", warning: "⚠", error: "⚠" };

function ToastItem({ toast, onDismiss }: { toast: ToastItemData; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toast.kind === "error") return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast.id, toast.kind, onDismiss]);

  return (
    <button type="button" className={`toast toast--${toast.kind}`} onClick={() => onDismiss(toast.id)}>
      <span className="toast-icon" aria-hidden="true">{ICON[toast.kind]}</span>
      <span className="toast-body">
        <span className="toast-text">{toast.text}</span>
        <span className="toast-hint">Toca para cerrar</span>
      </span>
    </button>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItemData[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  const show = useCallback((kind: ToastKind, text: string) => {
    setToasts((current) => {
      // El mismo aviso otra vez (p. ej. dos descargas seguidas) no se apila: se reemplaza y vuelve a contar los 5 segundos.
      const others = current.filter((t) => !(t.kind === kind && t.text === text));
      return [...others, { id: nextId.current++, kind, text }].slice(-MAX_TOASTS);
    });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => show("success", text),
      warning: (text) => show("warning", text),
      error: (text) => show("error", text),
    }),
    [show]
  );

  const polite = toasts.filter((t) => t.kind !== "error");
  const assertive = toasts.filter((t) => t.kind === "error");

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        {/* Las dos zonas existen siempre (aunque vacías) para que los lectores de pantalla anuncien lo que llegue. */}
        <div className="toast-stack" role="status" aria-live="polite">
          {polite.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>
        <div className="toast-stack" role="alert" aria-live="assertive">
          {assertive.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
