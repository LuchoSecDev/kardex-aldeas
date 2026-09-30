"use client";

import "@/app/market.css";
import { useState } from "react";
import KardexDashboard from "@/components/KardexDashboard";
import MarketListDashboard from "@/components/market/MarketListDashboard";

type View = "kardex" | "lista";

// Lo que ve una comunidad al entrar: el kardex y la lista de mercado, con un
// selector arriba. Las dos pantallas siguen montadas al cambiar de una a otra
// (solo se ocultan), así no se pierde el mes/semana elegidos ni se corta un
// guardado en curso. La lista de mercado se monta la primera vez que se abre.
export default function CommunityShell({ community, onLogout }: { community: string; onLogout: () => void }) {
  const [view, setView] = useState<View>("kardex");
  const [listOpened, setListOpened] = useState(false);

  const select = (next: View) => {
    if (next === "lista") setListOpened(true);
    setView(next);
  };

  return (
    <>
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
      </div>

      <div hidden={view !== "kardex"}>
        <KardexDashboard community={community} onLogout={onLogout} />
      </div>
      {listOpened && (
        <div hidden={view !== "lista"}>
          <MarketListDashboard community={community} onLogout={onLogout} />
        </div>
      )}
    </>
  );
}
