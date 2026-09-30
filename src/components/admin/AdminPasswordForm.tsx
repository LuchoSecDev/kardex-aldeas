"use client";

import { useState } from "react";

export const MIN_PASSWORD_LENGTH = 10;

// "forced": primer ingreso con la contraseña temporal (no se pide la actual:
// ya la escribió para entrar). "voluntary": cambio desde el panel.
export default function AdminPasswordForm({
  mode,
  isSubmitting,
  serverError,
  onSubmit,
  onCancel,
}: {
  mode: "forced" | "voluntary";
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (current: string, next: string) => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (next.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (next !== confirm) {
      setLocalError("Las dos contraseñas nuevas no coinciden.");
      return;
    }
    if (mode === "voluntary" && next === current) {
      setLocalError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }
    onSubmit(current, next);
  };

  const error = localError || serverError;

  return (
    <div className="card admin-card">
      <h1 className="admin-title">{mode === "forced" ? "Crea tu contraseña" : "Cambiar contraseña"}</h1>
      <p className="admin-lead">
        {mode === "forced"
          ? "Estás entrando con una contraseña temporal. Elige una propia para continuar."
          : "Al cambiarla se cerrarán las demás sesiones abiertas."}
      </p>

      <form onSubmit={handleSubmit} className="admin-form">
        {mode === "voluntary" && (
          <div className="admin-field">
            <label htmlFor="admin-current">Contraseña actual</label>
            <input
              id="admin-current"
              type="password"
              autoComplete="current-password"
              className="input-field"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="admin-field">
          <label htmlFor="admin-new">Nueva contraseña</label>
          <input
            id="admin-new"
            type="password"
            autoComplete="new-password"
            className="input-field"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoFocus={mode === "forced"}
          />
          <p className="admin-hint">Mínimo {MIN_PASSWORD_LENGTH} caracteres. Una frase fácil de recordar funciona bien.</p>
        </div>

        <div className="admin-field">
          <label htmlFor="admin-confirm">Confirma la nueva contraseña</label>
          <input
            id="admin-confirm"
            type="password"
            autoComplete="new-password"
            className="input-field"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p role="alert" className="admin-error">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting || !next || !confirm || (mode === "voluntary" && !current)}
        >
          {isSubmitting ? "Guardando..." : "Guardar contraseña"}
        </button>

        {onCancel && (
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </button>
        )}
      </form>
    </div>
  );
}
