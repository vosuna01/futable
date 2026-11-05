import { describe, it, expect } from "vitest";
import {
  assignPosts,
  boardScore,
  emptyState,
  join,
  leave,
  liveError,
  liveParticipants,
  loserOrder,
  rotate,
  scoreGoal,
  startCourt,
  type LiveState,
} from "../src/domain/live";
import type { Player } from "../src/domain/types";

const name = (n: number) => `p${n}`;
const players: Player[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  id: name(n),
  league_id: "l",
  name: `Jugador ${n}`,
  avatar_url: null,
  active: true,
}));
const lineup = {
  blue: { defender: name(1), forward: name(2) },
  red: { defender: name(3), forward: name(4) },
};
const signedUp = (count: number): LiveState =>
  join(
    emptyState(),
    Array.from({ length: count }, (_, i) => name(i + 1)),
  );
const opened = (count: number) => startCourt(signedUp(count), lineup);

describe("Cola de la partida en directo", () => {
  it("ficha por orden de llegada y no admite repetidos", () => {
    const state = signedUp(3);
    expect(state.queue.map((w) => w.id)).toEqual([name(1), name(2), name(3)]);
    expect(state.queue.every((w) => w.since === 0)).toBe(true);
    expect(() => join(state, [name(2)])).toThrow(/ya está fichada/);
    expect(leave(state, name(2)).queue.map((w) => w.id)).toEqual([
      name(1),
      name(3),
    ]);
    expect(() => leave(state, name(6))).toThrow(/no está esperando/);
  });

  it("saca de la cola a los cuatro que empiezan", () => {
    const state = opened(5);
    expect(state.queue.map((w) => w.id)).toEqual([name(5)]);
    expect(state.court!.blue.defender).toEqual({ id: name(1), waited: 0 });
    expect(liveParticipants(state)).toHaveLength(4);
    expect(() => startCourt(state, lineup)).toThrow(/Ya hay una partida/);
    expect(() =>
      startCourt(signedUp(4), {
        blue: { defender: name(1), forward: name(1) },
        red: { defender: name(3), forward: name(4) },
      }),
    ).toThrow(/cuatro jugadores distintos/);
    expect(() =>
      startCourt(signedUp(4), {
        ...lineup,
        red: { defender: name(3), forward: name(6) },
      }),
    ).toThrow(/fichados en la cola/);
  });
});

describe("Rotación tras cada partida", () => {
  it("los ganadores no se mueven y los perdedores van al final", () => {
    const next = rotate(opened(6), "blue", 0);
    expect(next.round).toBe(1);
    expect(next.court!.blue).toEqual(opened(6).court!.blue);
    expect(next.court!.red.defender.id).toBe(name(5));
    expect(next.court!.red.forward.id).toBe(name(6));
    expect(next.queue.map((w) => w.id)).toEqual([name(3), name(4)]);
  });

  it("con cuatro justos repiten los mismos", () => {
    const next = rotate(opened(4), "red", 0);
    expect(next.queue).toHaveLength(0);
    expect(
      [next.court!.blue.defender.id, next.court!.blue.forward.id].sort(),
    ).toEqual([name(1), name(2)]);
    expect(next.court!.red).toEqual(opened(4).court!.red);
  });

  // Five players is the case that forces the tie-break: of the two who lose,
  // one steps straight back on and the other has to wait a round.
  it("con cinco uno de los perdedores vuelve ya y el otro espera", () => {
    const next = rotate(opened(5), "blue", 0);
    expect(next.court!.red.defender).toEqual({ id: name(5), waited: 1 });
    expect(next.court!.red.forward).toEqual({ id: name(3), waited: 0 });
    expect(next.queue).toEqual([{ id: name(4), since: 1 }]);
    const flipped = rotate(opened(5), "blue", 0.9);
    expect(flipped.court!.red.forward.id).toBe(name(4));
    expect(flipped.queue[0].id).toBe(name(3));
  });

  it("la espera más larga tiene preferencia sobre el sorteo", () => {
    const first = rotate(opened(5), "blue", 0);
    // Red is now p5 (waited a round) and p3 (came straight back on).
    const second = rotate(first, "blue", 0.9);
    expect(second.court!.red.defender).toEqual({ id: name(4), waited: 1 });
    expect(second.court!.red.forward).toEqual({ id: name(5), waited: 0 });
    expect(second.queue.map((w) => w.id)).toEqual([name(3)]);
    // The coin is ignored while the waits differ, so the draw cannot undo it.
    expect(rotate(first, "blue", 0).court!.red).toEqual(second.court!.red);
  });

  it("el sorteo solo decide cuando la espera es la misma", () => {
    const a = { id: name(1), waited: 2 },
      b = { id: name(2), waited: 0 };
    expect(loserOrder(a, b, 0.9)).toEqual([a, b]);
    expect(loserOrder(b, a, 0)).toEqual([a, b]);
    const tied = { id: name(2), waited: 2 };
    expect(loserOrder(a, tied, 0)).toEqual([a, tied]);
    expect(loserOrder(a, tied, 0.9)).toEqual([tied, a]);
  });

  it("reparte los puestos de quien entra sin tocar al rival", () => {
    const next = rotate(opened(6), "blue", 0);
    const swapped = assignPosts(next, "red", name(6), name(5));
    expect(swapped.court!.red.defender.id).toBe(name(6));
    expect(swapped.court!.red.forward.id).toBe(name(5));
    expect(swapped.court!.blue).toEqual(next.court!.blue);
    expect(assignPosts(next, "red", name(5), name(6))).toEqual(next);
    expect(() => assignPosts(next, "red", name(1), name(5))).toThrow(
      /repartir los puestos/,
    );
  });

  it("avisa si alguien fichado deja de estar activo", () => {
    const state = opened(5);
    expect(liveError(state, players)).toBeNull();
    expect(
      liveError(
        state,
        players.map((p) => (p.id === name(3) ? { ...p, active: false } : p)),
      ),
    ).toMatch(/activo/);
    expect(() => rotate(emptyState(), "blue", 0)).toThrow(/ninguna partida/);
  });
});

describe("Marcador en vivo", () => {
  it("suma y anula goles sin salirse del rango", () => {
    let state = opened(4);
    expect(state.goals).toEqual({ blue: 0, red: 0 });
    state = scoreGoal(state, "blue", 1);
    state = scoreGoal(state, "blue", 1);
    state = scoreGoal(state, "red", 1);
    expect(state.goals).toEqual({ blue: 2, red: 1 });
    state = scoreGoal(state, "red", -1);
    expect(state.goals.red).toBe(0);
    // Anular de más no baja de cero ni pasa de noventa y nueve.
    expect(scoreGoal(state, "red", -1).goals.red).toBe(0);
    expect(scoreGoal(state, "blue", 200).goals.blue).toBe(99);
    expect(() => scoreGoal(emptyState(), "blue", 1)).toThrow(/ninguna partida/);
  });

  it("el marcador en juego pasa a ser el de la partida", () => {
    const state = scoreGoal(scoreGoal(opened(4), "blue", 1), "blue", 1);
    expect(boardScore(state, "blue")).toEqual({ blue: 2, red: 0 });
    // A cero no se inventa un resultado: se guarda solo el ganador.
    expect(boardScore(opened(4), "red")).toEqual({ blue: null, red: null });
    expect(() => boardScore(state, "red")).toThrow(/no coincide/);
    const tied = scoreGoal(state, "red", 2);
    expect(() => boardScore(tied, "blue")).toThrow(/empatado/);
  });

  it("cada partida nueva empieza a cero", () => {
    const played = scoreGoal(scoreGoal(opened(5), "blue", 3), "red", 1);
    expect(rotate(played, "blue", 0).goals).toEqual({ blue: 0, red: 0 });
  });
});

describe("Prioridad de quien no ha jugado", () => {
  it("quien ficha después adelanta al que ya ha jugado", () => {
    // Cinco jugando: tras una partida uno de los perdedores espera.
    const after = rotate(opened(5), "blue", 0);
    const waiting = after.queue[0].id;
    expect(after.played[waiting]).toBe(1);
    // Llegan dos nuevos y se colocan por delante, aunque lleguen más tarde.
    const joined = join(after, [name(6), name(7)]);
    expect(joined.queue.map((w) => w.id)).toEqual([name(6), name(7), waiting]);
    // Y son ellos los que entran en la siguiente rotación.
    const next = rotate(joined, "blue", 0);
    expect([next.court!.red.defender.id, next.court!.red.forward.id]).toEqual([
      name(6),
      name(7),
    ]);
  });

  it("los que ya jugaron conservan su orden entre ellos", () => {
    const first = rotate(opened(6), "blue", 0);
    expect(first.queue.map((w) => w.id)).toEqual([name(3), name(4)]);
    const second = rotate(first, "blue", 0);
    // Nadie lleva cero partidos, así que manda el orden de llegada de siempre.
    expect(second.queue.every((w) => second.played[w.id] > 0)).toBe(true);
    expect(second.queue).toHaveLength(2);
  });

  it("desficharse y volver no devuelve la prioridad", () => {
    const after = rotate(opened(5), "blue", 0);
    const veteran = after.queue[0].id;
    const again = join(leave(after, veteran), [veteran]);
    expect(again.played[veteran]).toBe(1);
    const withNew = join(again, [name(6)]);
    expect(withNew.queue.map((w) => w.id)).toEqual([name(6), veteran]);
  });

  it("al empezar nadie ha jugado y manda la llegada", () => {
    const state = signedUp(5);
    expect(state.played).toEqual({});
    expect(state.queue.map((w) => w.id)).toEqual([1, 2, 3, 4, 5].map(name));
  });
});
