import { pairRanking, ranking } from "./rankings";
import type { LiveState } from "./live";
import {
  defaultRules,
  type Match,
  type Player,
  type Rules,
  type Team,
} from "./types";

export interface TeamOdds {
  /** Share of the forecast, between 0 and 1. */
  probability: number;
  /** Decimal odds, the number a bookmaker prints next to the team. */
  decimal: number;
  /** Adjusted win rate behind the forecast, before the margin. */
  strength: number;
  /** Matches this pair has already played together. */
  together: number;
}
export interface Forecast {
  blue: TeamOdds;
  red: TeamOdds;
  favourite: Team | null;
  /** Valid matches backing the four players, so the UI can hedge the claim. */
  sample: number;
}
/** The cut a book keeps; it is what makes both odds add up to under 100%. */
const MARGIN = 0.08;
const floor = 0.05;

const decimal = (probability: number) =>
  Math.max(1.01, Math.round(100 / (probability * (1 + MARGIN))) / 100);

/**
 * Blends each player's adjusted win rate in the post they are playing with how
 * the pair has actually done together. Synergy only counts once a pair has a
 * history, and never outweighs the players themselves.
 */
export function forecast(
  state: LiveState,
  players: Player[],
  matches: Match[],
  rules: Rules = defaultRules,
): Forecast | null {
  if (!state.court) return null;
  const defenders = ranking(players, matches, rules, "defender");
  const forwards = ranking(players, matches, rules, "forward");
  const pairs = pairRanking(players, matches, rules);
  const valid = matches.filter((m) => m.status === "valid");
  const sideOdds = (team: Team) => {
    const side = state.court![team];
    const defender = defenders.find((s) => s.player.id === side.defender.id);
    const forward = forwards.find((s) => s.player.id === side.forward.id);
    const solo = ((defender?.adjusted ?? 50) + (forward?.adjusted ?? 50)) / 2;
    const pair = pairs.find(
      (p) =>
        p.ids.includes(side.defender.id) && p.ids.includes(side.forward.id),
    );
    const together = pair?.games ?? 0;
    // Weight rises with shared matches and stops at half, so a long-standing
    // partnership colours the forecast without replacing individual form.
    const weight = together
      ? (together / (together + rules.pair_minimum)) * 0.5
      : 0;
    return {
      strength: solo * (1 - weight) + (pair?.adjusted ?? solo) * weight,
      together,
    };
  };
  const blue = sideOdds("blue"),
    red = sideOdds("red");
  const total = blue.strength + red.strength;
  const raw = total ? blue.strength / total : 0.5;
  const share = Math.min(1 - floor, Math.max(floor, raw));
  const sample = valid.filter((m) =>
    m.participants.some((p) =>
      [
        state.court!.blue.defender.id,
        state.court!.blue.forward.id,
        state.court!.red.defender.id,
        state.court!.red.forward.id,
      ].includes(p.player_id),
    ),
  ).length;
  return {
    blue: { ...blue, probability: share, decimal: decimal(share) },
    red: { ...red, probability: 1 - share, decimal: decimal(1 - share) },
    favourite:
      Math.abs(share - 0.5) < 0.01 ? null : share > 0.5 ? "blue" : "red",
    sample,
  };
}
