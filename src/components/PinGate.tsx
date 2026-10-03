"use client";

import { useState } from "react";

const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 4);

// Pide el PIN de una comunidad que ya existe. Las comunidades son fijas (las crea
// la administración, con su PIN): aquí ya no se crean comunidades ni se asignan PIN.
export default function PinGate({
  community,
  isSubmitting,
  serverError,
  onSubmitPin,
  onCancel,
}: {
  community: string;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmitPin: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (pin.length !== 4) {
      setLocalError("El PIN debe tener 4 dígitos.");
      return;
    }
    onSubmitPin(pin);
  };

  const error = localError || serverError;

  return (
    <div className="card" style={{ maxWidth: "500px", width: "100%", textAlign: "center" }}>
      <h2 style={{ color: "var(--color-primary-text)", marginBottom: "0.5rem" }}>Ingresa el PIN</h2>

      <p style={{ marginBottom: "1.5rem", color: "var(--color-text-muted)" }}>
        Comunidad <strong>{community}</strong> — escribe su PIN de 4 dígitos para entrar.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ textAlign: "left" }}>
          <label htmlFor="pin" style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold" }}>
            PIN (4 dígitos)
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            className="input-field"
            style={{ textAlign: "center", fontSize: "1.5rem", letterSpacing: "0.5rem" }}
            value={pin}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
            autoFocus
          />
        </div>

        {error && (
          <p role="alert" style={{ color: "var(--color-accent-red-text)", fontWeight: 600, margin: 0 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ fontSize: "1.1rem", padding: "0.9rem" }}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Verificando..." : "Entrar"}
        </button>

        <button
          type="button"
          className="btn btn-outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cambiar de comunidad
        </button>
      </form>
    </div>
  );
}
