import { describe, expect, it } from "vitest";
import { LIST_STATE_LABEL, cleanQuantities, countOrdered, getListState, hasAnyOrder } from "@/lib/marketList";

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
