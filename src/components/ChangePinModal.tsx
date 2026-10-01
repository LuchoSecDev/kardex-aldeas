"use client";

import { useEffect, useState } from "react";
import { kardexService } from "@/lib/kardexService";
import { WRONG_CURRENT_PIN_MESSAGE, onlyPinDigits, pinChangeErrorMessage, validatePinChange } from "@/lib/pin";

const pinInputStyle = { textAlign: "center", fontSize: "1.5rem", letterSpacing: "0.5rem" } as const;

// La comunidad cambia su propio PIN: pide el actual y el nuevo (dos veces). El servidor vuelve a comprobar todo
// (supabase/change_pin.sql): un PIN actual equivocado cuenta como intento fallido, igual que al entrar.
export default function ChangePinModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isSubmitting, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validatePinChange(current, next, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const { data, error: rpcError } = await kardexService.changePin(current, next);
    setIsSubmitting(false);

    if (rpcError) {
      setError(pinChangeErrorMessage(rpcError));
    } else if (data !== true) {
      setError(WRONG_CURRENT_PIN_MESSAGE);
    } else {
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    }
  };

  return (
    <div className="kardex-modal-overlay">
      <div className="card kardex-modal-card-sm" role="dialog" aria-modal="true" aria-labelledby="change-pin-title">
        <h3 id="change-pin-title">Cambiar PIN</h3>

        {done ? (
          <>
            <p role="status" className="kardex-modal-desc">
              <strong>✓ Tu PIN se cambió.</strong> Desde ahora entra con el PIN nuevo. Anótalo en un lugar seguro: si lo
              olvidas, la administradora puede asignarte uno nuevo.
            </p>
            <div className="kardex-form-actions">
              <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="kardex-modal-desc">
              Escribe tu PIN actual y elige uno nuevo de 4 dígitos. Evita los fáciles de adivinar, como 0000 o 1234.
            </p>
            <form onSubmit={handleSubmit} className="kardex-form">
              <div>
                <label htmlFor="pin-actual" className="kardex-form-label">PIN actual</label>
                <input
                  id="pin-actual"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  className="input-field"
                  style={pinInputStyle}
                  value={current}
                  onChange={(e) => setCurrent(onlyPinDigits(e.target.value))}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="pin-nuevo" className="kardex-form-label">PIN nuevo</label>
                <input
                  id="pin-nuevo"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  className="input-field"
                  style={pinInputStyle}
                  value={next}
                  onChange={(e) => setNext(onlyPinDigits(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="pin-confirmar" className="kardex-form-label">Confirma el PIN nuevo</label>
                <input
                  id="pin-confirmar"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  className="input-field"
                  style={pinInputStyle}
                  value={confirm}
                  onChange={(e) => setConfirm(onlyPinDigits(e.target.value))}
                />
              </div>

              {error && (
                <p role="alert" style={{ color: "var(--color-accent-red)", fontWeight: 600, margin: 0 }}>
                  {error}
                </p>
              )}

              <div className="kardex-form-actions">
                <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Cambiando..." : "Cambiar PIN"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
