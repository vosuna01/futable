import { describe, it, expect } from "vitest";
import { forecast } from "../src/domain/odds";
import { emptyState, startCourt, type LiveState } from "../src/domain/live";
import { join } from "../src/domain/live";
import {
  defaultRules,
  type Match,
  type Participant,
  type Player,
} from "../src/domain/types";

const id = (n: number) => `p${n}`;
const players: Player[] = [1, 2, 3, 4].map((n) => ({
  id: id(n),
  league_id: "l",
  name: `Jugador ${n}`,
  avatar_url: null,
  active: true,
}));
const lineup = {
  blue: { defender: id(1), forward: id(2) },
  red: { defender: id(3), forward: id(4) },
};
const court: LiveState = startCourt(
  join(
    emptyState(),
    players.map((p) => p.id),
  ),
  lineup,
);
let counter = 0;
/** One match where the given team wins, with the four players in their posts. */
const played = (winner: "blue" | "red"): Match => {
  counter += 1;
  const participants: Participant[] = [
    { player_id: id(1), team: "blue", position: "defender" },
    { player_id: id(2), team: "blue", position: "forward" },
    { player_id: id(3), team: "red", position: "defender" },
    { player_id: id(4), team: "red", position: "forward" },
  ];
  return {
    id: `m${counter}`,
    league_id: "l",
    season_id: "s",
    blue_score: null,
    red_score: null,
    winner,
    played_at: `2026-01-${String(counter).padStart(2, "0")}T10:00:00Z`,
    created_at: `2026-01-${String(counter).padStart(2, "0")}T10:00:00Z`,
    created_by: "u",
    status: "valid",
    operation_id: `o${counter}`,
    revision: 1,
    participants,
  };
};

describe("Pronóstico de la partida", () => {
  it("sin historial reparte el pronóstico a la par", () => {
    const f = forecast(court, players, [], defaultRules)!;
    expect(f.blue.probability).toBeCloseTo(0.5, 5);
    expect(f.red.probability).toBeCloseTo(0.5, 5);
    expect(f.favourite).toBeNull();
    expect(f.sample).toBe(0);
    // Both odds are the same and the book keeps its cut, so they stay under 2.
    expect(f.blue.decimal).toBe(f.red.decimal);
    expect(f.blue.decimal).toBeLessThan(2);
  });

  it("quien gana más es favorito y paga menos", () => {
    const matches = Array.from({ length: 12 }, () => played("blue"));
    const f = forecast(court, players, matches, defaultRules)!;
    expect(f.favourite).toBe("blue");
    expect(f.blue.probability).toBeGreaterThan(f.red.probability);
    expect(f.blue.decimal).toBeLessThan(f.red.decimal);
    expect(f.sample).toBe(12);
    expect(f.blue.together).toBe(12);
  });

  it("nunca paga por debajo del mínimo ni da nada por seguro", () => {
    const matches = Array.from({ length: 80 }, () => played("red"));
    const f = forecast(court, players, matches, defaultRules)!;
    expect(f.red.probability).toBeLessThanOrEqual(0.95);
    expect(f.blue.probability).toBeGreaterThanOrEqual(0.05);
    expect(f.red.decimal).toBeGreaterThanOrEqual(1.01);
    // The pair's own record pulls the forecast, without replacing form.
    expect(f.red.strength).toBeGreaterThan(f.blue.strength);
  });

  it("no hay pronóstico sin pista", () => {
    expect(forecast(emptyState(), players, [], defaultRules)).toBeNull();
  });
});
