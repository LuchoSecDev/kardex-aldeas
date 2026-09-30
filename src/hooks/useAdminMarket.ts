"use client";

import { useCallback, useEffect, useState } from "react";
import { adminService } from "@/lib/adminService";
import { addDays } from "@/lib/marketCalendar";
import { adminDefaultWeekStart } from "@/lib/marketAdmin";
import type { AdminMarketList, AdminMarketOverview } from "@/types/market";

export type MarketFocus = { community: string; weekStart: string };

// Estado del panel de listas de mercado de la nutricionista: la semana elegida, el resumen
// de todas las comunidades y el detalle de la que se abre. `focus` viene de la campanita
// (abre esa semana y esa comunidad). Cada respuesta lleva la "llave" de su petición: si no
// coincide con la actual, todavía se está cargando (o se cambió de semana) y no se muestra.
export function useAdminMarket(focus: MarketFocus | null, onChanged?: () => void, externalReloadKey: number = 0) {
  const [weekStart, setWeekStart] = useState(() => focus?.weekStart ?? adminDefaultWeekStart(new Date()));
  const [openCommunity, setOpenCommunity] = useState<string | null>(focus?.community ?? null);
  const [reloadKey, setReloadKey] = useState(0);

  const [overview, setOverview] = useState<{ key: string; data: AdminMarketOverview | null; failed: boolean } | null>(null);
  const [detail, setDetail] = useState<{ key: string; data: AdminMarketList | null; failed: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // `externalReloadKey` cambia cuando algo fuera de esta pantalla (la campanita) modificó datos.
  const overviewKey = `${weekStart}|${reloadKey}|${externalReloadKey}`;
  useEffect(() => {
    let cancelled = false;
    adminService.marketOverview(weekStart).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error("Error cargando las listas de mercado:", error);
      setOverview({ key: overviewKey, data: data ?? null, failed: Boolean(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [weekStart, overviewKey]);

  const detailKey = openCommunity ? `${openCommunity}|${weekStart}|${reloadKey}|${externalReloadKey}` : null;
  useEffect(() => {
    if (!openCommunity || !detailKey) return;
    let cancelled = false;
    adminService.marketList(openCommunity, weekStart).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error("Error cargando la lista de la comunidad:", error);
      setDetail({ key: detailKey, data: data ?? null, failed: Boolean(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [openCommunity, weekStart, detailKey]);

  const markReviewed = useCallback(
    async (community: string) => {
      setReviewing(true);
      setReviewError(null);
      const { error } = await adminService.markMarketReviewed(community, weekStart);
      setReviewing(false);
      if (error) {
        if (!error.message?.includes("SESION_ADMIN_INVALIDA")) {
          console.error("Error marcando la lista como revisada:", error);
          setReviewError("No se pudo marcar como revisada. Inténtalo de nuevo.");
        }
        return;
      }
      setReloadKey((k) => k + 1);
      onChanged?.();
    },
    [weekStart, onChanged]
  );

  const current = overview && overview.key === overviewKey ? overview : null;
  const currentDetail = detail && detail.key === detailKey ? detail : null;

  return {
    weekStart,
    changeWeek: (next: string) => {
      setWeekStart(next);
      setOpenCommunity(null);
      setReviewError(null);
    },
    previousWeek: () => setWeekStart((w) => addDays(w, -7)),
    nextWeek: () => setWeekStart((w) => addDays(w, 7)),
    goToDefault: () => setWeekStart(adminDefaultWeekStart(new Date())),
    isDefaultWeek: weekStart === adminDefaultWeekStart(new Date()),
    overview: current?.data ?? null,
    isLoading: current === null,
    loadFailed: Boolean(current?.failed),
    reload: () => setReloadKey((k) => k + 1),
    openCommunity,
    openDetail: (community: string) => {
      setReviewError(null);
      setOpenCommunity(community);
    },
    closeDetail: () => setOpenCommunity(null),
    detail: currentDetail?.data ?? null,
    isLoadingDetail: Boolean(openCommunity) && currentDetail === null,
    detailFailed: Boolean(currentDetail?.failed),
    markReviewed,
    reviewing,
    reviewError,
  };
}
