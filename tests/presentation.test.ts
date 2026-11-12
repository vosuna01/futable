import { describe, it, expect } from "vitest";
import {
  matchesSearch,
  newestFirst,
  calendarDate,
} from "../src/domain/presentation";
import { createDemo } from "../src/demo/data";
describe("Búsquedas y presentación de resultados", () => {
  it("encuentra nombres sin tildes, con mayúsculas o espacios extra", () => {
    expect(matchesSearch("Álvaro Martín", " ALVARO ")).toBe(true);
    expect(matchesSearch("Adrián Moreno", "ADRIAN   MORENO")).toBe(true);
    expect(matchesSearch("Peña", "pena")).toBe(true);
    expect(matchesSearch("Marcos", "Marc Oderrebote")).toBe(false);
  });
  it("ordena por instante de juego, sin confundir husos ni adelantar una corrección antigua", () => {
    const base = createDemo().matches[0];
    const a = {
      ...base,
      id: "a",
      played_at: "2026-11-11T13:00:00+01:00",
      created_at: "2026-11-11T16:00:00Z",
    };
    const b = {
      ...base,
      id: "b",
      played_at: "2026-11-11T12:30:00Z",
      created_at: "2026-11-11T12:30:00Z",
    };
    expect([a, b].sort(newestFirst).map((m) => m.id)).toEqual(["b", "a"]);
  });
  it("construye fechas de filtro según el calendario local", () => {
    expect(calendarDate(new Date(2026, 10, 11, 0, 5))).toBe("2026-11-11");
  });
});
