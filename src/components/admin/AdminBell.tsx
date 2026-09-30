"use client";

import { useEffect, useRef, useState } from "react";
import { marketKey } from "@/lib/marketAdmin";
import { weekName } from "@/lib/marketCalendar";
import { MONTH_NAMES, timeAgo } from "@/lib/weekStatus";
import type { AdminMarketNotification } from "@/types/market";
import type { AdminNotification } from "@/types/submissions";

// Campanita: envíos de semana del kardex y listas de mercado sin revisar (o modificados
// después del envío), del más reciente al más antiguo.
export default function AdminBell({
  notifications,
  marketNotifications = [],
  loadFailed,
  reviewingId,
  reviewError,
  onOpen,
  onReview,
  onOpenMarket,
  onReviewMarket,
}: {
  notifications: AdminNotification[];
  marketNotifications?: AdminMarketNotification[];
  loadFailed: boolean;
  reviewingId: string | null;
  reviewError: string | null;
  onOpen: (notification: AdminNotification) => void;
  onReview: (id: string) => void;
  onOpenMarket?: (notification: AdminMarketNotification) => void;
  onReviewMarket?: (notification: AdminMarketNotification) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = notifications.length + marketNotifications.length;

  // Las dos clases de aviso en una sola lista, ordenada por fecha de envío (recientes primero).
  const items = [
    ...notifications.map((n) => ({ type: "kardex" as const, at: n.submitted_at, n })),
    ...marketNotifications.map((n) => ({ type: "market" as const, at: n.submitted_at, n })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Cierra el menú al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  return (
    <div className="admin-bell" ref={containerRef}>
      <button
        type="button"
        className="admin-bell-btn"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-label={count === 0 ? "Notificaciones: no hay envíos pendientes" : `Notificaciones: ${count} envío${count === 1 ? "" : "s"} por revisar`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && <span className="admin-bell-badge">{count}</span>}
      </button>

      {isOpen && (
        <div className="admin-bell-menu card" role="dialog" aria-label="Envíos de semana por revisar">
          <h2 className="admin-bell-title">Envíos por revisar</h2>

          {loadFailed && (
            <p role="alert" className="admin-error">No se pudieron actualizar las notificaciones.</p>
          )}
          {reviewError && <p role="alert" className="admin-error">{reviewError}</p>}

          {count === 0 ? (
            <p className="admin-lead admin-bell-empty">No hay envíos pendientes de revisión.</p>
          ) : (
            <ul className="admin-bell-list">
              {items.map((item) => {
                if (item.type === "market") {
                  const m = item.n;
                  return (
                    <li key={marketKey(m)} className="admin-bell-item">
                      <div>
                        <strong>{m.community}</strong> · Lista de mercado · {weekName(m.week_start)}
                        <div className="admin-bell-sub">
                          {m.late ? "Enviada tarde" : "Enviada"}
                          {m.submit_count > 1 ? " (reenviada)" : ""} · {timeAgo(m.submitted_at)}
                        </div>
                      </div>
                      <div className="admin-row-actions">
                        <button type="button" className="btn btn-primary" onClick={() => { setIsOpen(false); onOpenMarket?.(m); }}>
                          Ver lista
                        </button>
                        <button type="button" className="btn btn-outline" onClick={() => onReviewMarket?.(m)} disabled={reviewingId !== null}>
                          {reviewingId === marketKey(m) ? "Marcando…" : "Marcar revisada"}
                        </button>
                      </div>
                    </li>
                  );
                }
                const n = item.n;
                return (
                  <li key={n.id} className="admin-bell-item">
                    <div>
                      <strong>{n.community}</strong> · Semana {n.week_index + 1} de {MONTH_NAMES[n.month]} {n.year}
                      <div className={n.modified ? "admin-bell-sub admin-bell-sub--warn" : "admin-bell-sub"}>
                        {n.modified ? "⚠ Modificada tras el envío" : "Enviada"}
                        {n.submit_count > 1 ? " (reenviada)" : ""} · {timeAgo(n.submitted_at)}
                      </div>
                    </div>
                    <div className="admin-row-actions">
                      <button type="button" className="btn btn-primary" onClick={() => { setIsOpen(false); onOpen(n); }}>
                        Ver kardex
                      </button>
                      <button type="button" className="btn btn-outline" onClick={() => onReview(n.id)} disabled={reviewingId !== null}>
                        {reviewingId === n.id ? "Marcando…" : "Marcar revisada"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
