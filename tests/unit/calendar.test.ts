import { describe, expect, it } from "vitest";
import { buildCalendarWeeks } from "@/lib/calendar";

describe("buildCalendarWeeks", () => {
  it("siempre devuelve 5 semanas de 7 días", () => {
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

  // Marzo (2), agosto (7) y noviembre (10) de 2026 no caben en 5 semanas: ver
  // el hallazgo abierto en planes/README.md.
  const MONTHS_THAT_FIT_2026 = [0, 1, 3, 4, 5, 6, 8, 9, 11];

  it("en los meses que caben en 5 semanas, cada día aparece exactamente una vez y en orden", () => {
    MONTHS_THAT_FIT_2026.forEach((month) => {
      expect(daysOf(2026, month), `mes ${month}`).toEqual(expectedDays(2026, month));
    });
  });

  // HALLAZGO ABIERTO: con solo 5 semanas (lunes a domingo), un mes de 30/31 días
  // que empieza en sábado o domingo pierde sus últimos 1-2 días (no se pueden
  // registrar). Esta prueba describe el comportamiento CORRECTO y hoy falla a
  // propósito (it.fails): cuando se arregle (p. ej. una 6.ª semana), Vitest
  // avisará y hay que cambiarla a `it`.
  it.fails("BUG CONOCIDO: todos los meses de 2026 deberían mostrar todos sus días", () => {
    for (let month = 0; month < 12; month++) {
      expect(daysOf(2026, month), `mes ${month}`).toEqual(expectedDays(2026, month));
    }
  });

  it("febrero bisiesto tiene 29 días", () => {
    const days = buildCalendarWeeks(2028, 1).flat().filter((d) => d !== null);
    expect(days).toHaveLength(29);
  });
});
