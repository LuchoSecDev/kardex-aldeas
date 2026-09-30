import { describe, expect, it } from "vitest";
import { getWeekState, timeAgo } from "@/lib/weekStatus";

describe("getWeekState", () => {
  it("sin envío es pendiente", () => {
    expect(getWeekState(undefined)).toBe("pendiente");
  });

  it("enviada y sin revisar es enviada", () => {
    expect(getWeekState({ modified: false, reviewed: false })).toBe("enviada");
  });

  it("revisada y sin cambios es revisada", () => {
    expect(getWeekState({ modified: false, reviewed: true })).toBe("revisada");
  });

  it("modificada manda sobre revisada y sobre enviada", () => {
    expect(getWeekState({ modified: true, reviewed: true })).toBe("modificada");
    expect(getWeekState({ modified: true, reviewed: false })).toBe("modificada");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("menos de un minuto", () => {
    expect(timeAgo(ago(20_000), now)).toBe("hace un momento");
  });

  it("minutos, horas y días", () => {
    expect(timeAgo(ago(5 * 60_000), now)).toBe("hace 5 min");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("hace 3 h");
    expect(timeAgo(ago(24 * 3_600_000), now)).toBe("hace 1 día");
    expect(timeAgo(ago(72 * 3_600_000), now)).toBe("hace 3 días");
  });

  it("una fecha futura (reloj desfasado) no da números negativos", () => {
    expect(timeAgo(new Date(now.getTime() + 60_000).toISOString(), now)).toBe("hace un momento");
  });
});
