import { describe, expect, it } from "vitest";
import {
  ADMIN_STATE_LABEL,
  adminDefaultWeekStart,
  adminListState,
  kindCell,
  punctualityLabel,
  summarizeOverview,
} from "@/lib/marketAdmin";

const DEADLINE = "2026-10-02T22:00:00Z"; // viernes 2 oct, 5:00 p. m. Bogotá
const BEFORE = new Date("2026-10-01T15:00:00Z").getTime();
const AFTER = new Date("2026-10-03T15:00:00Z").getTime();

describe("adminListState", () => {
  it("sin enviar: pendiente mientras hay tiempo, falta cuando venció el plazo", () => {
    expect(adminListState({ sent: false, reviewed: false }, DEADLINE, BEFORE)).toBe("pendiente");
    expect(adminListState({ sent: false, reviewed: false }, DEADLINE, AFTER)).toBe("falta");
  });

  it("justo a la hora del plazo todavía es pendiente; un instante después, falta", () => {
    const at = new Date(DEADLINE).getTime();
    expect(adminListState({ sent: false, reviewed: false }, DEADLINE, at)).toBe("pendiente");
    expect(adminListState({ sent: false, reviewed: false }, DEADLINE, at + 1)).toBe("falta");
  });

  it("enviada es 'por revisar' y revisada es revisada, sin importar el plazo", () => {
    expect(adminListState({ sent: true, reviewed: false }, DEADLINE, AFTER)).toBe("enviada");
    expect(adminListState({ sent: true, reviewed: true }, DEADLINE, AFTER)).toBe("revisada");
  });

  it("todos los estados tienen rótulo", () => {
    expect(Object.keys(ADMIN_STATE_LABEL).sort()).toEqual(["enviada", "falta", "pendiente", "revisada"]);
  });
});

describe("summarizeOverview", () => {
  const rows = [
    { sent: true, reviewed: true, late: false },
    { sent: true, reviewed: false, late: true },
    { sent: true, reviewed: false, late: false },
    { sent: false, reviewed: false, late: false },
    { sent: false, reviewed: false, late: false },
  ];

  it("cuenta por estado pasado el plazo: lo no enviado es 'falta'", () => {
    expect(summarizeOverview(rows, DEADLINE, AFTER)).toEqual({ total: 5, sent: 3, toReview: 2, reviewed: 1, missing: 2, pending: 0, late: 1 });
  });

  it("antes del plazo, lo no enviado es 'pendiente' y nadie 'falta'", () => {
    expect(summarizeOverview(rows, DEADLINE, BEFORE)).toMatchObject({ missing: 0, pending: 2 });
  });

  it("sin comunidades todo es cero", () => {
    expect(summarizeOverview([], DEADLINE, AFTER)).toEqual({ total: 0, sent: 0, toReview: 0, reviewed: 0, missing: 0, pending: 0, late: 0 });
  });
});

describe("kindCell", () => {
  const counts = { fruver: 12, carnes: 0, abarrotes: 0, aseo: 3 };

  it("una comunidad que no ha enviado muestra guion en todo", () => {
    expect(kindCell({ sent: false, counts }, "fruver", true)).toBe("—");
  });

  it("muestra el número pedido; 0 si tocaba y no pidió", () => {
    expect(kindCell({ sent: true, counts }, "fruver", true)).toBe("12");
    expect(kindCell({ sent: true, counts }, "carnes", true)).toBe("0");
  });

  it("si ese viernes no tocaba el tipo y no pidió nada: guion; si pidió igual, el número", () => {
    expect(kindCell({ sent: true, counts }, "abarrotes", false)).toBe("—");
    expect(kindCell({ sent: true, counts }, "aseo", false)).toBe("3");
  });
});

describe("adminDefaultWeekStart: qué semana abre la nutricionista", () => {
  const at = (iso: string) => adminDefaultWeekStart(new Date(iso));

  it("entre semana (lunes a jueves, tras la ventana) abre la semana del próximo pedido", () => {
    expect(at("2026-10-07T15:00:00Z")).toBe("2026-10-12"); // miércoles 7 oct -> viernes 9 -> lunes 12
  });

  it("el viernes antes de las 5 pm todavía es la del pedido de ese viernes", () => {
    expect(at("2026-10-02T20:00:00Z")).toBe("2026-10-05");
  });

  it("después del plazo del viernes y hasta el martes sigue mostrando las listas de ese viernes", () => {
    expect(at("2026-10-02T23:00:00Z")).toBe("2026-10-05"); // viernes 6 pm
    expect(at("2026-10-03T15:00:00Z")).toBe("2026-10-05"); // sábado
    expect(at("2026-10-05T15:00:00Z")).toBe("2026-10-05"); // lunes
    expect(at("2026-10-06T15:00:00Z")).toBe("2026-10-05"); // martes 10 a. m.
  });

  it("pasado el martes de la tarde ya pasa a la semana del siguiente pedido", () => {
    expect(at("2026-10-06T23:00:00Z")).toBe("2026-10-12"); // martes 6 pm
    expect(at("2026-10-07T15:00:00Z")).toBe("2026-10-12");
  });
});

describe("punctualityLabel", () => {
  it("tarde, a tiempo, o a tiempo pero cambió después del plazo", () => {
    expect(punctualityLabel({ late: true, changed_after_deadline: false })).toBe("Tarde");
    expect(punctualityLabel({ late: false, changed_after_deadline: false })).toBe("A tiempo");
    expect(punctualityLabel({ late: false, changed_after_deadline: true })).toMatch(/cambió después del plazo/);
  });
});
