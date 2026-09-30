"use client";

import { useState } from "react";

export default function AdminLogin({
  isSubmitting,
  error,
  notice,
  onSubmit,
  onForgot,
}: {
  isSubmitting: boolean;
  error: string | null;
  notice: string | null;
  onSubmit: (password: string) => void;
  onForgot: () => void;
}) {
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) onSubmit(password);
  };

  return (
    <div className="card admin-card">
      <h1 className="admin-title">Panel de la nutricionista</h1>
      <p className="admin-lead">Aldeas Infantiles SOS · Kardex Digital</p>

      {notice && <p role="status" className="admin-notice">{notice}</p>}

      <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-field">
          <label htmlFor="admin-password">Contraseña</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>

        {error && <p role="alert" className="admin-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting || !password}>
          {isSubmitting ? "Verificando..." : "Entrar"}
        </button>

        <button type="button" className="admin-link" onClick={onForgot} disabled={isSubmitting}>
          Olvidé mi contraseña
        </button>
      </form>
    </div>
  );
}
