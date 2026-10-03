"use client";

import { useState } from "react";

// Entrada a /dev. Sin enlace de «olvidé mi contraseña» (la cuenta del desarrollador no tiene código de recuperación: se restablece con
// supabase/dev_reset_password.sql) y sin enlace de regreso: la pantalla no se enlaza desde ninguna parte.
export default function DevLogin({
  isSubmitting,
  error,
  notice,
  onSubmit,
}: {
  isSubmitting: boolean;
  error: string | null;
  notice: string | null;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) onSubmit(password);
  };

  return (
    <div className="card admin-card">
      <h1 className="admin-title">Panel del desarrollador</h1>
      <p className="admin-lead">Kardex Digital</p>

      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-field">
          <label htmlFor="dev-password">Contraseña</label>
          <input
            id="dev-password"
            type="password"
            autoComplete="current-password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>

        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting || !password}>
          {isSubmitting ? "Verificando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
