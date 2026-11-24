import { describe, it, expect } from "vitest";
import {
  markUpdating,
  markWhatsNewSeen,
  shouldShowWhatsNew,
  WHATS_NEW,
} from "../src/whats-new";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe("Novedades tras actualizar", () => {
  it("una instalación nueva no las enseña", () => {
    expect(shouldShowWhatsNew(memory())).toBe(false);
  });
  it("se enseñan una sola vez después de pulsar Actualizar", () => {
    const s = memory();
    markUpdating(s);
    expect(shouldShowWhatsNew(s)).toBe(true);
    markWhatsNewSeen(s);
    expect(shouldShowWhatsNew(s)).toBe(false);
    // Otra actualización sin notas nuevas tampoco las repite.
    markUpdating(s);
    expect(shouldShowWhatsNew(s)).toBe(false);
  });
  it("sin almacenamiento no falla", () => {
    expect(shouldShowWhatsNew(null)).toBe(false);
    expect(() => markUpdating(null)).not.toThrow();
  });
  it("las notas son breves: como mucho 6 puntos y ~150 palabras", () => {
    expect(WHATS_NEW.items.length).toBeLessThanOrEqual(6);
    const words = WHATS_NEW.items
      .map((i) => `${i.title} ${i.text}`)
      .join(" ")
      .split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(150);
  });
});
