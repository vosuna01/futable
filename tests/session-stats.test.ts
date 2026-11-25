import { describe, it, expect } from "vitest";
import {
  lastDaySession,
  sessionMatches,
  sessionTable,
  sessionWindow,
} from "../src/domain/session-stats";
import { emptyState, join, type LiveSession } from "../src/domain/live";
import { defaultRules, type Match, type Player } from "../src/domain/types";
import { ranking } from "../src/domain/rankings";

const name = (n: number) => `p${n}`;
const players: Player[] = [1, 2, 3, 4, 5].map((n) => ({
  id: name(n),
  league_id: "l",
  name: `Jugador ${n}`,
  avatar_url: null,
  active: true,
}));
const season = "s1";
const session = (over: Partial<LiveSession> = {}): LiveSession => ({
  id: "k1",
  league_id: "l",
  season_id: season,
  owner_id: "u",
  status: "closed",
  state: emptyState(),
  revision: 2,
  last_match: null,
  last_before: null,
  created_at: "2026-11-25T17:00:00.000Z",
  updated_at: "2026-11-25T19:00:00.000Z",
  ...over,
});
let counter = 0;
const match = (
  at: string,
  blue: [string, string],
  red: [string, string],
  winner: "blue" | "red",
  over: Partial<Match> = {},
): Match => {
  counter += 1;
  return {
    id: `m${counter}`,
    league_id: "l",
    season_id: season,
    blue_score: null,
    red_score: null,
    winner,
    played_at: at,
    created_at: at,
    created_by: "u",
    status: "valid",
    operation_id: `o${counter}`,
    revision: 1,
    participants: [
      { player_id: blue[0], team: "blue", position: "defender" },
      { player_id: blue[1], team: "blue", position: "forward" },
      { player_id: red[0], team: "red", position: "defender" },
      { player_id: red[1], team: "red", position: "forward" },
    ],
    ...over,
  };
};

describe("Partidas de una sesión", () => {
  it("toma solo las válidas de la temporada dentro de la ventana", () => {
    const inside = match(
      "2026-11-25T18:00:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "blue",
    );
    const before = match(
      "2026-11-25T16:00:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "blue",
    );
    const after = match(
      "2026-11-25T20:00:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "blue",
    );
    const voided = match(
      "2026-11-25T18:30:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "blue",
      { status: "void" },
    );
    const other = match(
      "2026-11-25T18:30:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "blue",
      { season_id: "s2" },
    );
    const got = sessionMatches(session(), [
      inside,
      before,
      after,
      voided,
      other,
    ]);
    expect(got.map((m) => m.id)).toEqual([inside.id]);
  });

  it("una sesión abierta no tiene final, así que cuenta hasta ahora", () => {
    const later = match(
      "2030-01-01T10:00:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "red",
    );
    const open = session({ status: "active" });
    expect(sessionWindow(open).to).toBeNull();
    expect(sessionMatches(open, [later]).map((m) => m.id)).toEqual([later.id]);
  });
});

describe("Tabla del día", () => {
  const first = match(
    "2026-11-25T17:30:00.000Z",
    [name(1), name(2)],
    [name(3), name(4)],
    "blue",
    { scorers: [{ player_id: name(1), goals: 2 }] },
  );
  const second = match(
    "2026-11-25T18:00:00.000Z",
    [name(1), name(2)],
    [name(3), name(5)],
    "red",
    {
      scorers: [
        { player_id: name(5), goals: 3 },
        { player_id: name(2), goals: 1 },
      ],
    },
  );
  const matches = [first, second];

  it("cuenta partidas, victorias, derrotas y goles", () => {
    const rows = sessionTable({ matches, players });
    const one = rows.find((r) => r.player.id === name(1))!;
    expect(one).toMatchObject({ games: 2, wins: 1, losses: 1, goals: 2 });
    const three = rows.find((r) => r.player.id === name(3))!;
    expect(three).toMatchObject({ games: 2, wins: 1, losses: 1, goals: 0 });
    const five = rows.find((r) => r.player.id === name(5))!;
    expect(five).toMatchObject({ games: 1, wins: 1, losses: 0, goals: 3 });
  });

  it("ordena por victorias y luego por porcentaje", () => {
    const rows = sessionTable({ matches, players });
    // p5 gana su única partida, así que manda sobre quienes ganaron 1 de 2.
    expect(rows[0].player.id).toBe(name(5));
    expect(rows[0].position).toBe(1);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("suma el MMR ganado solo de las partidas de la sesión", () => {
    const mmr = {
      player_mmr: {},
      mode: "A" as const,
      reason: "",
      mmr_history: [
        { match_id: first.id, player_id: name(1), mmr_antes: 1000, delta: 12, mmr_despues: 1012 },
        { match_id: second.id, player_id: name(1), mmr_antes: 1012, delta: -9, mmr_despues: 1003 },
        { match_id: "fuera", player_id: name(1), mmr_antes: 900, delta: 50, mmr_despues: 950 },
      ],
    };
    const rows = sessionTable({ matches, players, mmr });
    expect(rows.find((r) => r.player.id === name(1))!.mmrDelta).toBe(3);
    expect(rows.find((r) => r.player.id === name(2))!.mmrDelta).toBe(0);
  });

  it("en una sesión abierta aparecen los fichados sin partidas", () => {
    const state = join(emptyState(), [name(5)]);
    const rows = sessionTable({ matches: [], players, state });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      games: 0,
      wins: 0,
      losses: 0,
      goals: 0,
      position: 1,
    });
    // Sin estado no hay a quién mostrar hasta que se juegue.
    expect(sessionTable({ matches: [], players })).toHaveLength(0);
  });

  it("añade el puesto de la clasificación de temporada cuando se le pasa", () => {
    const leagueRanking = ranking(players, matches, defaultRules);
    const rows = sessionTable({ matches, players, leagueRanking });
    for (const row of rows) expect(row.leaguePosition).toBeGreaterThan(0);
  });
});

describe("Última jornada de la demostración", () => {
  it("cubre solo el último día con partidas", () => {
    const old = match(
      "2026-11-24T18:00:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "blue",
    );
    const early = match(
      "2026-11-25T10:00:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "red",
    );
    const late = match(
      "2026-11-25T12:00:00.000Z",
      [name(1), name(2)],
      [name(3), name(4)],
      "blue",
    );
    const demo = lastDaySession([old, early, late], season, "l")!;
    expect(demo.status).toBe("closed");
    expect(demo.created_at).toBe(early.played_at);
    expect(demo.updated_at).toBe(late.played_at);
    // La jornada anterior se queda fuera de la ventana.
    expect(sessionMatches(demo, [old, early, late]).map((m) => m.id)).toEqual([
      early.id,
      late.id,
    ]);
    expect(lastDaySession([], season, "l")).toBeNull();
  });
});
