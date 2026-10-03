import { describe, expect, it } from "vitest";
import { ago, colombiaTime, plural } from "@/lib/devFormat";

// Las fechas de /dev: siempre hora de Colombia (UTC-5, sin horario de verano), igual que los avisos por correo y Telegram.
describe("colombiaTime", () => {
  it("resta 5 horas, también al cruzar el día, el mes y el año", () => {
    expect(colombiaTime("2026-10-02T17:05:00Z")).toBe("2026-10-02 12:05");
    expect(colombiaTime("2026-10-03T03:30:00Z")).toBe("2026-10-02 22:30");
    expect(colombiaTime("2026-11-01T02:00:00Z")).toBe("2026-10-31 21:00");
    expect(colombiaTime("2026-01-01T04:59:00Z")).toBe("2025-12-31 23:59");
  });

  it("no depende de la zona horaria del equipo (la fecha lleva su propia zona)", () => {
    expect(colombiaTime("2026-10-02T12:00:00-05:00")).toBe("2026-10-02 12:00");
    expect(colombiaTime("2026-10-02T12:00:00+02:00")).toBe("2026-10-02 05:00");
  });

  it("una fecha ausente o inválida da una raya", () => {
    expect(colombiaTime(null)).toBe("—");
    expect(colombiaTime(undefined)).toBe("—");
    expect(colombiaTime("")).toBe("—");
    expect(colombiaTime("no es fecha")).toBe("—");
  });
});

describe("ago", () => {
  const NOW = Date.parse("2026-10-02T17:00:00Z");
  it("minutos, horas y días, con los límites bien puestos", () => {
    expect(ago("2026-10-02T17:00:00Z", NOW)).toBe("ahora");
    expect(ago("2026-10-02T16:59:30Z", NOW)).toBe("ahora");
    expect(ago("2026-10-02T16:59:00Z", NOW)).toBe("hace 1 min");
    expect(ago("2026-10-02T16:01:00Z", NOW)).toBe("hace 59 min");
    expect(ago("2026-10-02T16:00:00Z", NOW)).toBe("hace 1 h");
    expect(ago("2026-10-01T18:00:00Z", NOW)).toBe("hace 23 h");
    expect(ago("2026-10-01T17:00:00Z", NOW)).toBe("hace 1 día");
    expect(ago("2026-09-29T17:00:00Z", NOW)).toBe("hace 3 días");
  });

  it("una fecha futura cuenta como «ahora» y una inválida da una raya", () => {
    expect(ago("2026-10-02T18:00:00Z", NOW)).toBe("ahora");
    expect(ago(null, NOW)).toBe("—");
    expect(ago("xx", NOW)).toBe("—");
  });
});

describe("plural", () => {
  it("uno en singular, el resto en plural (también el cero)", () => {
    expect(plural(1, "vez", "veces")).toBe("1 vez");
    expect(plural(0, "vez", "veces")).toBe("0 veces");
    expect(plural(12, "vez", "veces")).toBe("12 veces");
  });
});
