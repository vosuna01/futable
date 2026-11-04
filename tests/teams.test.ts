import { describe, it, expect } from "vitest";
import {
  lineupSlots,
  matchLineup,
  latestValidMatch,
} from "../src/domain/teams";
import {
  defaultRules,
  type Player,
  type Season,
  type Match,
} from "../src/domain/types";
const players: Player[] = Array.from({ length: 4 }, (_, i) => ({
  id: String(i),
  league_id: "liga",
  name: "Jugador " + i,
  avatar_url: null,
  active: true,
}));
const season: Season = {
  ...defaultRules,
  id: "s",
  league_id: "liga",
  name: "Actual",
  status: "active",
  starts_at: "2026-11-04",
  ends_at: null,
  final_results: null,
};
function match(winner: "blue" | "red" = "blue"): Match {
  return {
    id: "m",
    league_id: "liga",
    season_id: "s",
    participants: lineupSlots.map((slot, i) => ({
      ...slot,
      player_id: String(i),
    })),
    winner,
    blue_score: winner === "blue" ? 3 : 1,
    red_score: winner === "red" ? 3 : 1,
    status: "valid",
    played_at: "2026-11-04T10:00:00Z",
    created_at: "2026-11-04T10:00:00Z",
    created_by: "u",
    operation_id: "op",
    revision: 1,
  };
}
describe("rey de la pista", () => {
  it.each(["blue", "red"] as const)(
    "mantiene solo los ganadores %s en sus puestos",
    (winner) => {
      const game = match(winner);
      const before = JSON.stringify(game);
      expect(matchLineup(game, season, players, true)).toEqual(
        winner === "blue" ? ["0", "1", "", ""] : ["", "", "2", "3"],
      );
      expect(JSON.stringify(game)).toBe(before);
    },
  );
  it("la primera partida y las anuladas o de otra temporada no precargan jugadores", () => {
    for (const game of [
      undefined,
      { ...match(), status: "void" as const },
      { ...match(), season_id: "otra" },
      { ...match(), league_id: "otra" },
    ])
      expect(matchLineup(game, season, players, true)).toEqual([
        "",
        "",
        "",
        "",
      ]);
  });
  it("no asigna jugadores inactivos ni de otra liga", () => {
    const ps = players.map((p, i) =>
      i === 0
        ? { ...p, active: false }
        : i === 1
          ? { ...p, league_id: "otra" }
          : p,
    );
    expect(matchLineup(match(), season, ps, true)).toEqual(["", "", "", ""]);
  });
  it("la revancha o corrección recupera los cuatro puestos originales", () => {
    expect(matchLineup(match("red"), season, players)).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
  });
  it("elige la última partida válida, no una corrección antigua movida al inicio", () => {
    const previous = {
      ...match(),
      id: "antigua",
      played_at: "2026-11-03T10:00:00Z",
      revision: 4,
    };
    const newest = { ...match("red"), id: "reciente" };
    const voided = {
      ...match(),
      id: "anulada",
      status: "void" as const,
      played_at: "2026-11-05T10:00:00Z",
    };
    const other = {
      ...voided,
      id: "otra",
      status: "valid" as const,
      season_id: "otra",
    };
    const data = [previous, voided, other, newest];
    expect(latestValidMatch(data, "s")?.id).toBe("reciente");
    expect(latestValidMatch(data, "vacía")).toBeUndefined();
    expect(data[0]).toBe(previous);
  });
});
