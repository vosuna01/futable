import { describe, it, expect } from "vitest";
import {
  markUpdating,
  markWhatsNewSeen,
  shouldShowWhatsNew,
  WHATS_NEW,
} from "../src/whats-new";

const memory = (initial: Record<string, string> = {}) => {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
const session = { "sb-foogrwxbycncnifbwlpe-auth-token": "{}" };

describe("Novedades tras actualizar", () => {
  it("una visita nueva no las ve y quedan dadas por vistas", () => {
    const s = memory();
    expect(shouldShowWhatsNew(s)).toBe(false);
    expect(s.getItem("futable:whats-new-seen")).toBe(WHATS_NEW.id);
  });
  it("quien ya usaba la app las ve al abrir la versión nueva, sin pulsar nada", () => {
    const s = memory(session);
    expect(shouldShowWhatsNew(s)).toBe(true);
    markWhatsNewSeen(s);
    expect(shouldShowWhatsNew(s)).toBe(false);
  });
  it("tras pulsar Actualizar se enseñan una sola vez", () => {
    const s = memory();
    markUpdating(s);
    expect(shouldShowWhatsNew(s)).toBe(true);
    markWhatsNewSeen(s);
    expect(shouldShowWhatsNew(s)).toBe(false);
    // Otra actualización sin notas nuevas tampoco las repite.
    markUpdating(s);
    expect(shouldShowWhatsNew(s)).toBe(false);
  });
  it("unas notas nuevas se enseñan aunque se vieran las anteriores", () => {
    const s = memory({ ...session, "futable:whats-new-seen": "anteriores" });
    expect(shouldShowWhatsNew(s)).toBe(true);
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
