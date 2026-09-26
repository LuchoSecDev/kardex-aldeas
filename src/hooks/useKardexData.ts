import { useState, useEffect, useCallback } from "react";
import { INITIAL_PRODUCTS } from "@/data/products";
import { kardexService } from "@/lib/kardexService";
import { computeCascade, finalBalanceOfMonth } from "@/lib/balanceEngine";

export function useKardexData(community: string, selectedYear: number, selectedMonth: number) {
  const [isLoading, setIsLoading] = useState(true);
  
  const [exits, setExits] = useState<Record<string, number[]>>({});
  const [entries, setEntries] = useState<Record<string, number[]>>({});
  const [prevBalances, setPrevBalances] = useState<Record<string, number[]>>({});
  
  // Ajustes auditados vigentes de este mes: productId -> { weekIndex: saldo_nuevo }
  const [ajustesByProduct, setAjustesByProduct] = useState<Record<string, Record<number, number>>>({});
  // Saldo con el que cerró el mes anterior, por producto
  const [inheritedBase, setInheritedBase] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear -= 1;
      }

      const [monthDataRes, prevMonthRes, ajustesRes] = await Promise.all([
        kardexService.loadKardexMonth(community, selectedYear, selectedMonth),
        kardexService.loadKardexMonth(community, prevYear, prevMonth),
        kardexService.loadAjustes(community, selectedYear, selectedMonth),
      ]);

      if (monthDataRes.error) console.error("Error cargando datos:", monthDataRes.error);
      if (prevMonthRes.error) console.error("Error cargando el mes anterior:", prevMonthRes.error);
      if (ajustesRes.error) console.error("Error cargando ajustes:", ajustesRes.error);

      const inheritedBaseByProduct: Record<string, number> = {};
      (prevMonthRes.data || []).forEach(row => {
        inheritedBaseByProduct[row.product_id] = finalBalanceOfMonth(row);
      });

      const overridesByProduct: Record<string, Record<number, number>> = {};
      (ajustesRes.data || []).forEach(row => {
        if (!overridesByProduct[row.product_id]) overridesByProduct[row.product_id] = {};
        overridesByProduct[row.product_id][row.week_index] = row.saldo_nuevo;
      });

      const newExits: Record<string, number[]> = {};
      const newEntries: Record<string, number[]> = {};
      const newPrev: Record<string, number[]> = {};

      INITIAL_PRODUCTS.forEach(p => {
        const row = (monthDataRes.data || []).find(r => r.product_id === p.id);
        const productExits = row ? row.exits : Array(35).fill(0);
        const productEntries = row ? row.entries : [0, 0, 0, 0, 0];
        const base = inheritedBaseByProduct[p.id] ?? 0;
        const overrides = overridesByProduct[p.id] || {};

        newExits[p.id] = productExits;
        newEntries[p.id] = productEntries;
        newPrev[p.id] = computeCascade(base, overrides, productEntries, productExits);
      });

      setExits(newExits);
      setEntries(newEntries);
      setPrevBalances(newPrev);
      setAjustesByProduct(overridesByProduct);
      setInheritedBase(inheritedBaseByProduct);
      setIsLoading(false);
    };

    loadData();
  }, [community, selectedYear, selectedMonth]);

  const saveProductData = useCallback(async (productId: string, prodExits: number[], prodEntries: number[], prodPrev: number[]) => {
    const { error } = await kardexService.saveProductData(
      community,
      selectedYear,
      selectedMonth,
      productId,
      prodExits,
      prodEntries,
      prodPrev
    );
    if (error) {
      console.error("Error guardando en Supabase:", error);
    }
  }, [community, selectedYear, selectedMonth]);

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
    exits,
    entries,
    prevBalances,
    ajustesByProduct,
    inheritedBase,
    saveProductData,
    updateLocalState,
    applyAjuste
  };
}
