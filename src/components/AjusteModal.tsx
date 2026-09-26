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
    <div className="kardex-modal-overlay">
      <div className="card kardex-modal-card-sm">
        <h3>{isBootstrap ? "Registrar saldo inicial" : "Corregir saldo"}</h3>
        <p className="kardex-modal-subtitle">
          {product.name} — Semana {currentWeek}
        </p>
        <p className="kardex-modal-desc">
          {isBootstrap
            ? "Aún no hay saldo registrado para este producto en esta comunidad."
            : <>Saldo calculado actualmente: <strong>{currentBalance}</strong></>}
        </p>
        <form onSubmit={onSubmit} className="kardex-form">
          <div>
            <label className="kardex-form-label">
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
            <label className="kardex-form-label">
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
          <div className="kardex-form-actions">
            <button
              type="button"
              className="btn btn-outline"
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
