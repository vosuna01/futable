import {
  defaultRules,
  type Match,
  type Player,
  type Position,
  type Rules,
  type Stats,
} from "./types";
export const rawWR = (wins: number, games: number) =>
  games ? (100 * wins) / games : 0;
export const adjustedWR = (
  wins: number,
  games: number,
  r: Rules = defaultRules,
) => (100 * (wins + r.prior_wins)) / (games + r.prior_games);
/**
 * Matches needed to enter the main standings: more than 20, so 21. Below it a
 * player is still listed, in a separate block. The real win rate decides the order.
 */
export const RANK_GAMES = 21;
/** Matches needed in each half of a player's record to compare their improvement. */
export const IMPROVE_HALF = 10;
export function compareStats(a: Stats, b: Stats): number {
  return (
    Number(b.qualified) - Number(a.qualified) ||
    b.raw - a.raw ||
    b.games - a.games ||
    b.wins - a.wins ||
    a.player.name.localeCompare(b.player.name, "es") ||
    a.player.id.localeCompare(b.player.id)
  );
}
export function ranking(
  players: Player[],
  matches: Match[],
  rules: Rules = defaultRules,
  position?: Position,
): Stats[] {
  const valid = matches
    .filter((m) => m.status === "valid")
    .sort(
      (a, b) =>
        a.played_at.localeCompare(b.played_at) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  return players
    .map((player) => {
      let games = 0,
        wins = 0,
        streak = 0,
        bestStreak = 0,
        goals = 0;
      for (const m of valid) {
        const p = m.participants.find(
          (p) =>
            p.player_id === player.id && (!position || p.position === position),
        );
        if (!p) continue;
        games++;
        goals += m.scorers?.find((s) => s.player_id === player.id)?.goals ?? 0;
        if (p.team === m.winner) {
          wins++;
          streak++;
          bestStreak = Math.max(streak, bestStreak);
        } else streak = 0;
      }
      return {
        player,
        games,
        wins,
        losses: games - wins,
        raw: rawWR(wins, games),
        adjusted: adjustedWR(wins, games, rules),
        goals,
        streak,
        bestStreak,
        qualified: games >= RANK_GAMES,
      };
    })
    .sort(compareStats);
}
export function completeRanking(
  players: Player[],
  matches: Match[],
  rules: Rules = defaultRules,
) {
  const defense = ranking(players, matches, rules, "defender"),
    forward = ranking(players, matches, rules, "forward");
  return defense
    .map((d) => {
      const f = forward.find((s) => s.player.id === d.player.id)!;
      return {
        ...d,
        games: d.games + f.games,
        wins: d.wins + f.wins,
        losses: d.losses + f.losses,
        raw: rawWR(d.wins + f.wins, d.games + f.games),
        adjusted: (d.adjusted + f.adjusted) / 2,
        goals: d.goals + f.goals,
        qualified: d.qualified && f.qualified,
        defense: d,
        forward: f,
      };
    })
    .sort(compareStats);
}
export function pairRanking(
  players: Player[],
  matches: Match[],
  rules: Rules = defaultRules,
) {
  const pairs = new Map<
    string,
    { ids: string[]; games: number; wins: number }
  >();
  for (const m of matches.filter((m) => m.status === "valid"))
    for (const team of ["blue", "red"] as const) {
      const ids = m.participants
        .filter((p) => p.team === team)
        .map((p) => p.player_id)
        .sort();
      if (ids.length !== 2) continue;
      const key = ids.join(":");
      const s = pairs.get(key) || { ids, games: 0, wins: 0 };
      s.games++;
      if (team === m.winner) s.wins++;
      pairs.set(key, s);
    }
  return [...pairs.entries()]
    .map(([id, p]) => ({
      ...p,
      id,
      names: p.ids.map(
        (id) => players.find((p) => p.id === id)?.name || "Jugador",
      ),
      raw: rawWR(p.wins, p.games),
      adjusted: adjustedWR(p.wins, p.games, rules),
      qualified: p.games >= rules.pair_minimum,
    }))
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        b.raw - a.raw ||
        b.games - a.games ||
        b.wins - a.wins ||
        a.names.join().localeCompare(b.names.join(), "es"),
    );
}
// Change between first and second halves of a player's chronological appearances.
export function improvement(
  players: Player[],
  matches: Match[],
  rules: Rules = defaultRules,
) {
  return players
    .map((player) => {
      const games = matches
        .filter(
          (m) =>
            m.status === "valid" &&
            m.participants.some((p) => p.player_id === player.id),
        )
        .sort(
          (a, b) =>
            a.played_at.localeCompare(b.played_at) || a.id.localeCompare(b.id),
        );
      const half = Math.floor(games.length / 2);
      const a = games.slice(0, half),
        b = games.slice(half);
      const wins = (ms: Match[]) =>
        ms.filter((m) =>
          m.participants.some(
            (p) => p.player_id === player.id && p.team === m.winner,
          ),
        ).length;
      return {
        player,
        games: games.length,
        first: rawWR(wins(a), a.length),
        second: rawWR(wins(b), b.length),
        delta: rawWR(wins(b), b.length) - rawWR(wins(a), a.length),
        qualified: a.length >= IMPROVE_HALF && b.length >= IMPROVE_HALF,
      };
    })
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        b.delta - a.delta ||
        b.games - a.games,
    );
}
