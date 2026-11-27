import { rankablePlayers } from "./standings-players";
import type { Snapshot, Season, Match } from "./types";
import type { Award, Wallet } from "./coins";
import { competitionMmr, goalRate, participationDays } from "./competitions";
import { mmrStandings } from "./mmr-standings";
import { pairRanking, ranking } from "./rankings";
export function competitionAwards(
  data: Snapshot,
  season: Season,
  matches: Match[],
  wallets: Wallet[],
): Award[] {
  if (season.competition_kind === "cup")
    return season.cup_result
      ? [{ title: "Campeones de Copa", players: season.cup_result.players }]
      : [];
  const model = {
      ...data,
      matches: [
        ...data.matches.filter((m) => m.season_id !== season.id),
        ...matches,
      ],
    },
    mmr = competitionMmr(model, season);
  const top = mmrStandings(mmr, rankablePlayers(data.players)).filter(
    (r) => r.position > 0,
  );
  const awards: Award[] = top.slice(0, 3).map((r, i) => ({
    title: ["Campeón de liga", "Subcampeón de liga", "Tercer puesto"][i],
    players: [r.player.id],
  }));
  const eligible = (id: string) =>
    participationDays(matches, id) >= (season.minimum_days ?? 3);
  for (const defensive of [false, true]) {
    const rates = goalRate(data.players, matches, defensive).filter(
      (r) =>
        r.rate !== null &&
        r.games >= 10 &&
        eligible(r.player.id) &&
        (!defensive ? r.goals > 0 : true),
    );
    rates.sort(
      (a, b) => (defensive ? 1 : -1) * (a.goals * b.total - b.goals * a.total),
    );
    const best = rates[0];
    if (best)
      awards.push({
        title: defensive ? "Guante de Oro" : "Bota de Oro",
        players: rates
          .filter((r) => r.goals * best.total === best.goals * r.total)
          .map((r) => r.player.id),
        detail: `${best.rate!.toLocaleString("es-ES", { maximumFractionDigits: 2 })} goles equivalentes a 3`,
      });
  }
  for (const post of ["defender", "forward"] as const) {
    const row = ranking(data.players, matches, season, post).find(
      (r) => r.qualified,
    );
    if (row)
      awards.push({
        title: post === "defender" ? "Mejor defensa" : "Mejor delantero",
        players: [row.player.id],
      });
  }
  const pair = pairRanking(data.players, matches, season).find(
    (p) => p.qualified && p.ids.every(eligible),
  );
  if (pair) awards.push({ title: "Mejor pareja", players: pair.ids });
  if (wallets.length) {
    const best = Math.max(...wallets.map((w) => w.score ?? w.balance));
    awards.push({
      title: "Ludópata",
      players: wallets
        .filter((w) => (w.score ?? w.balance) === best)
        .map((w) => w.player_id),
    });
  }
  return awards;
}
