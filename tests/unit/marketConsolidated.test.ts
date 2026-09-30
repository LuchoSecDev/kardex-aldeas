import { describe, expect, it } from "vitest";
import {
  aggregateConsolidated,
  communitiesIn,
  communitiesOfKind,
  countsByKind,
  filterConsolidated,
} from "@/lib/marketConsolidated";
import { weekName, weekParts } from "@/lib/marketCalendar";
import type { AdminMarketConsolidatedRow } from "@/types/market";

const row = (community: string, kind: AdminMarketConsolidatedRow["kind"], item_id: string, name: string, quantity: number, sort_order = 1, unit = "KG"): AdminMarketConsolidatedRow => ({
  community, kind, item_id, name, unit, is_event: false, sort_order, quantity,
});

describe("aggregateConsolidated", () => {
  const rows = [
    row("Maná", "fruver", "mf1", "ACELGA", 2.5, 1),
    row("Fortaleza", "fruver", "mf1", "ACELGA", 1.5, 1),
    row("Maná", "fruver", "mf3", "PAPA PASTUSA", 8, 3),
    row("Maná", "carnes", "mc1", "CARNE ASAR PORCION", 12, 1, "Porcion"),
  ];

  it("suma el mismo producto entre comunidades y guarda el detalle por comunidad", () => {
    const { fruver } = aggregateConsolidated(rows);
    const acelga = fruver.find((i) => i.id === "mf1")!;
    expect(acelga.total).toBe(4);
    expect(acelga.byCommunity).toEqual([
      { community: "Fortaleza", quantity: 1.5 },
      { community: "Maná", quantity: 2.5 },
    ]);
  });

  it("separa por tipo y deja los tipos sin pedidos vacíos", () => {
    const result = aggregateConsolidated(rows);
    expect(result.carnes.map((i) => i.id)).toEqual(["mc1"]);
    expect(result.abarrotes).toEqual([]);
    expect(result.aseo).toEqual([]);
    expect(countsByKind(result)).toEqual({ fruver: 2, carnes: 1, abarrotes: 0, aseo: 0 });
  });

  it("ordena por el orden del catálogo, no por el de llegada", () => {
    const { fruver } = aggregateConsolidated([row("A", "fruver", "mf3", "PAPA", 1, 3), row("A", "fruver", "mf1", "ACELGA", 1, 1)]);
    expect(fruver.map((i) => i.id)).toEqual(["mf1", "mf3"]);
  });

  it("redondea a 2 decimales (0,1 + 0,2 no da 0,30000000000000004)", () => {
    const { fruver } = aggregateConsolidated([row("A", "fruver", "mf1", "ACELGA", 0.1), row("B", "fruver", "mf1", "ACELGA", 0.2)]);
    expect(fruver[0].total).toBe(0.3);
  });

  it("ignora cantidades en cero o inválidas", () => {
    const { fruver } = aggregateConsolidated([row("A", "fruver", "mf1", "ACELGA", 0), row("B", "fruver", "mf1", "ACELGA", Number.NaN)]);
    expect(fruver).toEqual([]);
  });

  it("sin filas devuelve todo vacío", () => {
    expect(countsByKind(aggregateConsolidated([]))).toEqual({ fruver: 0, carnes: 0, abarrotes: 0, aseo: 0 });
  });

  it("las comunidades se ordenan alfabéticamente en español (con tildes)", () => {
    const { fruver } = aggregateConsolidated([row("Shalom", "fruver", "mf1", "A", 1), row("Maná", "fruver", "mf1", "A", 1), row("Árbol", "fruver", "mf1", "A", 1)]);
    expect(fruver[0].byCommunity.map((c) => c.community)).toEqual(["Árbol", "Maná", "Shalom"]);
  });
});

describe("comunidades del consolidado", () => {
  it("communitiesIn lista cada comunidad una vez", () => {
    expect(communitiesIn([{ community: "Maná" }, { community: "Fortaleza" }, { community: "Maná" }])).toEqual(["Fortaleza", "Maná"]);
  });

  it("communitiesOfKind trae solo las que pidieron algo de ese tipo", () => {
    const { fruver, carnes } = aggregateConsolidated([
      row("Maná", "fruver", "mf1", "A", 1), row("Shalom", "fruver", "mf1", "A", 1), row("Maná", "carnes", "mc1", "C", 1),
    ]);
    expect(communitiesOfKind(fruver)).toEqual(["Maná", "Shalom"]);
    expect(communitiesOfKind(carnes)).toEqual(["Maná"]);
  });
});

describe("filterConsolidated", () => {
  const { fruver } = aggregateConsolidated([row("A", "fruver", "mf1", "AROMÁTICAS", 1, 1), row("A", "fruver", "mf2", "LIMÓN TAHITI", 1, 2)]);
  it("busca sin importar tildes ni mayúsculas", () => {
    expect(filterConsolidated(fruver, "aromaticas").map((i) => i.id)).toEqual(["mf1"]);
    expect(filterConsolidated(fruver, "LIMON").map((i) => i.id)).toEqual(["mf2"]);
    expect(filterConsolidated(fruver, "").length).toBe(2);
    expect(filterConsolidated(fruver, "zzz")).toEqual([]);
  });
});

describe("weekParts", () => {
  it("numera por el jueves y toma mes y año de ese jueves", () => {
    expect(weekParts("2026-09-28")).toEqual({ n: 1, monthIndex: 9, year: 2026 });
    expect(weekParts("2026-12-28")).toEqual({ n: 5, monthIndex: 11, year: 2026 });
    expect(weekParts("2027-01-04")).toEqual({ n: 1, monthIndex: 0, year: 2027 });
    expect(weekName("2026-09-28")).toBe("Semana 1 de octubre");
  });
});
