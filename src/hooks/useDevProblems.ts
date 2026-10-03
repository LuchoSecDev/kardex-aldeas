"use client";

import { useCallback, useEffect, useState } from "react";
import { devService } from "@/lib/devService";
import type { DevErrorGroup, DevErrorSummary, DevGroupKey } from "@/types/dev";

export const PERIODS = [
  { days: 1, label: "Últimas 24 horas" },
  { days: 7, label: "Últimos 7 días" },
  { days: 30, label: "Últimos 30 días" },
] as const;

// Los datos de la lista de problemas de /dev: resumen de arriba y grupos, con el periodo y el filtro «solo sin resolver».
// Se carga al entrar, al cambiar el filtro, con el botón «Actualizar» y al volver a la pestaña; no se recarga solo cada rato.
export function useDevProblems() {
  const [days, setDays] = useState<number>(7);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [summary, setSummary] = useState<DevErrorSummary | null>(null);
  const [groups, setGroups] = useState<DevErrorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  // Se sube con cada «Actualizar» o regreso a la pestaña para volver a cargar con el mismo filtro.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [s, g] = await Promise.all([devService.summary(), devService.groups(days, onlyOpen)]);
      if (cancelled) return;
      // Si la sesión venció, la página ya mandó a la persona al login: aquí no se muestra nada más.
      if (s.error || g.error) {
        setError("No se pudieron cargar los problemas. Revisa tu conexión e inténtalo de nuevo.");
      } else {
        setSummary(s.data);
        setGroups(g.data ?? []);
        setError(null);
        setLoadedAt(Date.now());
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [days, onlyOpen, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Marca un grupo como resuelto y recarga. Devuelve cuántos reportes cerró, o null si falló.
  const resolve = useCallback(
    async (group: DevGroupKey): Promise<number | null> => {
      const { data, error: rpcError } = await devService.resolve(group);
      if (rpcError) return null;
      refresh();
      return data ?? 0;
    },
    [refresh]
  );

  return { days, setDays, onlyOpen, setOnlyOpen, summary, groups, loading, error, loadedAt, refresh, resolve };
}
