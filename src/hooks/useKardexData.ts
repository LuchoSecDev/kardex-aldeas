import { useState, useEffect, useCallback } from "react";
import { kardexService } from "@/lib/kardexService";
import type { KardexDataSource } from "@/lib/kardexDataSource";
import { computeCascade } from "@/lib/balanceEngine";
import { loadMonthState } from "@/lib/monthState";
import { Product } from "@/types/kardex";
import { useSaveQueue } from "@/hooks/useSaveQueue";

// `community` solo dispara la recarga al cambiar de comunidad: el servidor
// deduce la comunidad real del token de sesión (ver lib/session.ts).
// `dataSource` es de dónde se leen los datos: por defecto, los de la propia
// comunidad; el panel de la nutricionista pasa el suyo (solo lectura).
export function useKardexData(
  community: string,
  selectedYear: number,
  selectedMonth: number,
  products: Product[],
  dataSource: KardexDataSource = kardexService
) {
  const [isLoading, setIsLoading] = useState(true);

  const [exits, setExits] = useState<Record<string, number[]>>({});
  const [entries, setEntries] = useState<Record<string, number[]>>({});
  const [prevBalances, setPrevBalances] = useState<Record<string, number[]>>({});

  // Ajustes auditados vigentes de este mes: productId -> { weekIndex: saldo_nuevo }
  const [ajustesByProduct, setAjustesByProduct] = useState<Record<string, Record<number, number>>>({});
  // Saldo con el que cerró el mes anterior, por producto
  const [inheritedBase, setInheritedBase] = useState<Record<string, number>>({});

  // Si la carga falla, la pantalla NO debe dejar editar: los ceros que se
  // verían no son los datos reales y guardar encima los borraría.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      const { state, hasError } = await loadMonthState(dataSource, products, selectedYear, selectedMonth);
      // Si mientras cargaba se cambió de mes/comunidad, esta respuesta ya no aplica.
      if (cancelled) return;

      setExits(state.exits);
      setEntries(state.entries);
      setPrevBalances(state.prevBalances);
      setAjustesByProduct(state.ajustesByProduct);
      setInheritedBase(state.inheritedBase);
      setLoadError(hasError);
      setIsLoading(false);
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [community, selectedYear, selectedMonth, products, dataSource, reloadKey]);

  const { status: saveStatus, enqueue, retryFailed: retrySave } = useSaveQueue();

  const saveProductData = useCallback((productId: string, prodExits: number[], prodEntries: number[], prodPrev: number[]) => {
    return enqueue({
      year: selectedYear,
      month: selectedMonth,
      productId,
      exits: prodExits,
      entries: prodEntries,
      prevBalances: prodPrev,
    });
  }, [enqueue, selectedYear, selectedMonth]);

  const updateLocalState = useCallback((
    productId: string,
    newExitsArr: number[],
    newEntriesArr: number[]
  ) => {
    const base = inheritedBase[productId] ?? 0;
    const overrides = ajustesByProduct[productId] || {};
    const newPrevArr = computeCascade(base, overrides, newEntriesArr, newExitsArr);

    setExits(prev => ({ ...prev, [productId]: newExitsArr }));
    setEntries(prev => ({ ...prev, [productId]: newEntriesArr }));
    setPrevBalances(prev => ({ ...prev, [productId]: newPrevArr }));

    return newPrevArr;
  }, [inheritedBase, ajustesByProduct]);

  // Registra un ajuste auditado ya guardado en Supabase: actualiza el override
  // de esa semana y recalcula el encadenado local, sin recargar la página.
  const applyAjuste = useCallback((productId: string, weekIndex: number, newValue: number) => {
    const base = inheritedBase[productId] ?? 0;
    const newOverrides = { ...(ajustesByProduct[productId] || {}), [weekIndex]: newValue };
    const newPrevArr = computeCascade(base, newOverrides, entries[productId] || [], exits[productId] || []);

    setAjustesByProduct(prev => ({ ...prev, [productId]: newOverrides }));
    setPrevBalances(prev => ({ ...prev, [productId]: newPrevArr }));

    return newPrevArr;
  }, [inheritedBase, ajustesByProduct, entries, exits]);

  return {
    isLoading,
    loadError,
    reload,
    exits,
    entries,
    prevBalances,
    ajustesByProduct,
    inheritedBase,
    saveStatus,
    retrySave,
    saveProductData,
    updateLocalState,
    applyAjuste
  };
}
