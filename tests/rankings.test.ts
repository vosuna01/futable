import { describe, it, expect } from "vitest";
import {
  adjustedWR,
  compareStats,
  completeRanking,
  pairRanking,
  ranking,
  rawWR,
  improvement,
} from "../src/domain/rankings";
import { validateMatch } from "../src/domain/validation";
import {
  defaultRules,
  type Match,
  type MatchInput,
  type Player,
  type Season,
} from "../src/domain/types";
const players: Player[] = Array.from({ length: 4 }, (_, i) => ({
  id: String(i),
  league_id: "l",
  name: ["Ana", "Bea", "Carlos", "Dani"][i],
  active: true,
  avatar_url: null,
}));
const season: Season = {
  ...defaultRules,
  id: "s",
  league_id: "l",
  name: "Otoño",
  starts_at: "2026-09-01",
  ends_at: null,
  status: "active",
  final_results: null,
};
function match(i: number, blue = true, swap = false): Match {
  return {
    id: String(i),
    league_id: "l",
    season_id: "s",
    blue_score: blue ? 5 : 2,
    red_score: blue ? 2 : 5,
    winner: blue ? "blue" : "red",
    status: "valid",
    played_at: new Date(2026, 9, 1, 10, i).toISOString(),
    created_at: new Date(2026, 9, 1, 10, i).toISOString(),
    created_by: "u",
    operation_id: String(i),
    revision: 1,
    participants: players.map((p, j) => ({
      player_id: p.id,
      team: j < 2 ? "blue" : "red",
      position: (swap ? j % 2 !== 0 : j % 2 === 0) ? "defender" : "forward",
    })),
  };
}
describe("cálculos de clasificación", () => {
  it("calcula porcentajes reales y ajustados, incluido 0 partidos", () => {
    expect(rawWR(3, 4)).toBe(75);
    expect(rawWR(0, 0)).toBe(0);
    expect(adjustedWR(0, 0)).toBe(50);
    expect(adjustedWR(7, 10)).toBeCloseTo(56.66666667);
    expect(
      adjustedWR(2, 4, { ...defaultRules, prior_wins: 2, prior_games: 8 }),
    ).toBeCloseTo(100 / 3);
  });
  it("exige diez partidos y deja al provisional detrás aunque gane más", () => {
    const ms = Array.from({ length: 10 }, (_, i) => match(i, false));
    ms.push({
      ...match(11),
      participants: match(11).participants.map((p) => ({
        ...p,
        player_id: p.player_id === "0" ? "4" : p.player_id,
      })),
    });
    const r = ranking(
      [...players, { ...players[0], id: "4", name: "Élite" }],
      ms,
    );
    expect(r.find((x) => x.player.id === "0")?.qualified).toBe(true);
    expect(r.at(-1)?.player.id).toBe("4");
  });
  it("separa posiciones y calcula rachas solo en esa posición", () => {
    const ms = [
      ...Array.from({ length: 10 }, (_, i) => match(i)),
      match(10, false, true),
    ];
    const d = ranking(players, ms, defaultRules, "defender").find(
      (x) => x.player.id === "0",
    )!;
    const f = ranking(players, ms, defaultRules, "forward").find(
      (x) => x.player.id === "0",
    )!;
    expect(d.games).toBe(10);
    expect(d.wins).toBe(10);
    expect(d.streak).toBe(10);
    expect(f.games).toBe(1);
    expect(f.wins).toBe(0);
    expect(f.qualified).toBe(false);
  });
  it("exige el mínimo en ambas posiciones para jugador completo", () => {
    const ms = Array.from({ length: 20 }, (_, i) => match(i, true, i >= 10));
    const s = completeRanking(players, ms).find((x) => x.player.id === "0")!;
    expect(s.qualified).toBe(true);
    expect(s.adjusted).toBe((s.defense.adjusted + s.forward.adjusted) / 2);
    expect(
      completeRanking(players, ms.slice(0, 19)).find((x) => x.player.id === "0")
        ?.qualified,
    ).toBe(false);
  });
  it("calcula parejas sin depender de las posiciones", () => {
    const ms = Array.from({ length: 10 }, (_, i) =>
      match(i, true, i % 2 === 0),
    );
    const p = pairRanking(players, ms)[0];
    expect(p.games).toBe(10);
    expect(p.wins).toBe(10);
    expect(p.qualified).toBe(true);
    expect(pairRanking(players, ms.slice(1))[0].qualified).toBe(false);
  });
  it("aplica todos los desempates y no redondea al ordenar", () => {
    const a = ranking(players, [])[0],
      b = { ...a, player: players[1] };
    expect(compareStats(a, b)).toBeLessThan(0);
    expect(
      compareStats({ ...a, adjusted: 55.00001 }, { ...b, adjusted: 55 }),
    ).toBeLessThan(0);
    expect(compareStats({ ...a, raw: 60 }, { ...b, raw: 50 })).toBeLessThan(0);
    expect(compareStats({ ...a, games: 11 }, { ...b, games: 10 })).toBeLessThan(
      0,
    );
    expect(compareStats({ ...a, wins: 7 }, { ...b, wins: 6 })).toBeLessThan(0);
  });
  it("anular y corregir reconstruye los resultados y rachas", () => {
    const ms = [match(1), match(2, false), match(3)];
    expect(ranking(players, ms)[0].bestStreak).toBe(1);
    const corrected = [match(1), match(2), match(3)];
    expect(ranking(players, corrected)[0].bestStreak).toBe(3);
    expect(
      ranking(players, [match(1), { ...match(2), status: "void" }, match(3)])[0]
        .games,
    ).toBe(2);
  });
  it("la mejora compara dos mitades con muestra suficiente", () => {
    const ms = Array.from({ length: 20 }, (_, i) => match(i, i >= 10));
    const s = improvement(players, ms).find((p) => p.player.id === "0")!;
    expect(s.delta).toBe(100);
    expect(s.qualified).toBe(true);
  });
});
describe("validación de partidas", () => {
  const input: MatchInput = { ...match(0), operation_id: "op" };
  it("admite una partida válida", () =>
    expect(validateMatch(input, season, players)).toBeNull());
  it.each([
    [2, 0],
    [2, 1],
    [1, 3],
    [4, 3],
    [6, 1],
    [99, 0],
  ])("admite goles variables %s:%s", (a, b) =>
    expect(
      validateMatch({ ...input, blue_score: a, red_score: b }, season, players),
    ).toBeNull(),
  );
  it("exige cuatro jugadores distintos", () =>
    expect(
      validateMatch(
        {
          ...input,
          participants: [
            input.participants[0],
            ...input.participants.slice(0, 3),
          ],
        },
        season,
        players,
      ),
    ).toMatch(/diferentes/));
  it("rechaza posiciones duplicadas", () =>
    expect(
      validateMatch(
        {
          ...input,
          participants: input.participants.map((p) => ({
            ...p,
            position: "defender",
          })),
        },
        season,
        players,
      ),
    ).toMatch(/defensa/));
  it.each([
    [5, 5],
    [0, 0],
    [-1, 5],
    [5.5, 2],
    [100, 1],
    [NaN, 5],
  ])("rechaza marcador %s:%s", (a, b) =>
    expect(
      validateMatch({ ...input, blue_score: a, red_score: b }, season, players),
    ).toMatch(/ganador/),
  );
  it("rechaza temporada cerrada, jugadores inactivos y de otra liga", () => {
    expect(
      validateMatch(input, { ...season, status: "closed" }, players),
    ).toMatch(/activa/);
    expect(
      validateMatch(
        input,
        season,
        players.map((p) => ({ ...p, active: false })),
      ),
    ).toMatch(/activos/);
    expect(
      validateMatch(
        input,
        season,
        players.map((p) => ({ ...p, league_id: "otra" })),
      ),
    ).toMatch(/activos/);
  });
});
