import { describe, expect, it } from "vitest";
import { fixedReturn } from "../src/domain/coins";
describe("Premio de cuota fija", () => {
  it("incluye el importe y redondea a coins enteras", () => {
    expect(fixedReturn(10, 2.35)).toBe(23);
    expect(fixedReturn(10, 1.85)).toBe(18);
  });
  it("no pierde coins por la representación de decimales", () => {
    expect(fixedReturn(100, 1.13)).toBe(113);
    expect(fixedReturn(100, 18.52)).toBe(1852);
  });
});
