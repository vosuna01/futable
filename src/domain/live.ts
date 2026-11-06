import type { Participant, Player, Team } from "./types";

/** A player standing on the court, with the wait they had served before entering. */
export interface Slot {
  id: string;
  waited: number;
}
/** A player waiting, stamped with the round in which the wait started. */
export interface Waiting {
  id: string;
  since: number;
}
export interface Side {
  defender: Slot;
  forward: Slot;
}
export interface LiveState {
  round: number;
  court: { blue: Side; red: Side } | null;
  /** Goals of the match being played; everyone watching sees the same board. */
  goals: Record<Team, number>;
  /** Matches each player has played this session, kept across leaving the queue. */
  played: Record<string, number>;
  queue: Waiting[];
}
export interface LiveSession {
  id: string;
  league_id: string;
  season_id: string;
  owner_id: string;
  status: "active" | "closed";
  state: LiveState;
  revision: number;
  last_match: string | null;
  last_before: LiveState | null;
}
export type Lineup = Record<Team, { defender: string; forward: string }>;

export const emptyState = (): LiveState => ({
  round: 0,
  court: null,
  goals: { blue: 0, red: 0 },
  played: {},
  queue: [],
});
export const noGoals = (): Record<Team, number> => ({ blue: 0, red: 0 });
export const playedBy = (state: LiveState, id: string) =>
  state.played?.[id] ?? 0;
/**
 * Whoever has not played yet waits in front of whoever has, however late they
 * signed up. Inside each group the order they arrived in is kept, so the wait
 * of the losers is still settled by `loserOrder`.
 */
export function prioritise(
  queue: Waiting[],
  played: Record<string, number>,
): Waiting[] {
  return [
    ...queue.filter((w) => !(played[w.id] ?? 0)),
    ...queue.filter((w) => played[w.id] ?? 0),
  ];
}
/** Adds or cancels a goal, keeping the board inside what a match can hold. */
export function scoreGoal(
  state: LiveState,
  team: Team,
  delta: number,
): LiveState {
  if (!state.court) throw new Error("No hay ninguna partida en juego.");
  return {
    ...state,
    goals: {
      ...state.goals,
      [team]: Math.max(0, Math.min(99, (state.goals[team] ?? 0) + delta)),
    },
  };
}
/**
 * The running board becomes the match score. A board still at 0-0 saves the win
 * without a score, which the database has allowed since migration 005.
 */
export function boardScore(
  state: LiveState,
  winner: Team,
): { blue: number | null; red: number | null } {
  const { blue, red } = state.goals;
  if (!blue && !red) return { blue: null, red: null };
  if (blue === red)
    throw new Error("El marcador está empatado. Ajusta los goles.");
  if ((blue > red ? "blue" : "red") !== winner)
    throw new Error(
      "El marcador no coincide con el ganador. Ajusta los goles.",
    );
  return { blue, red };
}
export const sides = ["blue", "red"] as const;
export const posts = ["defender", "forward"] as const;

export function courtIds(state: LiveState): string[] {
  if (!state.court) return [];
  return sides.flatMap((team) => posts.map((p) => state.court![team][p].id));
}
export function stateIds(state: LiveState): string[] {
  return [...courtIds(state), ...state.queue.map((w) => w.id)];
}
export function isSignedUp(state: LiveState, playerId: string): boolean {
  return stateIds(state).includes(playerId);
}
export function liveError(state: LiveState, players: Player[]): string | null {
  const ids = stateIds(state);
  if (new Set(ids).size !== ids.length)
    return "Un jugador no puede estar dos veces en la sesión.";
  if (ids.some((id) => !players.some((p) => p.id === id && p.active)))
    return "Hay alguien fichado que ya no está activo en la liga.";
  return null;
}
/**
 * Both losers leave together, so their order in the queue has to be decided.
 * Whoever had waited longer before stepping onto the court goes first; when the
 * wait is identical — every player's first round, for instance — a coin decides.
 */
export function loserOrder(a: Slot, b: Slot, coin: number): [Slot, Slot] {
  if (a.waited !== b.waited) return a.waited > b.waited ? [a, b] : [b, a];
  return coin < 0.5 ? [a, b] : [b, a];
}
/**
 * Losers to the back of the queue, then the first two waiting step in. With an
 * empty queue the same pair returns; with an odd queue one loser re-enters at
 * once and the other waits, which is exactly what the order above settles.
 */
export function rotate(
  state: LiveState,
  winner: Team,
  coin: number,
): LiveState {
  if (!state.court) throw new Error("No hay ninguna partida en juego.");
  const loser: Team = winner === "blue" ? "red" : "blue";
  const round = state.round + 1;
  const [first, second] = loserOrder(
    state.court[loser].defender,
    state.court[loser].forward,
    coin,
  );
  // The four who just played add a match, which drops them behind anyone
  // still waiting for their first one.
  const played = { ...state.played };
  for (const id of courtIds(state)) played[id] = (played[id] ?? 0) + 1;
  const queue = prioritise(
    [
      ...state.queue,
      { id: first.id, since: round },
      { id: second.id, since: round },
    ],
    played,
  );
  const [enterDefender, enterForward] = queue;
  return {
    round,
    goals: noGoals(),
    played,
    court: {
      ...state.court,
      [loser]: {
        defender: { id: enterDefender.id, waited: round - enterDefender.since },
        forward: { id: enterForward.id, waited: round - enterForward.since },
      },
    },
    queue: queue.slice(2),
  };
}
/** Builds the opening court from four players already waiting in the queue. */
export function startCourt(state: LiveState, lineup: Lineup): LiveState {
  if (state.court) throw new Error("Ya hay una partida en juego.");
  const picked = sides.flatMap((team) => posts.map((p) => lineup[team][p]));
  if (picked.some((id) => !id) || new Set(picked).size !== 4)
    throw new Error(
      "Elige cuatro jugadores distintos para los cuatro puestos.",
    );
  const waitOf = (id: string) => {
    const entry = state.queue.find((w) => w.id === id);
    if (!entry) throw new Error("Los cuatro deben estar fichados en la cola.");
    return state.round - entry.since;
  };
  picked.forEach(waitOf);
  if (state.queue.slice(0, 4).some((w) => !picked.includes(w.id)))
    throw new Error("Deben jugar los cuatro primeros fichados en la cola.");
  const court = {
    blue: {
      defender: {
        id: lineup.blue.defender,
        waited: waitOf(lineup.blue.defender),
      },
      forward: { id: lineup.blue.forward, waited: waitOf(lineup.blue.forward) },
    },
    red: {
      defender: {
        id: lineup.red.defender,
        waited: waitOf(lineup.red.defender),
      },
      forward: { id: lineup.red.forward, waited: waitOf(lineup.red.forward) },
    },
  };
  return {
    ...state,
    court,
    goals: noGoals(),
    queue: state.queue.filter((w) => !picked.includes(w.id)),
  };
}
/** Swaps the two posts of one side; used right after a rotation. */
export function assignPosts(
  state: LiveState,
  team: Team,
  defender: string,
  forward: string,
): LiveState {
  if (!state.court) throw new Error("No hay ninguna partida en juego.");
  const side = state.court[team];
  const same = side.defender.id === defender && side.forward.id === forward;
  const swapped = side.defender.id === forward && side.forward.id === defender;
  if (!same && !swapped)
    throw new Error("Solo puedes repartir los puestos de ese equipo.");
  return {
    ...state,
    court: {
      ...state.court,
      [team]: same ? side : { defender: side.forward, forward: side.defender },
    },
  };
}
export function join(state: LiveState, ids: string[]): LiveState {
  const fresh = ids.filter((id) => id && !isSignedUp(state, id));
  if (!fresh.length) throw new Error("Esa persona ya está fichada.");
  return {
    ...state,
    queue: prioritise(
      [...state.queue, ...fresh.map((id) => ({ id, since: state.round }))],
      state.played,
    ),
  };
}
export function leave(state: LiveState, id: string): LiveState {
  if (!state.queue.some((w) => w.id === id))
    throw new Error("Esa persona no está esperando en la cola.");
  return { ...state, queue: state.queue.filter((w) => w.id !== id) };
}
export function liveParticipants(state: LiveState): Participant[] {
  if (!state.court) return [];
  return sides.flatMap((team) =>
    posts.map((position) => ({
      player_id: state.court![team][position].id,
      team,
      position,
    })),
  );
}
