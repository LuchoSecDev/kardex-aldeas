"use client";

import { Product } from "@/types/kardex";

export default function AjusteModal({
  product,
  currentWeek,
  currentBalance,
  isBootstrap,
  value,
  motivo,
  isSubmitting,
  onValueChange,
  onMotivoChange,
  onSubmit,
  onClose,
}: {
  product: Product;
  currentWeek: number;
  currentBalance: number;
  isBootstrap: boolean;
  value: string;
  motivo: string;
  isSubmitting: boolean;
  onValueChange: (value: string) => void;
  onMotivoChange: (motivo: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div className="card" style={{ maxWidth: "440px", width: "100%" }}>
        <h3 style={{ marginTop: 0 }}>{isBootstrap ? "Registrar saldo inicial" : "Corregir saldo"}</h3>
        <p style={{ color: "var(--color-text-muted)", marginTop: "-0.5rem" }}>
          {product.name} — Semana {currentWeek}
        </p>
        <p style={{ marginBottom: "1rem" }}>
          {isBootstrap
            ? "Aún no hay saldo registrado para este producto en esta comunidad."
            : <>Saldo calculado actualmente: <strong>{currentBalance}</strong></>}
        </p>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold" }}>
              Saldo real (conteo físico)
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              className="input-field"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold" }}>
              Motivo del ajuste
            </label>
            <input
              type="text"
              className="input-field"
              value={motivo}
              onChange={(e) => onMotivoChange(e.target.value)}
              placeholder="Ej: conteo físico, producto dañado, donación no registrada..."
              required
            />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              style={{ border: "2px solid var(--color-border)" }}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar ajuste"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
