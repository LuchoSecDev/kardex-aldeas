import { useState, useEffect } from "react";
import { INITIAL_PRODUCTS } from "@/data/products";
import { kardexService } from "@/lib/kardexService";
import { Product } from "@/types/kardex";

// Carga el catálogo de productos desde Supabase (tabla `products`, ver
// supabase/products.sql). Si la tabla todavía no existe, no responde, o
// viene vacía, la app sigue funcionando con la lista local de
// src/data/products.ts — nunca se queda sin catálogo.
export function useProducts() {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      const { data, error } = await kardexService.loadProducts();

      if (cancelled) return;

      if (error || !data || data.length === 0) {
        if (error) console.error("Error cargando productos desde Supabase, se usa la lista local:", error);
        setProducts(INITIAL_PRODUCTS);
      } else {
        setProducts(data);
      }
      setIsLoadingProducts(false);
    };

    loadProducts();
    return () => { cancelled = true; };
  }, []);

  return { products, isLoadingProducts };
}
