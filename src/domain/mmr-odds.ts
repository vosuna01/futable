/**
 * Pronóstico y cuotas según el MMR. Mismo cálculo que la migración
 * 016_mmr_odds.sql, para que el porcentaje y la cuota que ve el jugador
 * coincidan con los que guarda el servidor.
 */
import type { LiveState } from "./live";
import { expected, MMR_ENABLED, MMR_START, recalculateMMR } from "./mmr";
import { forecast, type Forecast } from "./odds";
import {
  defaultRules,
  type Match,
  type Player,
  type Rules,
  type Team,
} from "./types";

/**
 * Usar el MMR en el pronóstico. Por defecto sigue a MMR_ENABLED; en la web
 * publicada debe activarse (`VITE_MMR_ODDS_ENABLED=true`) al aplicar la 016.
 */
const flag = import.meta.env.VITE_MMR_ODDS_ENABLED as string | undefined;
export const MMR_ODDS_ENABLED = flag ? flag === "true" : MMR_ENABLED;

/** Mismos límites y margen que odds.ts y las migraciones 013/016. */
const MARGIN = 0.08;
const FLOOR = 0.05;
export const mmrDecimal = (probability: number) =>
  Math.max(1.01, Math.round(100 / (probability * (1 + MARGIN))) / 100);

export function mmrForecast(
  state: LiveState,
  players: Player[],
  /** Todas las partidas de la liga, de todas las temporadas. */
  matches: Match[],
): Forecast | null {
  const court = state.court;
  if (!court) return null;
  const mmr = recalculateMMR(players, matches);
  const level = (team: Team) =>
    [court[team].defender.id, court[team].forward.id].reduce(
      (sum, id) => sum + (mmr.player_mmr[id]?.mmr ?? MMR_START),
      0,
    ) / 2;
  const blueLevel = level("blue"),
    redLevel = level("red");
  const share = Math.min(
    1 - FLOOR,
    Math.max(FLOOR, expected(blueLevel, redLevel)),
  );
  const valid = matches.filter((m) => m.status === "valid");
  const onCourt = (["blue", "red"] as const).flatMap((t) => [
    court[t].defender.id,
    court[t].forward.id,
  ]);
  /** Partidas que esta pareja ha jugado en el mismo equipo. */
  const together = (team: Team) =>
    valid.filter((m) => {
      const a = m.participants.find(
          (p) => p.player_id === court[team].defender.id,
        ),
        b = m.participants.find((p) => p.player_id === court[team].forward.id);
      return !!a && !!b && a.team === b.team;
    }).length;
  return {
    blue: {
      probability: share,
      decimal: mmrDecimal(share),
      strength: blueLevel,
      together: together("blue"),
    },
    red: {
      probability: 1 - share,
      decimal: mmrDecimal(1 - share),
      strength: redLevel,
      together: together("red"),
    },
    favourite:
      Math.abs(share - 0.5) < 0.01 ? null : share > 0.5 ? "blue" : "red",
    sample: valid.filter((m) =>
      m.participants.some((p) => onCourt.includes(p.player_id)),
    ).length,
  };
}

/**
 * Pronóstico de la pista: según el MMR con el flag activado y, si no, el
 * modelo de siempre por temporada.
 */
export function liveForecast(
  state: LiveState,
  players: Player[],
  allMatches: Match[],
  season: (Rules & { id: string }) | undefined,
): Forecast | null {
  if (!state.court) return null;
  if (MMR_ODDS_ENABLED)
    try {
      return mmrForecast(state, players, allMatches);
    } catch {
      // Si el MMR no se puede calcular, se mantiene el pronóstico clásico.
    }
  if (!season) return null;
  return forecast(
    state,
    players,
    allMatches.filter((m) => m.season_id === season.id),
    season ?? defaultRules,
  );
}
