import { describe, expect, it } from "vitest";
import { WEEKS_MAX, buildCalendarWeeks, enabledDaysOf, isExtraWeek, weekCountOf } from "@/lib/calendar";

describe("buildCalendarWeeks", () => {
  it("los meses que caben devuelven 5 semanas de 7 días", () => {
    const weeks = buildCalendarWeeks(2026, 8);
    expect(weeks).toHaveLength(5);
    weeks.forEach((w) => expect(w).toHaveLength(7));
  });

  it("septiembre 2026 empieza en martes y termina el miércoles 30", () => {
    const weeks = buildCalendarWeeks(2026, 8); // mes 8 = septiembre (0-indexado)
    expect(weeks[0]).toEqual([null, 1, 2, 3, 4, 5, 6]);
    expect(weeks[4]).toEqual([28, 29, 30, null, null, null, null]);
  });

  it("un mes que empieza en lunes no deja huecos al inicio", () => {
    const weeks = buildCalendarWeeks(2026, 5); // junio 2026 empieza en lunes
    expect(weeks[0][0]).toBe(1);
  });

  it("un mes que empieza en domingo deja seis huecos (la semana va de lunes a domingo)", () => {
    const weeks = buildCalendarWeeks(2026, 1); // febrero 2026 empieza en domingo
    expect(weeks[0]).toEqual([null, null, null, null, null, null, 1]);
  });

  const daysOf = (year: number, month: number) =>
    buildCalendarWeeks(year, month).flat().filter((d): d is number => d !== null);
  const expectedDays = (year: number, month: number) =>
    Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1);

  it("TODOS los meses de 2026 a 2030 muestran todos sus días, cada uno una sola vez y en orden (hallazgo H1)", () => {
    for (let year = 2026; year <= 2030; year++) {
      for (let month = 0; month < 12; month++) {
        expect(daysOf(year, month), `${year}-${month + 1}`).toEqual(expectedDays(year, month));
      }
    }
  });

  it("febrero bisiesto tiene 29 días", () => {
    const days = buildCalendarWeeks(2028, 1).flat().filter((d) => d !== null);
    expect(days).toHaveLength(29);
  });
});

describe("semana 6 de cierre (planes/004)", () => {
  // Los meses de 2026 que no caben en 5 semanas (mes 0-indexado): marzo, agosto y noviembre.
  it("marzo 2026 (empieza en domingo) trae una semana 6 con solo el 30 y el 31 (lunes y martes)", () => {
    const weeks = buildCalendarWeeks(2026, 2);
    expect(weeks).toHaveLength(6);
    expect(weeks[5]).toEqual([30, 31, null, null, null, null, null]);
    expect(weeks[4]).toEqual([23, 24, 25, 26, 27, 28, 29]);
  });

  it("agosto 2026 (empieza en sábado) trae el día 31 en la semana 6", () => {
    const weeks = buildCalendarWeeks(2026, 7);
    expect(weeks).toHaveLength(6);
    expect(weeks[5]).toEqual([31, null, null, null, null, null, null]);
  });

  it("noviembre 2026 (empieza en domingo, 30 días) trae el día 30 en la semana 6", () => {
    const weeks = buildCalendarWeeks(2026, 10);
    expect(weeks).toHaveLength(6);
    expect(weeks[5]).toEqual([30, null, null, null, null, null, null]);
  });

  it("los demás meses de 2026 siguen con 5 semanas", () => {
    for (const month of [0, 1, 3, 4, 5, 6, 8, 9, 11]) {
      expect(weekCountOf(2026, month), `mes ${month}`).toBe(5);
    }
  });

  it("los meses afectados de 2027 (mayo y agosto) también la traen", () => {
    expect(weekCountOf(2027, 4)).toBe(6); // 31 de mayo (lunes)
    expect(weekCountOf(2027, 7)).toBe(6); // 30 y 31 de agosto
    expect(buildCalendarWeeks(2027, 7)[5]).toEqual([30, 31, null, null, null, null, null]);
  });

  it("nunca sobran más de 2 días ni se necesita una semana 7", () => {
    for (let year = 2020; year <= 2040; year++) {
      for (let month = 0; month < 12; month++) {
        const weeks = buildCalendarWeeks(year, month);
        expect(weeks.length, `${year}-${month + 1}`).toBeLessThanOrEqual(WEEKS_MAX);
        if (weeks.length === 6) {
          const extra = weeks[5].filter((d) => d !== null);
          expect(extra.length).toBeGreaterThanOrEqual(1);
          expect(extra.length).toBeLessThanOrEqual(2);
          // Los días de cierre son los primeros de la semana (lunes y martes): los demás quedan deshabilitados.
          expect(weeks[5].slice(0, extra.length)).toEqual(extra);
        }
      }
    }
  });

  it("isExtraWeek y enabledDaysOf dicen qué semana es la de cierre y cuántos de sus días se pueden editar", () => {
    expect(isExtraWeek(5)).toBe(true);
    expect(isExtraWeek(4)).toBe(false);
    expect(enabledDaysOf(2026, 2, 5)).toBe(2); // marzo: 30 y 31
    expect(enabledDaysOf(2026, 7, 5)).toBe(1); // agosto: 31
    expect(enabledDaysOf(2026, 8, 5)).toBe(0); // septiembre no tiene semana 6
    expect(enabledDaysOf(2026, 8, 0)).toBe(6);
  });
});
