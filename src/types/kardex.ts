import { Database } from "./database";

export interface Product {
  id: string;
  category: string;
  name: string;
  unit: string;
  minStock: number;
}

export type AjusteRow = Database["public"]["Tables"]["ajustes"]["Row"];

export type StockStatus = "rojo" | "amarillo" | "verde";

export interface StockStatusMeta {
  color: string;
  emoji: string;
  label: string;
}
