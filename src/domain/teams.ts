import type { Match, Player, Season, Team } from "./types";

export const teamNames: Record<Team, string> = { blue: "Barça", red: "Madrid" };
export const lineupSlots = [
  { team: "blue", position: "defender" },
  { team: "blue", position: "forward" },
  { team: "red", position: "defender" },
  { team: "red", position: "forward" },
] as const;

export function latestValidMatch(
  matches: Match[],
  seasonId: string,
): Match | undefined {
  return matches
    .filter((m) => m.status === "valid" && m.season_id === seasonId)
    .sort(
      (a, b) =>
        b.played_at.localeCompare(a.played_at) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id),
    )[0];
}

export function matchLineup(
  match: Match | undefined,
  season: Season,
  players: Player[],
  winnersOnly = false,
): string[] {
  const eligible =
    match &&
    match.status === "valid" &&
    match.season_id === season.id &&
    match.league_id === season.league_id;
  return lineupSlots.map((slot) => {
    if (!eligible || (winnersOnly && slot.team !== match.winner)) return "";
    const id = match.participants.find(
      (p) => p.team === slot.team && p.position === slot.position,
    )?.player_id;
    return players.some(
      (p) => p.id === id && p.active && p.league_id === season.league_id,
    )
      ? id!
      : "";
  });
}
