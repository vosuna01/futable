/**
 * Clasificación por MMR mostrado: la comparten la pestaña «MMR (beta)» y la
 * ficha de cada jugador, para que la posición sea siempre la misma.
 */
import type { MmrState } from "./mmr";
import { displayedMmr, type Penalty } from "./mmr-penalty";
import type { Player } from "./types";

export interface MmrStanding {
  player: Player;
  /** MMR interno (el que usa el cálculo de cada partida). */
  internal: number;
  /** MMR mostrado = interno − penalización; ordena la clasificación. */
  shown: number;
  penalty: Penalty | null;
  /** Partidas procesadas por el MMR. */
  games: number;
  /** Δ de su última partida, si ha jugado. */
  lastDelta: number | null;
  /** Posición en la clasificación MMR, empezando en 1. */
  position: number;
}

export function mmrStandings(
  mmr: MmrState,
  players: Player[],
  penalties: Map<string, Penalty> | null = null,
): MmrStanding[] {
  const last = new Map<string, number>();
  for (const r of mmr.mmr_history) last.set(r.player_id, r.delta);
  return players
    .flatMap((player) => {
      const data = mmr.player_mmr[player.id];
      if (
        !data ||
        (data.partidos_contados === 0 && data.mmr_source !== "winrate")
      )
        return [];
      const penalty = penalties?.get(player.id) ?? null;
      return [
        {
          player,
          internal: data.mmr,
          shown: displayedMmr(data.mmr, penalty),
          penalty,
          games: data.partidos_contados,
          lastDelta: last.get(player.id) ?? null,
          position: 0,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.shown - a.shown || a.player.name.localeCompare(b.player.name, "es"),
    )
    .map((row, i) => ({ ...row, position: i + 1 }));
}
