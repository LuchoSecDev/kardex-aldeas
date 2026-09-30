import { describe, expect, it } from "vitest";
import { aggregateWeekly, defaultWeekIndex, round2, weekRangeLabel, type WeeklyRow } from "@/lib/weeklySummary";
import type { Product } from "@/types/kardex";

const products: Product[] = [
  { id: "p1", category: "A", name: "Arroz", unit: "KG", minStock: 5 },
  { id: "p2", category: "A", name: "Leche", unit: "BOLSA", minStock: 5 },
  { id: "p3", category: "B", name: "Pan", unit: "UND", minStock: 5 },
];

const row = (community: string, product_id: string, prev_balance: number, entries: number, exits: number): WeeklyRow => ({
  community, product_id, prev_balance, entries, exits,
});

describe("aggregateWeekly", () => {
  it("suma por producto entre comunidades y calcula el saldo final", () => {
    const [arroz] = aggregateWeekly(
      [row("Maná", "p1", 2, 5, 3), row("Fortaleza", "p1", 1, 0, 1)],
      products
    );
    expect(arroz.prev).toBe(3);
    expect(arroz.entries).toBe(5);
    expect(arroz.exits).toBe(4);
    expect(arroz.final).toBe(4); // 3 + 5 - 4
  });

  it("guarda el detalle por comunidad, ordenado por nombre", () => {
    const [arroz] = aggregateWeekly([row("Maná", "p1", 2, 5, 3), row("Fortaleza", "p1", 1, 0, 1)], products);
    expect(arroz.byCommunity.map((c) => c.community)).toEqual(["Fortaleza", "Maná"]);
    expect(arroz.byCommunity[1]).toEqual({ community: "Maná", prev: 2, entries: 5, exits: 3, final: 4 });
  });

  it("sigue el orden del catálogo, no el de llegada de las filas", () => {
    const result = aggregateWeekly([row("Maná", "p3", 0, 1, 0), row("Maná", "p1", 0, 1, 0)], products);
    expect(result.map((r) => r.product.id)).toEqual(["p1", "p3"]);
  });

  it("omite los productos sin filas y los que no están en el catálogo", () => {
    const result = aggregateWeekly([row("Maná", "p2", 0, 4, 0), row("Maná", "no-existe", 9, 9, 9)], products);
    expect(result.map((r) => r.product.id)).toEqual(["p2"]);
  });

  it("maneja medias unidades sin restos de coma flotante", () => {
    const [arroz] = aggregateWeekly(
      [row("A", "p1", 0.1, 0.2, 0), row("B", "p1", 0.2, 0.1, 0.1)],
      products
    );
    expect(arroz.prev).toBe(0.3);
    expect(arroz.entries).toBe(0.3);
    expect(arroz.exits).toBe(0.1);
    expect(arroz.final).toBe(0.5);
  });

  it("permite saldos finales negativos (salidas mayores al stock)", () => {
    const [arroz] = aggregateWeekly([row("Maná", "p1", 0, 0, 4)], products);
    expect(arroz.final).toBe(-4);
  });

  it("sin filas devuelve una lista vacía", () => {
    expect(aggregateWeekly([], products)).toEqual([]);
  });
});

describe("round2", () => {
  it("elimina restos de coma flotante", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005 * 100)).toBe(100.5);
  });
});

describe("weekRangeLabel", () => {
  it("muestra el rango de fechas de una semana completa", () => {
    expect(weekRangeLabel(2026, 8, 1)).toBe("7 al 13 de septiembre");
  });

  it("las semanas de los extremos pueden ser parciales", () => {
    expect(weekRangeLabel(2026, 8, 0)).toBe("1 al 6 de septiembre");
    expect(weekRangeLabel(2026, 8, 4)).toBe("28 al 30 de septiembre");
  });

  it("una semana sin días del mes lo dice", () => {
    // Febrero de 2027 empieza en lunes y tiene 28 días: la semana 5 queda vacía.
    expect(weekRangeLabel(2027, 1, 4)).toBe("sin días en este mes");
  });
});

describe("defaultWeekIndex", () => {
  it("en el mes actual elige la semana de hoy", () => {
    expect(defaultWeekIndex(2026, 8, new Date(2026, 8, 30))).toBe(4); // 30 de septiembre
    expect(defaultWeekIndex(2026, 8, new Date(2026, 8, 8))).toBe(1);
  });

  it("en otro mes elige la primera semana", () => {
    expect(defaultWeekIndex(2026, 7, new Date(2026, 8, 30))).toBe(0);
  });
});
