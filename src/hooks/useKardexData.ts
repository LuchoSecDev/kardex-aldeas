import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { kardexService } from "@/lib/kardexService";
import type { KardexDataSource } from "@/lib/kardexDataSource";
import { computeCascade } from "@/lib/balanceEngine";
import { loadMonthState } from "@/lib/monthState";
import { Product } from "@/types/kardex";
import { useSaveQueue, type SaveVersioning } from "@/hooks/useSaveQueue";

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

  // Control de versión (plan 012): la versión (updated_at, texto) que la pantalla conoce de cada producto y mes. `seq` ordena los
  // eventos: una carga lenta que empezó ANTES de un guardado no puede devolver la versión a una más vieja (daría un falso conflicto).
  const versions = useRef(new Map<string, { version: string | null; seq: number }>());
  const seq = useRef(0);
  const versionKey = (year: number, month: number, productId: string) => `${year}-${month}-${productId}`;
  // Productos cuyo guardado se rechazó porque otra persona los cambió, a la espera de recargar el mes (sin pintar nada: es solo una lista).
  const conflicts = useRef<string[]>([]);
  // Lo que se muestra a la persona después de un conflicto (ids de producto), hasta que lo cierre.
  const [conflictNotice, setConflictNotice] = useState<string[] | null>(null);

  const versioning = useMemo<SaveVersioning>(() => ({
    getExpected: (year, month, productId) => versions.current.get(versionKey(year, month, productId))?.version ?? null,
    onSaved: (year, month, productId, newVersion) => {
      versions.current.set(versionKey(year, month, productId), { version: newVersion, seq: ++seq.current });
    },
    onConflict: (_year, _month, productId) => {
      if (!conflicts.current.includes(productId)) conflicts.current.push(productId);
    },
    // Cuando la cola ya no tiene nada en curso: si hubo conflictos, se recarga el mes (queda lo último del servidor) y se avisa. Si
    // además quedó algo sin poder guardarse (sin internet), se espera: recargar ahora borraría de la pantalla lo que aún se va a enviar;
    // cuando por fin se guarde, la cola vuelve a avisar y entonces se recarga.
    onSettled: (settled) => {
      if (settled !== "saved" || conflicts.current.length === 0) return;
      const ids = conflicts.current;
      conflicts.current = [];
      setConflictNotice((current) => Array.from(new Set([...(current ?? []), ...ids])));
      setReloadKey((k) => k + 1);
    },
  }), []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      const startedAt = ++seq.current;
      const { state, hasError } = await loadMonthState(dataSource, products, selectedYear, selectedMonth);
      // Si mientras cargaba se cambió de mes/comunidad, esta respuesta ya no aplica.
      if (cancelled) return;

      // Versiones de lo que se leyó; una versión más nueva (de un guardado que terminó mientras cargaba) se conserva.
      if (!hasError) {
        products.forEach((p) => {
          const key = versionKey(selectedYear, selectedMonth, p.id);
          const known = versions.current.get(key);
          if (!known || known.seq < startedAt) versions.current.set(key, { version: state.versions[p.id] ?? null, seq: startedAt });
        });
      }

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

  const { status: saveStatus, enqueue, retryFailed: retrySave } = useSaveQueue(versioning);

  const dismissConflictNotice = useCallback(() => setConflictNotice(null), []);

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
    conflictNotice,
    dismissConflictNotice,
    saveProductData,
    updateLocalState,
    applyAjuste
  };
}
