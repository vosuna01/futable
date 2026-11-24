import { describe, it, expect } from "vitest";
import {
  assignPosts,
  emptyState,
  entryPosts,
  goalLog,
  goalsBy,
  join,
  proposedLineup,
  queuePairs,
  rotate,
  scoreGoal,
  setPost,
  startCourt,
  type LiveState,
  type Waiting,
} from "../src/domain/live";

const p = (n: number) => `p${n}`;
const lineup = {
  blue: { defender: p(1), forward: p(2) },
  red: { defender: p(3), forward: p(4) },
};
const opened = (count: number): LiveState =>
  startCourt(
    join(
      emptyState(),
      Array.from({ length: count }, (_, i) => p(i + 1)),
    ),
    lineup,
  );

describe("Goles por jugador", () => {
  it("acredita el gol al jugador y lo suma al equipo", () => {
    let state = scoreGoal(opened(4), "blue", 1, p(2));
    state = scoreGoal(state, "blue", 1, p(2));
    state = scoreGoal(state, "red", 1);
    expect(state.goals).toEqual({ blue: 2, red: 1 });
    expect(goalsBy(state)).toEqual({ [p(2)]: 2 });
  });

  it("rechaza a quien no está en ese equipo", () => {
    expect(() => scoreGoal(opened(4), "red", 1, p(1))).toThrow(
      /no está en ese equipo/,
    );
  });

  it("quitar un gol borra el último del jugador, o el último del equipo", () => {
    let state = scoreGoal(opened(4), "blue", 1, p(1));
    state = scoreGoal(state, "blue", 1, p(2));
    state = scoreGoal(state, "blue", -1, p(1));
    expect(goalsBy(state)).toEqual({ [p(2)]: 1 });
    expect(() => scoreGoal(state, "blue", -1, p(1))).toThrow(/no tiene goles/);
    state = scoreGoal(state, "blue", -1);
    expect(state.goals.blue).toBe(0);
    // Below zero there is nothing left to take back.
    expect(scoreGoal(state, "blue", -1).goals.blue).toBe(0);
  });

  it("un marcador sin registro (antes de la 008) se reconstruye sin goleador", () => {
    const old: LiveState = { ...opened(4), goals: { blue: 2, red: 1 } };
    delete old.goal_log;
    expect(goalLog(old)).toHaveLength(3);
    const next = scoreGoal(old, "red", 1, p(3));
    expect(next.goals).toEqual({ blue: 2, red: 2 });
    expect(goalsBy(next)).toEqual({ [p(3)]: 1 });
  });

  it("intercambiar puestos conserva los goles", () => {
    let state = scoreGoal(opened(4), "blue", 1, p(1));
    state = assignPosts(state, "blue", p(2), p(1));
    expect(goalsBy(state)).toEqual({ [p(1)]: 1 });
  });

  it("una partida nueva empieza sin goleadores", () => {
    const state = rotate(scoreGoal(opened(6), "blue", 1, p(1)), "blue", 0);
    expect(state.goal_log).toEqual([]);
    expect(goalsBy(state)).toEqual({});
  });
});

describe("Alineación de la cola", () => {
  it("el primero elige; si no elige, cuenta lo del segundo; si nadie, defiende el primero", () => {
    const a: Waiting = { id: "a", since: 0 },
      b: Waiting = { id: "b", since: 0 };
    expect(entryPosts(a, b).defender.id).toBe("a");
    expect(entryPosts({ ...a, post: "forward" as const }, b).defender.id).toBe(
      "b",
    );
    expect(entryPosts(a, { ...b, post: "defender" as const }).defender.id).toBe(
      "b",
    );
    expect(
      entryPosts(
        { ...a, post: "defender" as const },
        { ...b, post: "defender" as const },
      ).defender.id,
    ).toBe("a");
  });

  it("fija y borra el puesto de quien espera", () => {
    let state = setPost(opened(6), p(5), "forward");
    expect(state.queue[0]).toEqual({ id: p(5), since: 0, post: "forward" });
    state = setPost(state, p(5), null);
    expect(state.queue[0]).toEqual({ id: p(5), since: 0 });
    expect(() => setPost(state, p(1), "forward")).toThrow(/no está esperando/);
  });

  it("la pareja que entra tras la partida respeta lo acordado", () => {
    const state = rotate(setPost(opened(6), p(5), "forward"), "blue", 0);
    expect(state.court!.red.defender.id).toBe(p(6));
    expect(state.court!.red.forward.id).toBe(p(5));
    // Entering clears the agreed post: it is a court slot now.
    expect(state.court!.red.forward).toEqual({ id: p(5), waited: 1 });
  });

  it("con cola impar, quien espera solo se empareja con un perdedor", () => {
    const state = rotate(setPost(opened(5), p(5), "forward"), "blue", 0);
    expect(state.court!.red.forward.id).toBe(p(5));
    expect([p(3), p(4)]).toContain(state.court!.red.defender.id);
  });

  it("lee la cola de dos en dos con los puestos que tocan", () => {
    const state = setPost(
      join(emptyState(), [1, 2, 3].map(p)),
      p(1),
      "forward",
    );
    const pairs = queuePairs(state.queue);
    expect(pairs[0].defender?.id).toBe(p(2));
    expect(pairs[0].forward?.id).toBe(p(1));
    expect(pairs[1]).toEqual({ defender: state.queue[2], forward: null });
    expect(
      queuePairs(setPost(state, p(3), "forward").queue)[1].defender,
    ).toBeNull();
  });

  it("sin azar propone el orden de llegada con lo acordado: Madrid y luego Barça", () => {
    const state = setPost(
      join(emptyState(), [1, 2, 3, 4].map(p)),
      p(3),
      "forward",
    );
    expect(proposedLineup(state.queue, () => 0)).toEqual({
      red: { defender: p(1), forward: p(2) },
      blue: { defender: p(4), forward: p(3) },
    });
  });

  it("reparte a los cuatro primeros en parejas y lados al azar", () => {
    const state = setPost(
      join(emptyState(), [1, 2, 3, 4, 5].map(p)),
      p(3),
      "forward",
    );
    const seen = new Set<string>();
    // Recorre todas las combinaciones del azar: compañero (3) × lado (2).
    for (const a of [0, 0.34, 0.67, 0.99])
      for (const b of [0, 0.99]) {
        const draws = [a, b];
        const lineup = proposedLineup(state.queue, () => draws.shift()!);
        const ids = [
          lineup.red.defender,
          lineup.red.forward,
          lineup.blue.defender,
          lineup.blue.forward,
        ];
        // Siempre los cuatro primeros de la cola, nunca el quinto.
        expect([...ids].sort()).toEqual([p(1), p(2), p(3), p(4)].sort());
        // Quien pidió delantero sigue de delantero.
        expect([lineup.red.forward, lineup.blue.forward]).toContain(p(3));
        const pairOf1 = ids.slice(0, 2).includes(p(1))
          ? ids.slice(0, 2)
          : ids.slice(2);
        seen.add(
          `${pairOf1.find((x) => x !== p(1))}:${lineup.red.defender === p(1) || lineup.red.forward === p(1) ? "red" : "blue"}`,
        );
      }
    // Las tres parejas posibles de p(1), en los dos lados.
    expect(seen.size).toBe(6);
  });
});
