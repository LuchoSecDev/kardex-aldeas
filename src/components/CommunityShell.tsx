"use client";

import "@/app/market.css";
import { useState } from "react";
import { createPortal } from "react-dom";
import ChangePinModal from "@/components/ChangePinModal";
import KardexDashboard from "@/components/KardexDashboard";
import MarketListDashboard, { type ReplyFocus } from "@/components/market/MarketListDashboard";
import ReplyBell from "@/components/market/ReplyBell";
import { useMarketReplies } from "@/hooks/useMarketReplies";
import type { MarketReplyNotification } from "@/types/market";

type View = "kardex" | "lista";

// Lo que ve una comunidad al entrar: el kardex y la lista de mercado, con un
// selector arriba. Las dos pantallas siguen montadas al cambiar de una a otra
// (solo se ocultan), así no se pierde el mes/semana elegidos ni se corta un
// guardado en curso. La lista de mercado se monta la primera vez que se abre.
export default function CommunityShell({ community, onLogout }: { community: string; onLogout: () => void }) {
  const [view, setView] = useState<View>("kardex");
  const [listOpened, setListOpened] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [focus, setFocus] = useState<ReplyFocus | undefined>(undefined);
  const { replies } = useMarketReplies();

  const select = (next: View) => {
    if (next === "lista") setListOpened(true);
    setView(next);
  };

  // Al tocar una respuesta de la campanita: se abre la lista de mercado en esa semana y ese tipo.
  const openReply = (reply: MarketReplyNotification) => {
    setListOpened(true);
    setView("lista");
    setFocus((current) => ({ weekStart: reply.week_start, kind: reply.kind, nonce: (current?.nonce ?? 0) + 1 }));
  };

  // La campanita vive en la barra azul de arriba (junto a «Accesibilidad visual»), igual que la de la nutricionista.
  const bellSlot = typeof document === "undefined" ? null : document.getElementById("a11y-bar-slot");

  return (
    <>
      {bellSlot && createPortal(<ReplyBell replies={replies} onOpen={openReply} />, bellSlot)}
      <div className="market-switch-wrap">
        <div className="market-switch" role="tablist" aria-label="Sección">
          <button
            type="button"
            role="tab"
            aria-selected={view === "kardex"}
            className={`btn btn-toggle ${view === "kardex" ? "btn-primary" : ""}`}
            onClick={() => select("kardex")}
          >
            Kardex
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "lista"}
            className={`btn btn-toggle ${view === "lista" ? "btn-primary" : ""}`}
            onClick={() => select("lista")}
          >
            Lista de mercado
          </button>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setPinOpen(true)}>
          Cambiar PIN
        </button>
      </div>

      {pinOpen && <ChangePinModal onClose={() => setPinOpen(false)} />}

      <div hidden={view !== "kardex"}>
        <KardexDashboard community={community} onLogout={onLogout} />
      </div>
      {listOpened && (
        <div hidden={view !== "lista"}>
          <MarketListDashboard community={community} onLogout={onLogout} focus={focus} />
        </div>
      )}
    </>
  );
}
