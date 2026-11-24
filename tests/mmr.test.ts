import { describe, it, expect } from "vitest";
import {
  applyMatch,
  checkHistory,
  expected,
  formatTeamDelta,
  previewMatch,
  K_NEW,
  K_SETTLED,
  kFactor,
  matchDeltas,
  recalculateMMR,
  seedFromWinrate,
  type MmrState,
} from "../src/domain/mmr";
import type { Match, Player } from "../src/domain/types";

const players: Player[] = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i}`,
  league_id: "l",
  name: ["Ana", "Bea", "Carlos", "Dani", "Eva", "Fran"][i],
  active: true,
  avatar_url: null,
}));
/** `team` = ids [azul1, azul2, rojo1, rojo2]. */
function match(
  i: number,
  team: string[],
  winner: "blue" | "red" = "blue",
  extra: Partial<Match> = {},
): Match {
  const at = new Date(Date.UTC(2026, 9, 1, 10, i)).toISOString();
  return {
    id: `m${String(i).padStart(3, "0")}`,
    league_id: "l",
    season_id: "s",
    blue_score: winner === "blue" ? 3 : 1,
    red_score: winner === "blue" ? 1 : 3,
    winner,
    status: "valid",
    played_at: at,
    created_at: at,
    created_by: "u",
    operation_id: `o${i}`,
    revision: 1,
    participants: team.map((id, j) => ({
      player_id: id,
      team: j < 2 ? "blue" : "red",
      position: j % 2 === 0 ? "defender" : "forward",
    })),
    ...extra,
  };
}
const fresh = (): MmrState => ({
  player_mmr: {},
  mmr_history: [],
  mode: "A",
  reason: "test",
});
const ids = ["p0", "p1", "p2", "p3"];

describe("MMR: cálculo Elo", () => {
  it("equipos iguales → E = 0.5 y Δ = ±K/2", () => {
    expect(expected(1000, 1000)).toBe(0.5);
    const rows = applyMatch(fresh(), match(1, ids));
    for (const r of rows)
      expect(r.delta).toBeCloseTo(r.player_id < "p2" ? K_NEW / 2 : -K_NEW / 2);
  });
  it("equipo 1300 frente a 1100 → E ≈ 0.76", () => {
    expect(expected(1300, 1100)).toBeCloseTo(0.76, 2);
    expect(expected(1100, 1300)).toBeCloseTo(0.24, 2);
  });
  it("el nivel del equipo es la media del MMR de sus jugadores", () => {
    const s = fresh();
    s.player_mmr.p0 = {
      player_id: "p0",
      mmr: 1400,
      mmr_source: "history",
      partidos_contados: 50,
    };
    s.player_mmr.p1 = {
      player_id: "p1",
      mmr: 1200,
      mmr_source: "history",
      partidos_contados: 50,
    };
    s.player_mmr.p2 = {
      player_id: "p2",
      mmr: 1100,
      mmr_source: "history",
      partidos_contados: 50,
    };
    s.player_mmr.p3 = {
      player_id: "p3",
      mmr: 1100,
      mmr_source: "history",
      partidos_contados: 50,
    };
    const rows = applyMatch(s, match(1, ids));
    const e = expected(1300, 1100);
    expect(rows[0].delta).toBeCloseTo(K_SETTLED * (1 - e));
    expect(rows[2].delta).toBeCloseTo(K_SETTLED * (0 - (1 - e)));
  });
  it("en un 2c2 con K iguales la suma de todos los Δ es 0 y cada equipo recibe el mismo Δ", () => {
    const s = fresh();
    applyMatch(s, match(1, ids));
    const rows = applyMatch(s, match(2, ["p0", "p2", "p1", "p3"], "red"));
    expect(rows.reduce((t, r) => t + r.delta, 0)).toBeCloseTo(0, 10);
    expect(rows[0].delta).toBeCloseTo(rows[1].delta);
    expect(rows[2].delta).toBeCloseTo(rows[3].delta);
  });
  it("K = 40 en las 10 primeras partidas y 24 después", () => {
    expect(kFactor(0)).toBe(40);
    expect(kFactor(9)).toBe(40);
    expect(kFactor(10)).toBe(24);
    const s = fresh();
    for (let i = 0; i < 11; i++) applyMatch(s, match(i, ids));
    const p0 = s.mmr_history.filter((r) => r.player_id === "p0");
    expect(Math.abs(p0[9].delta)).toBeGreaterThan(Math.abs(p0[10].delta));
    expect(s.player_mmr.p0.partidos_contados).toBe(11);
  });
  it("una partida sin ganador lanza error", () => {
    const bad = { ...match(1, ids), winner: undefined } as unknown as Match;
    expect(() => applyMatch(fresh(), bad)).toThrow(/ganador/);
    const tie = { ...match(2, ids), winner: null } as unknown as Match;
    expect(() =>
      recalculateMMR(players, [match(1, ids), tie], { forceMode: "A" }),
    ).toThrow(/ganador/);
  });
  it("las partidas anuladas no mueven el MMR", () => {
    const s = fresh();
    expect(applyMatch(s, match(1, ids, "blue", { status: "void" }))).toEqual(
      [],
    );
    expect(s.mmr_history).toEqual([]);
  });
});

describe("MMR: siembra por winrate (modo B)", () => {
  it("winrate 50 % → 1000; 60,9 % → ≈ 1154; 25,9 % → ≈ 635", () => {
    expect(seedFromWinrate(10, 20)).toBe(1000);
    expect(Math.round(seedFromWinrate(609, 1000))).toBe(1154);
    expect(Math.round(seedFromWinrate(259, 1000))).toBe(635);
  });
  it("menos de 10 partidas → 1000, y el winrate se limita a [0.05, 0.95]", () => {
    expect(seedFromWinrate(9, 9)).toBe(1000);
    expect(seedFromWinrate(20, 20)).toBeCloseTo(seedFromWinrate(19, 20));
    expect(seedFromWinrate(0, 20)).toBeCloseTo(seedFromWinrate(1, 20));
  });
  it("siembra con los PJ previos y solo las partidas posteriores mueven el MMR con K = 24", () => {
    const history = Array.from({ length: 12 }, (_, i) =>
      match(i, ids, i < 9 ? "blue" : "red"),
    );
    const later = match(50, ids, "red");
    const s = recalculateMMR(players, [...history, later], {
      forceMode: "B",
      seededAt: history[11].played_at,
    });
    expect(s.mode).toBe("B");
    expect(s.player_mmr.p0.mmr_source).toBe("winrate");
    expect(s.mmr_history.map((r) => r.match_id)).toEqual(
      Array(4).fill(later.id),
    );
    const r = s.mmr_history.find((x) => x.player_id === "p0")!;
    expect(r.mmr_antes).toBeCloseTo(seedFromWinrate(9, 12));
    expect(Math.abs(r.delta)).toBeLessThanOrEqual(K_SETTLED);
    expect(s.player_mmr.p4.mmr).toBe(1000);
  });
});

describe("MMR: arranque y recálculo", () => {
  const history = [
    match(3, ["p0", "p1", "p2", "p3"]),
    match(1, ["p0", "p2", "p4", "p5"], "red"),
    match(2, ["p1", "p3", "p4", "p5"]),
    match(4, ["p5", "p1", "p0", "p4"], "red", { status: "void" }),
  ];
  it("con historial coherente usa el modo A y lo explica", () => {
    const s = recalculateMMR(players, history);
    expect(s.mode).toBe("A");
    expect(s.reason).toMatch(/coherente con V\/PJ \(3 partidas\)/);
    expect(
      Object.values(s.player_mmr).every((p) => p.mmr_source === "history"),
    ).toBe(true);
    expect(s.player_mmr.p0.partidos_contados).toBe(2);
  });
  it("procesa en orden de fecha y, si coincide, por id", () => {
    const same = history[0].played_at;
    const tied = [
      match(9, ids, "red", { id: "z", played_at: same }),
      match(9, ids, "blue", { id: "a", played_at: same }),
    ];
    const order = [
      ...new Set(
        recalculateMMR(players, tied).mmr_history.map((r) => r.match_id),
      ),
    ];
    expect(order).toEqual(["a", "z"]);
    expect([
      ...new Set(
        recalculateMMR(players, history).mmr_history.map((r) => r.match_id),
      ),
    ]).toEqual(["m001", "m002", "m003"]);
  });
  it("es idempotente: dos ejecuciones dan el mismo resultado", () => {
    expect(recalculateMMR(players, history)).toEqual(
      recalculateMMR(players, history),
    );
  });
  it("el alta incremental coincide con recalcular desde cero", () => {
    const next = match(10, ["p4", "p5", "p0", "p1"]);
    const incremental = recalculateMMR(players, history);
    applyMatch(incremental, next);
    const full = recalculateMMR(players, [...history, next]);
    expect(incremental.player_mmr).toEqual(full.player_mmr);
    expect(incremental.mmr_history).toEqual(full.mmr_history);
  });
  it("sin partidas válidas pasa al modo B e indica el motivo", () => {
    const s = recalculateMMR(players, []);
    expect(s.mode).toBe("B");
    expect(s.reason).toMatch(/no hay partidas/);
    expect(checkHistory(players, history)).toEqual({ ok: true, games: 3 });
  });
  it("devuelve el Δ de cada jugador en una partida", () => {
    const s = recalculateMMR(players, history);
    const d = matchDeltas(s, "m003");
    expect(d.size).toBe(4);
    expect([...d.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
    expect(matchDeltas(s, "m004").size).toBe(0);
  });
});

describe("MMR: previsión en la partida en directo", () => {
  const history = [
    match(1, ["p0", "p1", "p2", "p3"]),
    match(2, ["p0", "p2", "p4", "p5"]),
    match(3, ["p1", "p3", "p4", "p5"], "red"),
  ];
  const teams = { blue: ["p0", "p1"], red: ["p4", "p5"] };
  it("coincide con lo que da applyMatch al jugar la partida", () => {
    const state = recalculateMMR(players, history);
    const preview = previewMatch(state, teams);
    for (const winner of ["blue", "red"] as const) {
      const played = recalculateMMR(players, history);
      const rows = applyMatch(
        played,
        match(9, ["p0", "p1", "p4", "p5"], winner),
      );
      const blue = rows
        .filter((r) => teams.blue.includes(r.player_id))
        .map((r) => r.delta);
      const red = rows
        .filter((r) => teams.red.includes(r.player_id))
        .map((r) => r.delta);
      expect(blue).toEqual(
        winner === "blue" ? preview.blue.win : preview.blue.lose,
      );
      expect(red).toEqual(
        winner === "red" ? preview.red.win : preview.red.lose,
      );
    }
  });
  it("no modifica el MMR interno", () => {
    const state = recalculateMMR(players, history);
    const before = structuredClone(state);
    previewMatch(state, teams);
    expect(state).toEqual(before);
  });
  it("muestra un valor si los K coinciden y ambos si difieren", () => {
    expect(formatTeamDelta([12.2, 12.2])).toBe("+12");
    expect(formatTeamDelta([12, 20])).toBe("+12/+20");
    expect(formatTeamDelta([-12, -12])).toBe("−12");
  });
});
