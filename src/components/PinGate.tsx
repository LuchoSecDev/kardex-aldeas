"use client";

import { useState } from "react";

export type PinGateMode = "create" | "verify" | "claim";

const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 4);

export default function PinGate({
  community,
  mode,
  isSubmitting,
  serverError,
  onSubmitPin,
  onSkipClaim,
  onCancel,
}: {
  community: string;
  mode: PinGateMode;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmitPin: (pin: string) => void;
  onSkipClaim: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const needsConfirm = mode === "create" || mode === "claim";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (pin.length !== 4) {
      setLocalError("El PIN debe tener 4 dígitos.");
      return;
    }
    if (needsConfirm && pin !== confirmPin) {
      setLocalError("Los dos PIN no coinciden.");
      return;
    }
    onSubmitPin(pin);
  };

  const error = localError || serverError;

  return (
    <div className="card" style={{ maxWidth: "500px", width: "100%", textAlign: "center" }}>
      <h2 style={{ color: "var(--color-primary-dark)", marginBottom: "0.5rem" }}>
        {mode === "verify" && "Ingresa el PIN"}
        {mode === "create" && "Crea un PIN"}
        {mode === "claim" && "Esta comunidad no tiene PIN todavía"}
      </h2>

      <p style={{ marginBottom: "1.5rem", color: "var(--color-text-muted)" }}>
        {mode === "verify" && (
          <>Comunidad <strong>{community}</strong> — escribe su PIN de 4 dígitos para entrar.</>
        )}
        {mode === "create" && (
          <>Comunidad <strong>{community}</strong> es nueva. Crea un PIN de 4 dígitos: solo quien lo conozca podrá volver a entrar a editarla.</>
        )}
        {mode === "claim" && (
          <>Comunidad <strong>{community}</strong> ya existe pero todavía nadie le puso un PIN. Puedes crearle uno ahora, o seguir sin PIN por ahora.</>
        )}
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

        {needsConfirm && (
          <div style={{ textAlign: "left" }}>
            <label htmlFor="confirmPin" style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold" }}>
              Confirma el PIN
            </label>
            <input
              id="confirmPin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="input-field"
              style={{ textAlign: "center", fontSize: "1.5rem", letterSpacing: "0.5rem" }}
              value={confirmPin}
              onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
            />
          </div>
        )}

        {error && (
          <p role="alert" style={{ color: "var(--color-accent-red)", fontWeight: 600, margin: 0 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ fontSize: "1.1rem", padding: "0.9rem" }}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Verificando..."
            : mode === "verify" ? "Entrar" : mode === "create" ? "Crear PIN y entrar" : "Crear PIN ahora"}
        </button>

        {mode === "claim" && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={onSkipClaim}
            disabled={isSubmitting}
          >
            Omitir por ahora, entrar sin PIN
          </button>
        )}

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
