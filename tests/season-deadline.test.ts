import { describe, expect, it } from "vitest";
import { countdownParts, seasonDeadline } from "../src/domain/season-deadline";
describe("Cierre de temporada según el calendario de Madrid", () => {
  it("termina el último viernes de noviembre de 2026 al finalizar el día", () => {
    const deadline = seasonDeadline("2026-11-27");
    expect(new Date("2026-11-27T12:00:00Z").getUTCDay()).toBe(5);
    expect(new Date(deadline).toISOString()).toBe("2026-11-27T23:00:00.000Z");
    expect(countdownParts(deadline, deadline - 90061000)).toEqual({
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
      finished: false,
    });
  });
  it("respeta el horario de verano y los cambios de hora", () => {
    expect(new Date(seasonDeadline("2026-06-12")).toISOString()).toBe(
      "2026-06-12T22:00:00.000Z",
    );
    expect(new Date(seasonDeadline("2026-03-28")).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
    expect(new Date(seasonDeadline("2026-10-24")).toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
  });
  it("no cuenta hacia valores negativos y rechaza fechas inválidas", () => {
    expect(countdownParts(100, 200)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      finished: true,
    });
    expect(Number.isNaN(seasonDeadline("2026-02-31"))).toBe(true);
  });
});
