import { describe, it, expect } from "vitest";
import {
  displayedMmr,
  localDate,
  PENALTY_CONFIG,
  penaltyWindow,
  regularityPenalties,
  type PenaltyConfig,
} from "../src/domain/mmr-penalty";
import { applyMatch, recalculateMMR, type MmrState } from "../src/domain/mmr";
import type { Match, Player } from "../src/domain/types";

const players: Player[] = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i}`,
  league_id: "l",
  name: `J${i}`,
  active: true,
  avatar_url: null,
}));
let seq = 0;
/** Partida jugada el día `day` (AAAA-MM-DD) a las 12:00 de Madrid. */
function match(
  day: string,
  team = ["p0", "p1", "p2", "p3"],
  extra: Partial<Match> = {},
): Match {
  const at = `${day}T11:00:00.000Z`;
  const id = `m${String(seq++).padStart(4, "0")}`;
  return {
    id,
    league_id: "l",
    season_id: "s",
    blue_score: 3,
    red_score: 1,
    winner: "blue",
    status: "valid",
    played_at: at,
    created_at: at,
    created_by: "u",
    operation_id: id,
    revision: 1,
    participants: team.map((player_id, j) => ({
      player_id,
      team: j < 2 ? "blue" : "red",
      position: j % 2 === 0 ? "defender" : "forward",
    })),
    ...extra,
  };
}
const many = (day: string, n: number, team?: string[]) =>
  Array.from({ length: n }, () => match(day, team));
/** Configuración con activación lejana: ventana completa. */
const cfg = (over: Partial<PenaltyConfig> = {}): PenaltyConfig => ({
  ...PENALTY_CONFIG,
  startDate: "2026-01-01",
  ...over,
});
const NOW = new Date("2026-12-31T18:00:00.000Z"); // 31/12 en Madrid

describe("Penalización por regularidad", () => {
  it("40 o más partidas en 28 días → 0; 30 → −20; 0 → −80", () => {
    const ms = [
      ...many("2026-12-20", 30),
      ...many("2026-12-25", 10, ["p0", "p4", "p2", "p5"]),
    ];
    const pen = regularityPenalties(players, ms, NOW, cfg());
    expect(pen.get("p0")).toEqual({
      games: 40,
      required: 40,
      missing: 0,
      penalty: 0,
    });
    expect(pen.get("p1")).toEqual({
      games: 30,
      required: 40,
      missing: 10,
      penalty: 20,
    });
    expect(pen.get("p4")!.penalty).toBe(60);
    expect(
      regularityPenalties(players, [], NOW, cfg()).get("p0")!.penalty,
    ).toBe(80);
  });
  it("una semana sin jugar y la siguiente con 20 se compensa (ventana de 2 semanas)", () => {
    const pen = regularityPenalties(
      players,
      many("2026-12-28", 20),
      NOW,
      cfg({ windowWeeks: 2 }),
    );
    expect(pen.get("p0")!.penalty).toBe(0);
  });
  it("tras jugar las partidas que faltan la penalización vuelve a 0", () => {
    const ms = many("2026-12-10", 30);
    expect(
      regularityPenalties(players, ms, NOW, cfg()).get("p0")!.missing,
    ).toBe(10);
    ms.push(...many("2026-12-30", 10));
    expect(
      regularityPenalties(players, ms, NOW, cfg()).get("p0")!.penalty,
    ).toBe(0);
  });
  it("las partidas que salen de la ventana o están anuladas no cuentan", () => {
    const ms = [
      ...many("2026-12-03", 40), // 29 días antes: fuera
      ...many("2026-12-04", 5), // día 1 de la ventana
      match("2026-12-30", undefined, { status: "void" }),
    ];
    expect(regularityPenalties(players, ms, NOW, cfg()).get("p0")!.games).toBe(
      5,
    );
  });
  it("usa la fecha de Madrid: las 23:30 UTC del 3/12 ya son el 4/12", () => {
    expect(localDate("2026-12-03T23:30:00.000Z", "Europe/Madrid")).toBe(
      "2026-12-04",
    );
    const late = match("2026-12-03", undefined, {
      played_at: "2026-12-03T23:30:00.000Z",
    });
    expect(
      regularityPenalties(players, [late], NOW, cfg()).get("p0")!.games,
    ).toBe(1);
  });
  it("tras una activación reciente el mínimo es proporcional", () => {
    const start = cfg({ startDate: "2026-12-29" }); // 29, 30 y 31: 3 días
    expect(penaltyWindow(NOW, start)).toMatchObject({ days: 3, required: 5 });
    const pen = regularityPenalties(
      players,
      [...many("2026-12-20", 10), ...many("2026-12-30", 2)],
      NOW,
      start,
    );
    expect(pen.get("p0")).toEqual({
      games: 2,
      required: 5,
      missing: 3,
      penalty: 6,
    });
    expect(
      penaltyWindow(new Date("2026-12-28T12:00:00Z"), start).required,
    ).toBe(0);
    expect(
      penaltyWindow(new Date("2027-03-01T12:00:00Z"), start).required,
    ).toBe(40);
  });
  it("MMR mostrado = MMR interno − penalización", () => {
    expect(
      displayedMmr(1120, { games: 30, required: 40, missing: 10, penalty: 20 }),
    ).toBe(1100);
    expect(displayedMmr(1120, null)).toBe(1120);
  });
});

describe("La penalización no toca el Elo", () => {
  it("dos jugadores con el mismo MMR interno y distinta penalización ganan el mismo Δ", () => {
    const base = (): MmrState => ({
      player_mmr: Object.fromEntries(
        players.map((p) => [
          p.id,
          {
            player_id: p.id,
            mmr: 1000,
            mmr_source: "history" as const,
            partidos_contados: 50,
          },
        ]),
      ),
      mmr_history: [],
      mode: "A",
      reason: "test",
    });
    const history = many("2026-12-20", 40, ["p0", "p2", "p3", "p5"]);
    const pen = regularityPenalties(players, history, NOW, cfg());
    expect(pen.get("p0")!.penalty).toBe(0);
    expect(pen.get("p4")!.penalty).toBe(80);
    const withP0 = applyMatch(
      base(),
      match("2026-12-31", ["p0", "p1", "p2", "p3"]),
    );
    const withP4 = applyMatch(
      base(),
      match("2026-12-31", ["p4", "p1", "p2", "p3"]),
    );
    expect(withP0[0].delta).toBe(withP4[0].delta);
    expect(withP0.map((r) => r.delta)).toEqual(withP4.map((r) => r.delta));
  });
  it("calcular la penalización no cambia el MMR interno guardado", () => {
    const ms = [
      ...many("2026-12-20", 12),
      ...many("2026-12-22", 5, ["p4", "p5", "p0", "p1"]),
    ];
    const state = recalculateMMR(players, ms);
    const before = structuredClone(state);
    const pen = regularityPenalties(players, ms, NOW, cfg());
    for (const p of players)
      displayedMmr(state.player_mmr[p.id].mmr, pen.get(p.id));
    expect(state).toEqual(before);
    expect(recalculateMMR(players, ms)).toEqual(before);
  });
});
