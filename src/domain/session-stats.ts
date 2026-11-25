/**
 * Resumen de una sesión de partida en directo: lo que ha hecho cada jugador
 * desde que se abrió la sesión hasta que se cerró.
 *
 * Las partidas de la sesión se deducen por fecha, porque la base de datos no
 * guarda a qué sesión pertenece cada una. Eso significa que una partida
 * registrada a mano mientras la sesión estaba abierta también cuenta.
 */
import type { LiveSession, LiveState } from "./live";
import { emptyState } from "./live";
import type { MmrState } from "./mmr";
import type { MmrStanding } from "./mmr-standings";
import { ranking } from "./rankings";
import type { Match, Player, Rules, Stats } from "./types";

export interface SessionRow {
  player: Player;
  /** Puesto en la sesión, empezando en 1. */
  position: number;
  games: number;
  wins: number;
  losses: number;
  goals: number;
  /** MMR sumado o restado en esta sesión; null si el MMR está apagado. */
  mmrDelta: number | null;
  /** MMR mostrado ahora mismo. */
  mmrNow: number | null;
  /** Puesto en la clasificación MMR. */
  mmrPosition: number | null;
  /** Puesto en la clasificación de la temporada. */
  leaguePosition: number | null;
}

/** Ventana de la sesión: desde que se abrió hasta que se cerró, si ya cerró. */
export function sessionWindow(
  session: Pick<LiveSession, "created_at" | "updated_at" | "status">,
) {
  return {
    from: session.created_at ?? "",
    to: session.status === "closed" ? (session.updated_at ?? null) : null,
  };
}

/** Partidas válidas de la temporada jugadas dentro de la ventana de la sesión. */
export function sessionMatches(
  session: Pick<
    LiveSession,
    "created_at" | "updated_at" | "status" | "season_id"
  >,
  matches: Match[],
): Match[] {
  const { from, to } = sessionWindow(session);
  if (!from) return [];
  return matches.filter(
    (m) =>
      m.status === "valid" &&
      m.season_id === session.season_id &&
      m.played_at >= from &&
      (!to || m.played_at <= to),
  );
}

const goalsOf = (match: Match, playerId: string) =>
  match.scorers?.find((s) => s.player_id === playerId)?.goals ?? 0;

/**
 * Tabla del día. Entran quienes han jugado alguna partida de la sesión y,
 * además, quienes están fichados aunque todavía no hayan jugado.
 */
export function sessionTable({
  matches,
  players,
  state = null,
  mmr = null,
  standings = [],
  leagueRanking = [],
}: {
  matches: Match[];
  players: Player[];
  /** Estado de la sesión, para incluir a los fichados sin partidas. */
  state?: LiveState | null;
  mmr?: MmrState | null;
  standings?: MmrStanding[];
  leagueRanking?: Stats[];
}): SessionRow[] {
  const ids = new Set<string>();
  for (const m of matches) for (const p of m.participants) ids.add(p.player_id);
  if (state) for (const id of Object.keys(state.played ?? {})) ids.add(id);
  if (state) for (const w of state.queue) ids.add(w.id);

  const matchIds = new Set(matches.map((m) => m.id));
  const deltaOf = (playerId: string) =>
    mmr
      ? mmr.mmr_history
          .filter((r) => matchIds.has(r.match_id) && r.player_id === playerId)
          .reduce((sum, r) => sum + r.delta, 0)
      : null;

  return [...ids]
    .flatMap((id) => {
      const player = players.find((p) => p.id === id);
      if (!player) return [];
      const played = matches.filter((m) =>
        m.participants.some((p) => p.player_id === id),
      );
      const wins = played.filter((m) =>
        m.participants.some((p) => p.player_id === id && p.team === m.winner),
      ).length;
      const standing = standings.find((s) => s.player.id === id);
      const league = leagueRanking.findIndex((s) => s.player.id === id);
      return [
        {
          player,
          position: 0,
          games: played.length,
          wins,
          losses: played.length - wins,
          goals: played.reduce((sum, m) => sum + goalsOf(m, id), 0),
          mmrDelta: deltaOf(id),
          mmrNow: standing ? standing.shown : null,
          mmrPosition: standing ? standing.position : null,
          leaguePosition: league >= 0 ? league + 1 : null,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.wins / (b.games || 1) - a.wins / (a.games || 1) ||
        b.goals - a.goals ||
        b.games - a.games ||
        a.player.name.localeCompare(b.player.name, "es"),
    )
    .map((row, i) => ({ ...row, position: i + 1 }));
}

/** Clasificación de la temporada, para la columna de puesto general. */
export const leagueRankingOf = (
  players: Player[],
  matches: Match[],
  rules: Rules,
) => ranking(players, matches, rules);

/**
 * Sesión ficticia que cubre el último día con partidas. La demostración no
 * guarda sesiones, así que sin esto el resumen de Inicio nunca se vería.
 */
export function lastDaySession(
  matches: Match[],
  seasonId: string,
  leagueId: string,
): LiveSession | null {
  const valid = matches
    .filter((m) => m.status === "valid" && m.season_id === seasonId)
    .sort((a, b) => b.played_at.localeCompare(a.played_at));
  if (!valid.length) return null;
  const day = valid[0].played_at.slice(0, 10);
  const sameDay = valid.filter((m) => m.played_at.startsWith(day));
  return {
    id: `demo-${day}`,
    league_id: leagueId,
    season_id: seasonId,
    owner_id: "demo",
    status: "closed",
    state: emptyState(),
    revision: 1,
    last_match: null,
    last_before: null,
    created_at: sameDay[sameDay.length - 1].played_at,
    updated_at: sameDay[0].played_at,
  };
}
