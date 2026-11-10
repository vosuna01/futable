import { describe, expect, it } from "vitest";
import {
  emptyState,
  goalsToWin,
  join,
  loserOrder,
  rotate,
  setTarget,
  startCourt,
} from "../src/domain/live";

const p = (n: number) => `p${n}`;
const opened = () =>
  startCourt(join(emptyState(), [1, 2, 3, 4].map(p)), {
    blue: { defender: p(1), forward: p(2) },
    red: { defender: p(3), forward: p(4) },
  });

describe("Desempate entre los dos perdedores", () => {
  const a = { id: "a", waited: 1 },
    b = { id: "b", waited: 1 };
  it("con la misma espera sale primero quien ha jugado menos hoy, sin sorteo", () => {
    for (const coin of [0, 0.4, 0.6, 0.99]) {
      expect(loserOrder(a, b, coin, { a: 4, b: 1 })).toEqual([b, a]);
      expect(loserOrder(a, b, coin, { a: 1, b: 4 })).toEqual([a, b]);
    }
  });
  it("la espera más larga sigue mandando", () => {
    expect(loserOrder({ id: "a", waited: 2 }, b, 0.9, { a: 9, b: 0 })).toEqual([
      { id: "a", waited: 2 },
      b,
    ]);
  });
  it("si también han jugado lo mismo, decide la moneda", () => {
    expect(loserOrder(a, b, 0, { a: 2, b: 2 })).toEqual([a, b]);
    expect(loserOrder(a, b, 0.9, { a: 2, b: 2 })).toEqual([b, a]);
  });
  it("la rotación usa las partidas del día", () => {
    const state = opened();
    state.court!.red.defender.waited = 0;
    state.court!.red.forward.waited = 0;
    state.played = { [p(3)]: 5, [p(4)]: 1 };
    for (const coin of [0, 0.99]) {
      const next = rotate(state, "blue", coin);
      // Empty queue: both losers return and the first out defends.
      expect(next.court!.red.defender.id).toBe(p(4));
      expect(next.court!.red.forward.id).toBe(p(3));
    }
  });
});

describe("Goles para ganar de la sesión", () => {
  it("sin elegir manda la temporada; elegido, se conserva tras rotar", () => {
    const state = opened();
    expect(goalsToWin(state, 3)).toBe(3);
    const chosen = setTarget(state, 5);
    expect(goalsToWin(chosen, 3)).toBe(5);
    expect(rotate(chosen, "blue", 0).target).toBe(5);
  });
  it("rechaza valores fuera de 1 a 99", () => {
    for (const goals of [0, 100, 2.5])
      expect(() => setTarget(opened(), goals)).toThrow(/inválidos/);
  });
});
