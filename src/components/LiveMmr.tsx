import { useMemo } from "react";
import {
  formatTeamDelta,
  MMR_ENABLED,
  previewMatch,
  recalculateMMR,
  type TeamPreview,
} from "../domain/mmr";
import type { LiveState } from "../domain/live";
import type { Snapshot, Team, Season } from "../domain/types";
import { competitionMmr } from "../domain/competitions";
import "../mmr.css";

/**
 * MMR en juego en la partida en directo (beta). Devuelve null con el flag
 * apagado, sin pista o si el cálculo falla: la partida nunca depende de esto.
 */
export function useLiveMmr(
  data: Snapshot,
  court: LiveState["court"] | undefined,
  season?: Season,
): Record<Team, TeamPreview> | null {
  const mmr = useMemo(() => {
    if (!MMR_ENABLED) return null;
    try {
      return season?.rating_epoch
        ? competitionMmr(data, season)
        : recalculateMMR(data.players, data.matches);
    } catch {
      return null;
    }
  }, [data.players, data.matches, season?.id]);
  const ids = court
    ? [
        court.blue.defender.id,
        court.blue.forward.id,
        court.red.defender.id,
        court.red.forward.id,
      ]
    : null;
  const key = ids?.join(":");
  return useMemo(() => {
    if (!mmr || !ids) return null;
    try {
      return previewMatch(mmr, {
        blue: [ids[0], ids[1]],
        red: [ids[2], ids[3]],
      });
    } catch {
      return null;
    }
    // `key` resume los cuatro jugadores en pista.
  }, [mmr, key]);
}

/** «MMR · si gana +12 · si pierde −12» para un equipo. */
export function LiveMmrBadge({
  preview,
  className = "",
}: {
  preview: TeamPreview | undefined;
  className?: string;
}) {
  if (!preview) return null;
  return (
    <p
      className={`live-mmr ${className}`}
      title="Puntos de MMR (beta) que ganaría o perdería cada jugador de este equipo"
    >
      <span>MMR</span>
      <span className="mmr-delta up">Gana {formatTeamDelta(preview.win)}</span>
      <span className="mmr-delta down">
        Pierde {formatTeamDelta(preview.lose)}
      </span>
    </p>
  );
}
