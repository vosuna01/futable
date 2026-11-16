import type { Match, Season, Snapshot, Team } from "./types";
import type { LiveSession } from "./live";
import { pairRanking, ranking } from "./rankings";
export interface CoinSettings {
  enabled: boolean;
  initial: number;
  win_bonus: number;
  max_stake: number;
}
export interface Wallet {
  id: string;
  player_id: string;
  balance: number;
  name?: string;
  avatar_url?: string | null;
}
export interface CoinBet {
  id: string;
  market_id: string;
  team: Team;
  stake: number;
  odds?: number | null;
  returned: number;
  status?: string;
  created_at: string;
  round?: number;
}
export interface CoinMarket {
  id: string;
  session_id: string;
  round: number;
  status: "open" | "locked";
  revision: number;
  signature: Record<Team, string[]> & { target: number };
  goals: Record<Team, number>;
  red_pool: number;
  blue_pool: number;
  odds?: Record<Team, number> | null;
  own_bet: CoinBet | null;
}
export interface Award {
  title: string;
  players: string[];
  detail?: string;
}
export interface Honours {
  season_id: string;
  published_at: string;
  awards: { title: string; players: { id: string; name: string }[] }[];
}
export interface CoinsSnapshot {
  settings: CoinSettings | null;
  player_id: string | null;
  wallet: Wallet | null;
  standings: Wallet[];
  ledger: { id: string; amount: number; reason: string; created_at: string }[];
  bets: CoinBet[];
  market: CoinMarket | null;
  honours: Honours[];
}
export const coinDefaults: CoinSettings = {
  enabled: true,
  initial: 100,
  win_bonus: 5,
  max_stake: 25,
};
export const pooledReturn = (stake: number, pool: number, backed: number) =>
  backed > 0 ? Math.floor((stake * pool) / backed) : 0;
// Use integer hundredths to avoid 100 * 1.13 losing a coin to float rounding.
export const fixedReturn = (stake: number, odds: number) =>
  Math.floor((stake * Math.round(odds * 100)) / 100);
export function awardSuggestions(
  data: Snapshot,
  season: Season,
  standings: Wallet[],
): Award[] {
  const frozen = season.final_results as {
    matches?: Match[];
    rules?: Season;
  } | null;
  const seasonMatches = data.matches.filter((m) => m.season_id === season.id);
  const current = new Map(seasonMatches.map((m) => [m.id, m]));
  const matches =
    frozen?.matches?.map((match) => {
      const source = current.get(match.id);
      // Older season snapshots omitted scorers. Reuse credits only from the same revision.
      return match.scorers || source?.revision !== match.revision
        ? match
        : { ...match, scorers: source?.scorers };
    }) ?? seasonMatches;
  const rules = frozen?.rules ?? season;
  const overall = ranking(data.players, matches, rules);
  const general = overall.filter((r) => r.qualified);
  const result: Award[] = general.slice(0, 3).map((r, i) => ({
    title: ["Campeón de liga", "Subcampeón de liga", "Tercer puesto"][i],
    players: [r.player.id],
  }));
  for (const post of ["defender", "forward"] as const) {
    const top = ranking(data.players, matches, rules, post).find(
      (r) => r.qualified,
    );
    if (top)
      result.push({
        title: post === "defender" ? "Mejor defensa" : "Mejor delantero",
        players: [top.player.id],
      });
  }
  const pair = pairRanking(data.players, matches, rules).find(
    (r) => r.qualified,
  );
  if (pair) result.push({ title: "Mejor pareja", players: pair.ids });
  const topGoals = overall.reduce((top, row) => Math.max(top, row.goals), 0);
  if (topGoals > 0)
    result.push({
      title: "Bota de Oro",
      players: overall
        .filter((row) => row.goals === topGoals)
        .map((row) => row.player.id),
      detail: `${topGoals} goles con autor registrado`,
    });
  const defensiveStats = new Map<string, { games: number; conceded: number }>();
  for (const match of matches) {
    if (
      match.status !== "valid" ||
      match.red_score == null ||
      match.blue_score == null
    )
      continue;
    for (const player of match.participants) {
      if (player.position !== "defender") continue;
      const stat = defensiveStats.get(player.player_id) ?? {
        games: 0,
        conceded: 0,
      };
      stat.games++;
      stat.conceded +=
        player.team === "red" ? match.blue_score : match.red_score;
      defensiveStats.set(player.player_id, stat);
    }
  }
  const defenders = [...defensiveStats].filter(
    ([, stat]) => stat.games >= rules.minimum,
  );
  // Compare ratios before rounding, including exact ties with different game counts.
  const byConceded = (
    a: (typeof defenders)[number],
    b: (typeof defenders)[number],
  ) => a[1].conceded * b[1].games - b[1].conceded * a[1].games;
  defenders.sort(byConceded);
  const best = defenders[0];
  if (best)
    result.push({
      title: "Guante de Oro",
      players: defenders
        .filter((row) => byConceded(row, best) === 0)
        .map(([id]) => id),
      detail: `${(best[1].conceded / best[1].games).toLocaleString("es-ES", { maximumFractionDigits: 2 })} goles encajados por partido`,
    });
  if (standings.length)
    result.push({
      title:
        standings.filter((w) => w.balance === standings[0].balance).length > 1
          ? "Campeones de coins"
          : "Campeón de coins",
      players: standings
        .filter((w) => w.balance === standings[0].balance)
        .map((w) => w.player_id),
    });
  return result;
}
export function marketSignature(session: LiveSession, target: number) {
  const c = session.state.court;
  return c
    ? {
        red: [c.red.defender.id, c.red.forward.id],
        blue: [c.blue.defender.id, c.blue.forward.id],
        target: session.state.target ?? target,
      }
    : null;
}
