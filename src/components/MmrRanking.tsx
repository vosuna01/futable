import { FlaskConical, Info } from "lucide-react";
import { formatMmr, type MmrState } from "../domain/mmr";
import {
  displayedMmr,
  PENALTY_CONFIG,
  type Penalty,
} from "../domain/mmr-penalty";
import { ranking } from "../domain/rankings";
import type { Match, Player } from "../domain/types";
import { Avatar, Empty, pct } from "./ui";
import "../mmr.css";

/**
 * Pestaña «MMR (beta)»: no altera ninguna otra clasificación. Con
 * penalización, ordena y muestra el MMR mostrado; el interno solo se informa.
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
  /** Todas las partidas de la liga, no solo las de la temporada elegida. */
  matches: Match[];
  onPlayer: (id: string) => void;
  penalties?: Map<string, Penalty> | null;
}) {
  // V/PJ, % real y goles con las mismas partidas que el MMR (todas las temporadas).
  const stats = new Map(ranking(players, matches).map((s) => [s.player.id, s]));
  const rows = players
    .map((player) => {
      const data = mmr.player_mmr[player.id],
        penalty = penalties?.get(player.id) ?? null;
      return {
        player,
        data,
        penalty,
        stat: stats.get(player.id)!,
        shown: data ? displayedMmr(data.mmr, penalty) : 0,
      };
    })
    .filter(
      (r) =>
        r.data &&
        (r.data.partidos_contados > 0 || r.data.mmr_source === "winrate"),
    )
    .sort(
      (a, b) =>
        b.shown - a.shown || a.player.name.localeCompare(b.player.name, "es"),
    );
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
          <div className="table-scroll">
            <table className="ranking-table mmr-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>JUGADOR</th>
                  <th>MMR</th>
                  <th>V / PJ</th>
                  <th>% REAL</th>
                  {penalties && <th>OBSERVACIONES</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ player, penalty, shown, stat }, i) => {
                  return (
                    <tr key={player.id}>
                      <td>
                        <span className="rank-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <td>
                        <button
                          className="player-name"
                          onClick={() => onPlayer(player.id)}
                        >
                          <Avatar player={player} size="small" />
                          <span>{player.name}</span>
                        </button>
                      </td>
                      <td>
                        <strong className="mmr-value">
                          {formatMmr(shown)}
                        </strong>
                      </td>
                      <td>
                        <strong>{stat.wins}</strong>
                        <span className="muted"> / {stat.games}</span>
                      </td>
                      <td>
                        <strong className="adjusted">{pct(stat.raw)}</strong>
                        <small className="inline-raw">⚽ {stat.goals}</small>
                        <div className="mini-bar">
                          <i style={{ width: `${stat.raw}%` }} />
                        </div>
                      </td>
                      {penalties && (
                        <td>
                          {penalty && penalty.penalty > 0 ? (
                            <span className="mmr-penalty">
                              −{penalty.penalty} por regularidad
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="info-note">
        <Info size={17} />
        <p>
          Prueba de MMR (Elo por equipos): todos empiezan en 1000 y cada partida
          suma o resta según lo esperado frente al rival (K = 40 las 10 primeras
          partidas, 24 después). Se calcula con todas las temporadas y no cambia
          el ranking oficial.
          {penalties &&
            ` Regularidad: se piden ${PENALTY_CONFIG.minGamesPerWeek} partidas por semana en los últimos ${PENALTY_CONFIG.windowWeeks * 7} días (proporcional desde la activación); cada una que falta resta ${PENALTY_CONFIG.pointsPerMissingGame} puntos al MMR mostrado, nunca al interno, y desaparece al volver a jugar.`}
        </p>
      </div>
    </>
  );
}
