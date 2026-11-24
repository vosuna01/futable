/**
 * Penalización por regularidad del MMR (beta). Solo afecta al MMR MOSTRADO:
 * se calcula al vuelo a partir de las partidas y nunca recibe ni modifica el
 * estado Elo (`player_mmr`), así que no puede alterar E, Δ ni el MMR interno.
 */
import type { Match, Player } from "./types";

/**
 * Activada por defecto en desarrollo y desactivada en la web publicada.
 * `VITE_MMR_PENALTY_ENABLED=true|false` lo fuerza en cualquier entorno.
 */
const flag = import.meta.env.VITE_MMR_PENALTY_ENABLED as string | undefined;
export const PENALTY_ENABLED = flag
  ? flag === "true"
  : Boolean(import.meta.env.DEV);

export interface PenaltyConfig {
  /** MIN_PARTIDOS_SEMANA */
  minGamesPerWeek: number;
  /** VENTANA_SEMANAS */
  windowWeeks: number;
  /** PUNTOS_POR_PARTIDO_QUE_FALTA */
  pointsPerMissingGame: number;
  /** Día de activación (fecha de Madrid, AAAA-MM-DD): antes no cuenta nada. */
  startDate: string;
  timeZone: string;
}
export const PENALTY_CONFIG: PenaltyConfig = {
  minGamesPerWeek: 10,
  windowWeeks: 4,
  pointsPerMissingGame: 2,
  // 28 días antes del 24/11/2026: la ventana ya está completa desde el principio.
  startDate: "2026-10-27",
  timeZone: "Europe/Madrid",
};

export interface Penalty {
  /** Partidas válidas dentro de la ventana. */
  games: number;
  /** Partidas exigidas (proporcional si la activación es reciente). */
  required: number;
  /** Partidas que faltan para quitar la penalización. */
  missing: number;
  /** Puntos a restar del MMR interno (≥ 0). */
  penalty: number;
}

/** Fecha de calendario AAAA-MM-DD de un instante en la zona dada. */
export const localDate = (at: Date | string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));

const dayNumber = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

/**
 * Ventana móvil: el día de hoy y los anteriores hasta completar
 * `windowWeeks` semanas, sin empezar antes de la activación.
 */
export function penaltyWindow(
  now: Date,
  config: PenaltyConfig = PENALTY_CONFIG,
) {
  const today = dayNumber(localDate(now, config.timeZone)),
    start = dayNumber(config.startDate),
    fullDays = config.windowWeeks * 7;
  const days = Math.max(0, Math.min(fullDays, today - start + 1));
  const required = Math.ceil((config.minGamesPerWeek * days) / 7);
  return { from: today - days + 1, to: today, days, required };
}

/** Penalización de cada jugador según sus partidas válidas en la ventana. */
export function regularityPenalties(
  players: Player[],
  matches: Match[],
  now: Date,
  config: PenaltyConfig = PENALTY_CONFIG,
): Map<string, Penalty> {
  const w = penaltyWindow(now, config);
  const games = new Map<string, number>();
  for (const m of matches) {
    if (m.status !== "valid") continue;
    const day = dayNumber(localDate(m.played_at, config.timeZone));
    if (day < w.from || day > w.to) continue;
    for (const p of m.participants)
      games.set(p.player_id, (games.get(p.player_id) ?? 0) + 1);
  }
  return new Map(
    players.map((p) => {
      const played = games.get(p.id) ?? 0,
        missing = Math.max(0, w.required - played);
      return [
        p.id,
        {
          games: played,
          required: w.required,
          missing,
          penalty: config.pointsPerMissingGame * missing,
        },
      ];
    }),
  );
}

/** MMR mostrado = MMR interno − penalización. Solo para pantalla y orden. */
export const displayedMmr = (internal: number, penalty?: Penalty | null) =>
  internal - (penalty?.penalty ?? 0);
