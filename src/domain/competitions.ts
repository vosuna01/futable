import type { Match, Player, Season, Snapshot } from "./types";
import { participationDays } from "./participation";
import { recalculateMMR } from "./mmr";
export const isCup = (s?: Season) => s?.competition_kind === "cup";
export const activeLeague = (data: Snapshot) =>
  data.seasons.find((s) => s.status === "active" && !isCup(s));
export function contextFirst(data: Snapshot | null, id: string) {
  if (!data) return null;
  const selected =
    data.seasons.find((s) => s.id === id && s.status === "active") ??
    activeLeague(data);
  return selected
    ? {
        ...data,
        seasons: [
          selected,
          ...data.seasons.filter((s) => s.id !== selected.id),
        ],
      }
    : data;
}
export function ratingMatches(
  data: Snapshot,
  context?: Season,
  general = false,
) {
  if (!context?.rating_epoch)
    return data.matches.filter(
      (m) => !data.seasons.find((s) => s.id === m.season_id)?.rating_epoch,
    );
  const allowed = new Set(
    data.seasons
      .filter(
        (s) =>
          s.rating_epoch === context.rating_epoch && (general || !isCup(s)),
      )
      .map((s) => s.id),
  );
  return data.matches.filter((m) => allowed.has(m.season_id));
}
export { participationDays } from "./participation";
export function competitionMmr(
  data: Snapshot,
  season?: Season,
  general = false,
) {
  const matches = ratingMatches(data, season, general || isCup(season));
  const state = recalculateMMR(data.players, matches, { forceMode: "A" });
  if (season?.rating_epoch) {
    state.reason =
      isCup(season) || general
        ? "MMR general de esta etapa · inicio en 1000"
        : "MMR de Liga · inicio en 1000";
    state.includeUnplayed = true;
    if (!general && !isCup(season))
      state.eligibility = Object.fromEntries(
        data.players.map((p) => [
          p.id,
          participationDays(
            data.matches.filter((m) => m.season_id === season.id),
            p.id,
          ) >= (season.minimum_days ?? 3),
        ]),
      );
  }
  return state;
}
export function goalRate(
  players: Player[],
  matches: Match[],
  defensive = false,
) {
  return players.map((player) => {
    let goals = 0,
      total = 0,
      games = 0;
    for (const m of matches) {
      const p = m.participants.find((p) => p.player_id === player.id);
      if (
        m.status !== "valid" ||
        !p ||
        (defensive && p.position !== "defender") ||
        m.red_score == null ||
        m.blue_score == null ||
        !m.goal_target
      )
        continue;
      if (
        !defensive &&
        (!m.scorers ||
          m.scorers.reduce((a, s) => a + s.goals, 0) !==
            m.red_score + m.blue_score)
      )
        continue;
      goals += defensive
        ? p.team === "red"
          ? m.blue_score
          : m.red_score
        : (m.scorers?.find((s) => s.player_id === player.id)?.goals ?? 0);
      total += m.goal_target;
      games++;
    }
    return {
      player,
      goals,
      total,
      games,
      rate: total ? (goals * 3) / total : null,
    };
  });
}
