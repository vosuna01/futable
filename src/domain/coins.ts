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
  own_bet: CoinBet | null;
}
export interface Award {
  title: string;
  players: string[];
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
export function awardSuggestions(
  data: Snapshot,
  season: Season,
  standings: Wallet[],
): Award[] {
  const frozen = season.final_results as {
    matches?: Match[];
    rules?: Season;
  } | null;
  const matches =
    frozen?.matches ?? data.matches.filter((m) => m.season_id === season.id);
  const rules = frozen?.rules ?? season;
  const general = ranking(data.players, matches, rules).filter(
    (r) => r.qualified,
  );
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
