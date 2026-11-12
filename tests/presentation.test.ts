import { describe, it, expect } from "vitest";
import {
  matchesSearch,
  newestFirst,
  calendarDate,
  membershipLabel,
} from "../src/domain/presentation";
import { createDemo } from "../src/demo/data";
describe("Búsquedas y presentación de resultados", () => {
  it("distingue cuentas con el mismo nombre sin cambiar su identidad", () => {
    const base = createDemo().memberships[0];
    const a = {
      ...base,
      user_id: "00000000-0000-4000-8000-000011111111",
      display_name: "Adri",
    };
    const b = {
      ...base,
      user_id: "00000000-0000-4000-8000-000022222222",
      display_name: "ADRI",
    };
    expect(membershipLabel(a, [a, b])).toBe("Adri · ID 11111111");
    expect(membershipLabel(b, [a, b])).toBe("ADRI · ID 22222222");
    expect(membershipLabel(a, [a])).toBe("Adri");
  });
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
