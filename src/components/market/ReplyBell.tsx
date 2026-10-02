"use client";

import { useEffect, useRef, useState } from "react";
import { MARKET_KIND_LABEL, weekName } from "@/lib/marketCalendar";
import { timeAgo } from "@/lib/weekStatus";
import type { MarketReplyNotification } from "@/types/market";

// Campanita de la comunidad: respuestas de la nutricionista a los cambios que pidió en la lista de mercado y que aún no ha
// visto. Al tocar una, se abre esa lista (semana y tipo) donde la respuesta está junto a su nota.
export default function ReplyBell({
  replies,
  onOpen,
}: {
  replies: MarketReplyNotification[];
  onOpen: (reply: MarketReplyNotification) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = replies.length;

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
    <div className="reply-bell" ref={containerRef}>
      <button
        type="button"
        className="reply-bell-btn"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-label={count === 0 ? "Respuestas de la nutricionista: no hay nuevas" : `Respuestas de la nutricionista: ${count} ${count === 1 ? "nueva" : "nuevas"}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && <span className="reply-bell-badge">{count}</span>}
      </button>

      {isOpen && (
        <div className="reply-bell-menu card" role="dialog" aria-label="Respuestas de la nutricionista">
          <h2 className="reply-bell-title">Respuestas de la nutricionista</h2>
          {count === 0 ? (
            <p className="reply-bell-empty">No tienes respuestas nuevas.</p>
          ) : (
            <ul className="reply-bell-list">
              {replies.map((r) => (
                <li key={`${r.week_start}|${r.kind}|${r.change_id}`} className="reply-bell-item">
                  <div className="reply-bell-where">
                    {MARKET_KIND_LABEL[r.kind]} · {weekName(r.week_start)}
                    {r.item_name ? ` · ${r.item_name}` : ""} · {timeAgo(r.replied_at)}
                  </div>
                  <div className="reply-bell-note">Tu cambio: «{r.change_text}»</div>
                  <div className="reply-bell-answer">Respuesta: {r.reply_text}</div>
                  <button type="button" className="btn btn-primary" onClick={() => { setIsOpen(false); onOpen(r); }}>
                    Ver en la lista
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
