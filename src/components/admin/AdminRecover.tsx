"use client";

import { useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/components/admin/AdminPasswordForm";

export default function AdminRecover({
  isSubmitting,
  serverError,
  onSubmit,
  onCancel,
}: {
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (code: string, next: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
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
    onSubmit(code, next);
  };

  const error = localError || serverError;

  return (
    <div className="card admin-card">
      <h1 className="admin-title">Recuperar contraseña</h1>
      <p className="admin-lead">
        Escribe el código de recuperación que guardaste y elige una contraseña nueva.
        Si perdiste el código, pídele a quien administra el sistema que la restablezca.
      </p>

      <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-field">
          <label htmlFor="admin-code">Código de recuperación</label>
          <input
            id="admin-code"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="input-field"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </div>

        <div className="admin-field">
          <label htmlFor="admin-recover-new">Nueva contraseña</label>
          <input
            id="admin-recover-new"
            type="password"
            autoComplete="new-password"
            className="input-field"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <p className="admin-hint">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</p>
        </div>

        <div className="admin-field">
          <label htmlFor="admin-recover-confirm">Confirma la nueva contraseña</label>
          <input
            id="admin-recover-confirm"
            type="password"
            autoComplete="new-password"
            className="input-field"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p role="alert" className="admin-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting || !code.trim() || !next || !confirm}>
          {isSubmitting ? "Verificando..." : "Restablecer contraseña"}
        </button>

        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={isSubmitting}>
          Volver
        </button>
      </form>
    </div>
  );
}
