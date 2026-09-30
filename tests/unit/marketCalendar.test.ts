import { describe, expect, it } from "vitest";
import {
  COLOMBIA_HOLIDAYS_2026,
  addDays,
  bogotaDate,
  buildCalendarSeed,
  deadlineDate,
  deadlineInstant,
  fridayOfWeekStart,
  fridaysOfYear,
  isFriday,
  isLate,
  isMonday,
  kindsDueOnFriday,
  upcomingOrderFriday,
  weekLabel,
  weekName,
  weekRange,
  weekStartOfFriday,
} from "@/lib/marketCalendar";

// Cronograma de pedidos 2026 tal como se transcribió de la foto
// (planes/anexos/cronograma-pedidos-2026.md): viernes -> código.
// F/L/C van todos los viernes; A = abarrotes; AS = aseo.
const CRONOGRAMA_2026: Record<string, string> = {
  "2026-01-02": "F/L/C", "2026-01-09": "F/L/C/A", "2026-01-16": "F/L/C/AS", "2026-01-23": "F/L/C/A", "2026-01-30": "F/L/C",
  "2026-02-06": "F/L/C/A", "2026-02-13": "F/L/C/AS", "2026-02-20": "F/L/C/A", "2026-02-27": "F/L/C",
  "2026-03-06": "F/L/C/A", "2026-03-13": "F/L/C/AS", "2026-03-20": "F/L/C/A", "2026-03-27": "F/L/C",
  "2026-04-03": "F/L/C/A", "2026-04-10": "F/L/C", "2026-04-17": "F/L/C/A/AS", "2026-04-24": "F/L/C",
  "2026-05-01": "F/L/C/A", "2026-05-08": "F/L/C", "2026-05-15": "F/L/C/A/AS", "2026-05-22": "F/L/C", "2026-05-29": "F/L/C/A",
  "2026-06-05": "F/L/C", "2026-06-12": "F/L/C/A", "2026-06-19": "F/L/C/AS", "2026-06-26": "F/L/C/A",
  "2026-07-03": "F/L/C", "2026-07-10": "F/L/C/A", "2026-07-17": "F/L/C/AS", "2026-07-24": "F/L/C/A", "2026-07-31": "F/L/C",
  "2026-08-07": "F/L/C/A", "2026-08-14": "F/L/C/AS", "2026-08-21": "F/L/C/A", "2026-08-28": "F/L/C",
  "2026-09-04": "F/L/C/A", "2026-09-11": "F/L/C", "2026-09-18": "F/L/C/A/AS", "2026-09-25": "F/L/C",
  "2026-10-02": "F/L/C/A", "2026-10-09": "F/L/C", "2026-10-16": "F/L/C/A/AS", "2026-10-23": "F/L/C", "2026-10-30": "F/L/C/A",
  "2026-11-06": "F/L/C", "2026-11-13": "F/L/C/A/AS", "2026-11-20": "F/L/C", "2026-11-27": "F/L/C/A",
  "2026-12-04": "F/L/C", "2026-12-11": "F/L/C/A", "2026-12-18": "F/L/C/AS", "2026-12-25": "F/L/C/A",
};

const codeOf = (friday: string) => {
  const kinds = kindsDueOnFriday(friday);
  return ["F/L/C", kinds.includes("abarrotes") ? "A" : "", kinds.includes("aseo") ? "AS" : ""].filter(Boolean).join("/");
};

describe("kindsDueOnFriday: reproduce el cronograma 2026", () => {
  it("el cronograma transcrito tiene los 52 viernes del año", () => {
    expect(Object.keys(CRONOGRAMA_2026)).toEqual(fridaysOfYear(2026));
    expect(fridaysOfYear(2026)).toHaveLength(52);
  });

  it.each(Object.entries(CRONOGRAMA_2026))("viernes %s -> %s", (friday, code) => {
    expect(codeOf(friday)).toBe(code);
  });

  it("fruver y carnes se piden todos los viernes", () => {
    for (const friday of fridaysOfYear(2026)) {
      expect(kindsDueOnFriday(friday).slice(0, 2)).toEqual(["fruver", "carnes"]);
    }
  });

  it("abarrotes es quincenal: cada 14 días, también hacia 2027", () => {
    expect(kindsDueOnFriday("2026-12-25")).toContain("abarrotes");
    expect(kindsDueOnFriday("2027-01-08")).toContain("abarrotes");
    expect(kindsDueOnFriday("2027-01-01")).not.toContain("abarrotes");
    expect(kindsDueOnFriday("2025-12-26")).toContain("abarrotes"); // antes del ancla
  });

  it("aseo es un viernes por mes (el que cae entre el 13 y el 19), en 2026 y 2027", () => {
    for (const year of [2026, 2027]) {
      const aseo = fridaysOfYear(year).filter((f) => kindsDueOnFriday(f).includes("aseo"));
      expect(aseo).toHaveLength(12);
      expect(aseo.map((f) => f.slice(5, 7))).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]);
    }
  });

  it("la lista del 25 de septiembre (la de Maná) iba solo con F/L/C: abarrotes y aseo en 0", () => {
    expect(kindsDueOnFriday("2026-09-25")).toEqual(["fruver", "carnes"]);
  });
});

describe("fechas de la semana", () => {
  it("la semana se identifica por el lunes: viernes + 3", () => {
    expect(weekStartOfFriday("2026-09-25")).toBe("2026-09-28");
    expect(fridayOfWeekStart("2026-09-28")).toBe("2026-09-25");
    expect(isMonday("2026-09-28")).toBe(true);
    expect(isFriday("2026-09-25")).toBe(true);
    expect(isFriday("2026-09-26")).toBe(false);
  });

  it("addDays cruza fin de mes y de año", () => {
    expect(addDays("2026-09-28", 3)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("bogotaDate usa la hora de Bogotá (UTC-5), no la del navegador", () => {
    expect(bogotaDate(new Date("2026-10-03T03:00:00Z"))).toBe("2026-10-02"); // 10 pm del viernes
    expect(bogotaDate(new Date("2026-10-03T05:00:00Z"))).toBe("2026-10-03");
  });
});

describe("plazo de envío", () => {
  it("normalmente es el viernes a las 5:00 pm de Bogotá", () => {
    expect(deadlineDate("2026-10-02")).toBe("2026-10-02");
    expect(deadlineInstant("2026-10-02").toISOString()).toBe("2026-10-02T22:00:00.000Z");
  });

  it("en viernes festivo se adelanta al día hábil anterior (confirmado por Lucho)", () => {
    expect(deadlineDate("2026-05-01")).toBe("2026-04-30");
    expect(deadlineDate("2026-08-07")).toBe("2026-08-06");
    expect(deadlineDate("2026-12-25")).toBe("2026-12-24");
  });

  it("Viernes Santo: el jueves 2 de abril también es festivo, así que el plazo es el miércoles 1", () => {
    expect(deadlineDate("2026-04-03")).toBe("2026-04-01");
  });

  it("si la víspera cae en fin de semana o festivo sigue retrocediendo", () => {
    const holidays = new Set(["2027-01-01", "2026-12-31"]);
    expect(deadlineDate("2027-01-01", holidays)).toBe("2026-12-30");
  });

  it("en 2026 solo 4 viernes son festivos (los que se adelantan)", () => {
    const moved = fridaysOfYear(2026).filter((f) => deadlineDate(f) !== f);
    expect(moved).toEqual(["2026-04-03", "2026-05-01", "2026-08-07", "2026-12-25"]);
  });

  it("los festivos de 2026 son 18 y ninguno es domingo inventado", () => {
    expect(COLOMBIA_HOLIDAYS_2026.size).toBe(18);
  });

  it("isLate: justo a las 5:00 pm no es tardía; un minuto después sí", () => {
    expect(isLate(new Date("2026-10-02T22:00:00Z"), "2026-10-02")).toBe(false);
    expect(isLate(new Date("2026-10-02T22:00:01Z"), "2026-10-02")).toBe(true);
    expect(isLate(new Date("2026-10-02T15:00:00Z"), "2026-10-02")).toBe(false);
  });

  it("isLate en viernes festivo cuenta desde el día anterior", () => {
    expect(isLate(new Date("2026-12-24T21:59:00Z"), "2026-12-25")).toBe(false); // 4:59 pm del 24
    expect(isLate(new Date("2026-12-24T22:01:00Z"), "2026-12-25")).toBe(true); // 5:01 pm del 24
  });
});

describe("upcomingOrderFriday: la semana por defecto", () => {
  it("entre semana es el viernes de esa semana", () => {
    expect(upcomingOrderFriday(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-02"); // miércoles
  });

  it("el viernes antes de las 5 pm sigue siendo ese viernes", () => {
    expect(upcomingOrderFriday(new Date("2026-10-02T21:59:00Z"))).toBe("2026-10-02"); // 4:59 pm
  });

  it("el viernes después de las 5 pm pasa al siguiente", () => {
    expect(upcomingOrderFriday(new Date("2026-10-02T22:01:00Z"))).toBe("2026-10-09");
  });

  it("sábado y domingo apuntan al viernes siguiente", () => {
    expect(upcomingOrderFriday(new Date("2026-10-03T15:00:00Z"))).toBe("2026-10-09");
    expect(upcomingOrderFriday(new Date("2026-10-04T15:00:00Z"))).toBe("2026-10-09");
  });

  it("con viernes festivo, pasado su plazo adelantado ya apunta al siguiente", () => {
    expect(upcomingOrderFriday(new Date("2026-12-23T15:00:00Z"))).toBe("2026-12-25");
    expect(upcomingOrderFriday(new Date("2026-12-24T23:00:00Z"))).toBe("2027-01-01"); // pasó el 24 a las 5 pm
  });
});

describe("rótulos de la semana", () => {
  it("la semana del 28 sep al 4 oct es la semana 1 de octubre (se numera por el jueves)", () => {
    expect(weekName("2026-09-28")).toBe("Semana 1 de octubre");
    expect(weekRange("2026-09-28")).toBe("28 sep – 4 oct");
    expect(weekLabel("2026-09-28")).toBe("Semana 1 de octubre · 28 sep – 4 oct");
  });

  it("numera las demás semanas por el jueves", () => {
    expect(weekName("2026-10-05")).toBe("Semana 2 de octubre"); // jueves 8
    expect(weekName("2026-10-12")).toBe("Semana 3 de octubre"); // jueves 15
    expect(weekName("2026-10-19")).toBe("Semana 4 de octubre"); // jueves 22
  });

  it("un mes con cinco jueves tiene semana 5", () => {
    expect(weekName("2026-10-26")).toBe("Semana 5 de octubre");
  });

  it("cruza el fin de año: la semana del 28 dic tiene su jueves en diciembre", () => {
    expect(weekLabel("2026-12-28")).toBe("Semana 5 de diciembre · 28 dic – 3 ene");
    expect(weekLabel("2027-01-04")).toBe("Semana 1 de enero · 4 ene – 10 ene");
  });
});

describe("buildCalendarSeed", () => {
  it("genera las 52 filas de 2026 con el plazo adelantado en festivos", () => {
    const rows = buildCalendarSeed(2026);
    expect(rows).toHaveLength(52);
    expect(rows.find((r) => r.friday === "2026-04-03")?.deadlineAt).toBe("2026-04-01 17:00:00-05:00");
    expect(rows.find((r) => r.friday === "2026-10-02")?.deadlineAt).toBe("2026-10-02 17:00:00-05:00");
  });
});
