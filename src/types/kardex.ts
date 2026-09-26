export interface Product {
  id: string;
  category: string;
  name: string;
  unit: string;
  previousBalance: number;
  initialEntry: number;
  minStock: number;
}

export type StockStatus = "rojo" | "amarillo" | "verde";

export interface StockStatusMeta {
  color: string;
  emoji: string;
  label: string;
}
