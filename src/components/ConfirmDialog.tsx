"use client";

import { useEffect, useRef, useId } from "react";

// Confirmación con el estilo de la app (reemplaza al window.confirm del navegador, que sale con otro diseño, otro idioma según el
// navegador y letra pequeña). Reutiliza el overlay y la tarjeta de los otros modales (kardex.css).
//
// - Esc cancela; tocar fuera NO cierra (un toque sin querer no debe cancelar ni confirmar nada).
// - El foco empieza en el botón SEGURO: «Cancelar» si la acción pierde algo (`danger`), el de confirmar si no; Tab da la vuelta entre
//   los dos botones y, al cerrar, el foco vuelve al botón que abrió el diálogo.
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    (danger ? cancelRef.current : confirmRef.current)?.focus();
    return () => opener?.focus?.();
  }, [danger]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="kardex-modal-overlay">
      <div className="card kardex-modal-card-sm" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}>
        <h3 id={`${id}-title`} className="kardex-confirm-title">
          {title}
        </h3>
        <div id={`${id}-desc`} className="kardex-modal-desc">
          {children}
        </div>
        <div className="kardex-form-actions">
          <button ref={cancelRef} type="button" className="btn btn-outline" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
