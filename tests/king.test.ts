import { describe, expect, it } from "vitest";
import {
  advanceCourt,
  courtError,
  courtParticipants,
  type Court,
} from "../src/domain/king";
const a = { id: "a", defender: "1", forward: "2" },
  b = { id: "b", defender: "3", forward: "4" },
  c = { id: "c", defender: "5", forward: "6" },
  d = { id: "d", defender: "7", forward: "8" };
describe("Rey de la pista", () => {
  it.each(["blue", "red"] as const)(
    "conserva %s y rota solo a la pareja perdedora",
    (winner) => {
      const state: Court = { blue: a, red: b, queue: [c, d] };
      const next = advanceCourt(state, winner);
      const loser = winner === "blue" ? "red" : "blue";
      expect(next[winner]).toEqual(state[winner]);
      expect(next[loser]).toEqual(c);
      expect(next.queue).toEqual([d, state[loser]]);
      expect(state.queue).toEqual([c, d]);
    },
  );
  it("no programa revancha si no había parejas esperando", () => {
    const next = advanceCourt({ blue: a, red: b, queue: [] }, "red");
    expect(next).toEqual({ blue: null, red: b, queue: [a] });
    expect(() => advanceCourt(next, "red")).toThrow(/rivales/);
  });
  it("conserva los cuatro puestos y evita jugadores duplicados", () => {
    const state = { blue: a, red: b, queue: [] };
    expect(courtParticipants(state)).toHaveLength(4);
    const players = Array.from({ length: 6 }, (_, i) => ({
      id: `${i + 1}`,
      league_id: "l",
      name: "p",
      active: true,
      avatar_url: null,
    }));
    expect(courtError(state, players)).toBeNull();
    expect(
      courtError({ ...state, queue: [{ ...c, defender: "1" }] }, players),
    ).toMatch(/solo/);
  });
});
