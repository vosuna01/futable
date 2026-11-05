import type { Participant, Player, Team } from "./types";
export interface Pair {
  id: string;
  defender: string;
  forward: string;
}
export interface Court {
  blue: Pair | null;
  red: Pair | null;
  queue: Pair[];
}
export interface KingSession {
  id: string;
  league_id: string;
  season_id: string;
  owner_id: string;
  status: "active" | "closed";
  state: Court;
  revision: number;
  last_match: string | null;
  last_before: Court | null;
}
export function courtError(state: Court, players: Player[]): string | null {
  const pairs = [state.blue, state.red, ...state.queue].filter(
    (p): p is Pair => !!p,
  );
  const ids = pairs.flatMap((p) => [p.defender, p.forward]);
  if (!pairs.length) return "Añade al menos una pareja.";
  if (new Set(pairs.map((p) => p.id)).size !== pairs.length)
    return "Hay parejas repetidas.";
  if (new Set(ids).size !== ids.length)
    return "Un jugador solo puede estar en una pareja.";
  if (ids.some((id) => !players.some((p) => p.id === id && p.active)))
    return "Elige jugadores activos para todos los puestos.";
  return null;
}
export function advanceCourt(state: Court, winner: Team): Court {
  if (!state.blue || !state.red) throw new Error("Faltan rivales en la pista.");
  const loser = winner === "blue" ? "red" : "blue";
  // Only pairs that were already waiting can enter. Never schedule a rematch.
  return {
    ...state,
    [loser]: state.queue[0] || null,
    queue: [...state.queue.slice(1), state[loser]!],
  };
}
export function courtParticipants(state: Court): Participant[] {
  return (["blue", "red"] as const).flatMap((team) => {
    const p = state[team];
    return p
      ? [
          { player_id: p.defender, team, position: "defender" as const },
          { player_id: p.forward, team, position: "forward" as const },
        ]
      : [];
  });
}
