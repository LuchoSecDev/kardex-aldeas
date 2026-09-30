import { describe, expect, it } from "vitest";
import {
  LIST_STATE_LABEL,
  cleanQuantities,
  countOrdered,
  draftsFromQuantities,
  emptyKindDrafts,
  filterItems,
  formatDeadline,
  getListState,
  hasAnyOrder,
  normalizeText,
  parseParticipants,
  resolveKindsDue,
  sanitizeQuantityInput,
  submitErrorMessage,
  summarizeByKind,
} from "@/lib/marketList";
import type { MarketItem } from "@/types/market";

describe("getListState", () => {
  it("sin fila o nunca enviada es borrador", () => {
    expect(getListState(undefined)).toBe("borrador");
    expect(getListState({ sent: false, modified: false })).toBe("borrador");
  });

  it("enviada y sin cambios es enviada", () => {
    expect(getListState({ sent: true, modified: false })).toBe("enviada");
  });

  it("enviada y editada después es modificada", () => {
    expect(getListState({ sent: true, modified: true })).toBe("modificada");
  });

  it("todos los estados tienen rótulo", () => {
    expect(Object.keys(LIST_STATE_LABEL).sort()).toEqual(["borrador", "enviada", "modificada"]);
  });
});

describe("cleanQuantities", () => {
  it("descarta ceros, vacíos, negativos y basura", () => {
    expect(cleanQuantities({ a: 0, b: "", c: null, d: undefined, e: -2, f: "abc", g: NaN, h: Infinity })).toEqual({});
  });

  it("conserva decimales y acepta coma decimal escrita en el celular", () => {
    expect(cleanQuantities({ a: 2.5, b: "0,25", c: "1.5", d: " 3 " })).toEqual({ a: 2.5, b: 0.25, c: 1.5, d: 3 });
  });
});

describe("countOrdered / hasAnyOrder", () => {
  it("cuenta solo los ítems con cantidad", () => {
    expect(countOrdered({})).toBe(0);
    expect(countOrdered({ a: 1, b: 0.5, c: 0 })).toBe(2);
  });

  it("hasAnyOrder mira las 4 listas", () => {
    expect(hasAnyOrder([{ quantities: {} }, { quantities: {} }])).toBe(false);
    expect(hasAnyOrder([{ quantities: {} }, { quantities: { a: 1 } }])).toBe(true);
    expect(hasAnyOrder([])).toBe(false);
  });
});

const item = (id: string, name: string): MarketItem => ({ id, kind: "fruver", name, unit: "KG", is_event: false, sort_order: 1 });

describe("búsqueda de ítems", () => {
  const items = [item("1", "PAPA PASTUSA"), item("2", "PAPAYA MELONA"), item("3", "AROMÁTICAS"), item("4", "LIMÓN TAHITI")];

  it("ignora mayúsculas y tildes", () => {
    expect(normalizeText("  LÁCTEOS ")).toBe("lacteos");
    expect(filterItems(items, "aromaticas").map((i) => i.id)).toEqual(["3"]);
    expect(filterItems(items, "limon").map((i) => i.id)).toEqual(["4"]);
  });

  it("busca en cualquier parte del nombre", () => {
    expect(filterItems(items, "papa").map((i) => i.id)).toEqual(["1", "2"]);
    expect(filterItems(items, "melona").map((i) => i.id)).toEqual(["2"]);
  });

  it("sin texto devuelve todo, sin coincidencias devuelve vacío", () => {
    expect(filterItems(items, "  ")).toHaveLength(4);
    expect(filterItems(items, "zzz")).toEqual([]);
  });
});

describe("campos de cantidad", () => {
  it("sanitizeQuantityInput deja solo dígitos y UN separador decimal", () => {
    expect(sanitizeQuantityInput("12")).toBe("12");
    expect(sanitizeQuantityInput("2,5")).toBe("2,5");
    expect(sanitizeQuantityInput("2.5")).toBe("2.5");
    expect(sanitizeQuantityInput("abc1-2")).toBe("12");
    expect(sanitizeQuantityInput("1,2,3")).toBe("1,23");
    expect(sanitizeQuantityInput("0,")).toBe("0,"); // se puede seguir tecleando
    expect(sanitizeQuantityInput("")).toBe("");
  });

  it("draftsFromQuantities muestra los decimales con coma", () => {
    expect(draftsFromQuantities({ a: 2.5, b: 12 })).toEqual({ a: "2,5", b: "12" });
  });

  it("los borradores con coma vuelven a número al limpiar", () => {
    expect(cleanQuantities(draftsFromQuantities({ a: 0.25, b: 3 }))).toEqual({ a: 0.25, b: 3 });
  });

  it("summarizeByKind cuenta solo los ítems con cantidad de cada tipo", () => {
    const drafts = { ...emptyKindDrafts(), fruver: { a: "2", b: "0", c: "" }, carnes: { d: "1,5" } };
    expect(summarizeByKind(drafts).map((s) => [s.kind, s.count])).toEqual([
      ["fruver", 1],
      ["carnes", 1],
      ["abarrotes", 0],
      ["aseo", 0],
    ]);
  });
});

describe("tipos que tocan y plazo", () => {
  it("usa el calendario sembrado y, si no hay, la regla del cronograma", () => {
    expect(resolveKindsDue(["fruver", "carnes"], "2026-10-02")).toEqual(["fruver", "carnes"]);
    expect(resolveKindsDue(null, "2026-10-02")).toEqual(["fruver", "carnes", "abarrotes"]);
    expect(resolveKindsDue(null, "2026-10-16")).toEqual(["fruver", "carnes", "abarrotes", "aseo"]);
  });

  it("formatDeadline muestra la hora de Bogotá", () => {
    const text = formatDeadline("2026-10-02T22:00:00Z").replace(/\s/g, " ");
    expect(text).toMatch(/viernes/);
    expect(text).toMatch(/2 de octubre/);
    expect(text).toMatch(/5:00/);
  });
});

describe("mensajes y participantes", () => {
  it("traduce los errores del servidor", () => {
    expect(submitErrorMessage("PARTICIPANTES_REQUERIDOS")).toMatch(/participantes/);
    expect(submitErrorMessage("LISTA_VACIA")).toMatch(/vacía/);
    expect(submitErrorMessage("Semana inválida")).toMatch(/semana/);
    expect(submitErrorMessage("Failed to fetch")).toMatch(/conexión/);
    expect(submitErrorMessage(undefined)).toMatch(/conexión/);
  });

  it("parseParticipants acepta enteros de 1 a 500", () => {
    expect(parseParticipants("11")).toBe(11);
    expect(parseParticipants(" 500 ")).toBe(500);
    for (const bad of ["", "0", "501", "-3", "2,5", "abc", "1000"]) expect(parseParticipants(bad), bad).toBeNull();
  });
});
