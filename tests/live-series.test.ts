import { describe, expect, it } from "vitest";
import {
  emptyState,
  join,
  scoreGoal,
  seriesResult,
  seriesToWin,
  startCourt,
  winsSeries,
} from "../src/domain/live";

const lineup = {
  blue: { defender: "a", forward: "b" },
  red: { defender: "c", forward: "d" },
};
const opened = () => join(emptyState(), ["a", "b", "c", "d"]);

describe("serie al mejor de N", () => {
  it("necesita la mayoría de partidas", () => {
    expect(seriesToWin(3)).toBe(2);
    expect(seriesToWin(5)).toBe(3);
    expect(seriesToWin(7)).toBe(4);
  });

  it("solo admite 3, 5 o 7 y una partida normal no abre serie", () => {
    expect(() => startCourt(opened(), lineup, 4)).toThrow(/3, 5 o 7/);
    expect(startCourt(opened(), lineup).series).toBeUndefined();
  });

  it("mantiene a los cuatro y suma partidas hasta que una pareja gana", () => {
    let s = startCourt(opened(), lineup, 3);
    expect(s.series).toEqual({ best_of: 3, wins: { blue: 0, red: 0 } });
    s = scoreGoal(s, "blue", 1, "a");
    expect(winsSeries(s, "blue")).toBe(false);
    s = seriesResult(s, "blue");
    expect(s.series?.wins).toEqual({ blue: 1, red: 0 });
    expect(s.court?.red.defender.id).toBe("c");
    expect(s.goals).toEqual({ blue: 0, red: 0 });
    expect(s.goal_log).toEqual([]);
    expect(winsSeries(s, "blue")).toBe(true);
    s = seriesResult(s, "blue");
    expect(s.court).toBeNull();
    expect(s.series).toBeUndefined();
    expect(s.last_series).toMatchObject({
      best_of: 3,
      winner: "blue",
      wins: { blue: 2, red: 0 },
    });
    expect(s.queue.map((w) => w.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(s.played).toEqual({ a: 2, b: 2, c: 2, d: 2 });
    // The next start forgets the finished series.
    expect(startCourt(s, lineup).last_series).toBeUndefined();
  });
});
