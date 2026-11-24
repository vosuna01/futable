import { FlaskConical, Info, Trophy } from "lucide-react";
import { formatMmr, type MmrState } from "../domain/mmr";
import { PENALTY_CONFIG, type Penalty } from "../domain/mmr-penalty";
import { mmrStandings } from "../domain/mmr-standings";
import { ranking } from "../domain/rankings";
import type { Match, Player } from "../domain/types";
import { Avatar, Empty, pct } from "./ui";
import "../mmr.css";

/**
 * Pestaña «MMR (beta)»: el MMR mostrado es la cifra protagonista y ordena la
 * tabla; victorias, porcentaje y goles quedan como datos secundarios.
 */
export function MmrRanking({
  mmr,
  players,
  onPlayer,
  matches,
  penalties = null,
}: {
  mmr: MmrState;
  players: Player[];
  onPlayer: (id: string) => void;
  /** Todas las partidas de la liga, no solo las de la temporada elegida. */
  matches: Match[];
  penalties?: Map<string, Penalty> | null;
}) {
  // V/PJ, % real y goles con las mismas partidas que el MMR (todas las temporadas).
  const stats = new Map(ranking(players, matches).map((s) => [s.player.id, s]));
  const rows = mmrStandings(mmr, players, penalties);
  return (
    <>
      <p className="ranking-summary mmr-mode">
        <FlaskConical size={15} />
        Modo {mmr.mode} · {mmr.reason}
      </p>
      <div className="panel">
        {!rows.length ? (
          <Empty title="Todavía no hay MMR">
            Aparecerá en cuanto haya partidas válidas.
          </Empty>
        ) : (
          <ol className="mmr-board">
            {rows.map(({ player, shown, penalty, position }) => {
              const s = stats.get(player.id);
              const i = position - 1;
              return (
                <li
                  key={player.id}
                  className={`mmr-row ${i === 0 ? "leader-row" : ""}`}
                >
                  <span
                    className={`rank-number ${i < 3 ? `medal-${i}` : ""}`}
                    aria-label={`Posición ${position}`}
                  >
                    {i === 0 ? (
                      <Trophy size={16} />
                    ) : (
                      String(position).padStart(2, "0")
                    )}
                  </span>
                  <button
                    className="player-name mmr-player"
                    onClick={() => onPlayer(player.id)}
                  >
                    <Avatar player={player} size="small" />
                    <span>
                      <strong>{player.name}</strong>
                      {s && (
                        <small className="mmr-sub">
                          {s.wins} V / {s.games} PJ · {pct(s.raw)} · ⚽{" "}
                          {s.goals}
                          {penalty && penalty.penalty > 0 && (
                            <span className="mmr-penalty">
                              {" "}
                              · −{penalty.penalty} por regularidad
                            </span>
                          )}
                        </small>
                      )}
                    </span>
                  </button>
                  <div className="mmr-score">
                    <strong className="mmr-value">{formatMmr(shown)}</strong>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="info-note">
        <Info size={17} />
        <p>
          Prueba de MMR (Elo por equipos): todos empiezan en 1000 y cada partida
          suma o resta según lo esperado frente al rival (K = 40 las 10 primeras
          partidas, 24 después). Se calcula con todas las temporadas y no cambia
          el ranking oficial. Debajo de cada nombre: victorias / partidos, %
          real, goles y, si la hay, la penalización por regularidad.
          {penalties &&
            ` Regularidad: se piden ${PENALTY_CONFIG.minGamesPerWeek} partidas por semana en los últimos ${PENALTY_CONFIG.windowWeeks * 7} días; cada una que falta resta ${PENALTY_CONFIG.pointsPerMissingGame} puntos al MMR mostrado y desaparece al volver a jugar.`}
        </p>
      </div>
    </>
  );
}
