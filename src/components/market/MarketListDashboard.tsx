"use client";

import "@/app/kardex.css";
import "@/app/market.css";
import { useEffect, useRef } from "react";
import SaveStatus from "@/components/SaveStatus";
import { useToast } from "@/components/toast/ToastProvider";
import { useSaveRecoveryToast } from "@/hooks/useSaveRecoveryToast";
import MarketItemsPanel from "@/components/market/MarketItemsPanel";
import MarketParticipants from "@/components/market/MarketParticipants";
import MarketSubmitBar from "@/components/market/MarketSubmitBar";
import MarketWeekPicker from "@/components/market/MarketWeekPicker";
import { useMarketList } from "@/hooks/useMarketList";
import { useNow } from "@/hooks/useNow";
import { upcomingOrderFriday, weekStartOfFriday, type MarketKind } from "@/lib/marketCalendar";

// La campanita de respuestas pide abrir una semana y un tipo (`nonce` cambia cada vez que se toca una respuesta).
export type ReplyFocus = { weekStart: string; kind: MarketKind; nonce: number };

// Lista de mercado de la comunidad (plan 003): la que antes se llenaba en un Excel
// y se mandaba por correo los viernes antes de las 5 pm.
export default function MarketListDashboard({
  community,
  onLogout,
  focus,
}: {
  community: string;
  onLogout: () => void;
  focus?: ReplyFocus;
}) {
  const market = useMarketList();
  const now = useNow();
  const toast = useToast();

  // Lo que la persona hizo a mano (enviar la lista, guardar los participantes) y su resultado, además del mensaje fijo de la pantalla.
  const message = market.message;
  useEffect(() => {
    if (!message) return;
    if (message.kind === "ok") toast.success(message.text);
    else toast.error(message.text);
  }, [message, toast]);
  useSaveRecoveryToast(market.saveStatus);

  // Si la campanita pide abrir una semana, se cambia a ella (el tipo lo abre el panel de productos).
  const { changeWeek } = market;
  const appliedFocus = useRef(0);
  useEffect(() => {
    if (!focus || focus.nonce === appliedFocus.current) return;
    appliedFocus.current = focus.nonce;
    changeWeek(focus.weekStart);
  }, [focus, changeWeek]);

  // Con cambios sin guardar, el navegador pregunta antes de cerrar o recargar.
  useEffect(() => {
    if (!market.hasUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [market.hasUnsaved]);

  const handleLogout = () => {
    if (market.hasUnsaved && !window.confirm("Hay cambios que todavía no se han guardado. Si sales ahora se perderán. ¿Salir de todos modos?")) return;
    onLogout();
  };

  const isUpcoming = market.weekStart === weekStartOfFriday(upcomingOrderFriday(new Date(now)));
  const participants = market.week?.participants ?? null;
  // Sin datos cargados (o con error) los campos se bloquean: lo que se vería no sería lo real.
  const locked = market.isLoading || market.loadError;

  return (
    <div className="kardex-page market-page">
      <div className="card kardex-header-card">
        <div>
          <h2 className="kardex-header-title">Lista de mercado · Comunidad {community}</h2>
          <SaveStatus status={market.saveStatus} onRetry={market.retrySave} />
        </div>
        <div className="kardex-header-actions">
          <button className="btn btn-outline" onClick={handleLogout}>Cambiar Comunidad</button>
        </div>
      </div>

      <MarketWeekPicker
        weekStart={market.weekStart}
        friday={market.friday}
        kindsDue={market.kindsDue}
        deadlineAt={market.deadlineAt}
        isUpcoming={isUpcoming}
        now={now}
        onChange={market.changeWeek}
        onGoToUpcoming={market.goToUpcoming}
      />

      {market.loadError && (
        <div role="alert" className="kardex-save-banner">
          <span>
            <strong>No se pudo cargar la lista de esta semana.</strong>{" "}
            Los campos quedan bloqueados para no sobrescribir nada. Revisa tu conexión.
          </span>
          <button type="button" className="btn kardex-save-banner-btn" onClick={market.reload}>Reintentar</button>
        </div>
      )}

      {!market.loadError && !market.isLoading && (
        <MarketParticipants participants={participants} isSaving={market.isSavingParticipants} onSave={market.saveParticipants} />
      )}

      <MarketItemsPanel
        itemsByKind={market.itemsByKind}
        drafts={market.drafts}
        kindsDue={market.kindsDue}
        disabled={locked}
        onQuantityChange={market.setQuantity}
        changes={market.changes}
        onAddChange={(kind, itemId, text) => {
          const problem = market.addChange(kind, itemId, text);
          if (!problem) toast.success("Cambio agregado a la lista.");
          return problem;
        }}
        onUpdateChange={(kind, id, text) => {
          const problem = market.updateChange(kind, id, text);
          if (!problem) toast.success("Cambio actualizado.");
          return problem;
        }}
        onRemoveChange={(kind, id) => {
          market.removeChange(kind, id);
          toast.success("Cambio quitado de la lista.");
        }}
        replies={market.replies}
        onRepliesSeen={market.markRepliesSeen}
        focusKind={{ kind: focus?.kind ?? null, nonce: focus?.nonce ?? 0 }}
      />

      <MarketSubmitBar
        week={locked ? null : market.week}
        drafts={market.drafts}
        changes={market.changes}
        saveStatus={market.saveStatus}
        isSubmitting={market.isSubmitting}
        message={market.message}
        onSubmit={market.submit}
      />
    </div>
  );
}
