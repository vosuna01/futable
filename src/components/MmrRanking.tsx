import { FlaskConical, Info, Trophy } from "lucide-react";
import { formatMmr, type MmrState } from "../domain/mmr";
import { PENALTY_CONFIG, type Penalty } from "../domain/mmr-penalty";
import { mmrStandings } from "../domain/mmr-standings";
import { ranking } from "../domain/rankings";
import type { Match, Player, Stats } from "../domain/types";
import { Avatar, Empty, pct } from "./ui";
import "../mmr.css";

/**
 * Pestaña «MMR», la clasificación principal: el MMR mostrado es la cifra
 * protagonista y ordena la tabla. Al lado, el porcentaje real de la temporada
 * con su puesto en la clasificación General y cuántos puestos cambia respecto
 * al MMR; victorias, partidos y goles quedan como datos secundarios.
 */
export function MmrRanking({
  mmr,
  players,
  onPlayer,
  matches,
  penalties = null,
  general = [],
}: {
  mmr: MmrState;
  players: Player[];
  onPlayer: (id: string) => void;
  /** Todas las partidas de la liga, no solo las de la temporada elegida. */
  matches: Match[];
  penalties?: Map<string, Penalty> | null;
  /** Clasificación General (% real) de la temporada elegida, ya ordenada. */
  general?: Stats[];
}) {
  // V/PJ, % real y goles con las mismas partidas que el MMR (todas las temporadas).
  const stats = new Map(ranking(players, matches).map((s) => [s.player.id, s]));
  const rows = mmrStandings(mmr, players, penalties);
  // Puesto en el % real: solo cuentan los clasificados, como en «General».
  const generalStats = new Map(general.map((s) => [s.player.id, s]));
  const generalPos = new Map(
    general.filter((s) => s.qualified).map((s, i) => [s.player.id, i + 1]),
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
                    className={`rank-number ${i >= 0 && i < 3 ? `medal-${i}` : ""}`}
                    aria-label={
                      position ? `Posición ${position}` : "Provisional"
                    }
                  >
                    {i === 0 ? (
                      <Trophy size={16} />
                    ) : position ? (
                      String(position).padStart(2, "0")
                    ) : (
                      "—"
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
                          {mmr.eligibility?.[player.id] === false
                            ? "Provisional · "
                            : ""}
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
                  <PercentPlace
                    stats={generalStats.get(player.id)}
                    place={generalPos.get(player.id)}
                    mmrPlace={position}
                  />
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
          MMR (Elo por equipos), la clasificación principal: todos empiezan en
          1000 y cada partida suma o resta según lo esperado frente al rival (K
          = 40 las 10 primeras partidas, 24 después).{" "}
          {mmr.includeUnplayed
            ? "En esta etapa parte de 1000; la Liga solo cuenta resultados de Liga. Necesitas 3 días distintos para clasificarte, sin descuento por volumen."
            : "Se calcula con todas las temporadas anteriores y no cambia el porcentaje."}{" "}
          La columna «%» es el porcentaje real de la temporada, con su puesto en
          la pestaña General y la diferencia con el puesto por MMR (▲ sube en %,
          ▼ baja; «—» si aún no llega al mínimo de partidas). Debajo de cada
          nombre: victorias / partidos, % real, goles y, si la hay, la
          penalización por regularidad.
          {penalties &&
            ` Regularidad: se piden ${PENALTY_CONFIG.minGamesPerWeek} partidas por semana en los últimos ${PENALTY_CONFIG.windowWeeks * 7} días; cada una que falta resta ${PENALTY_CONFIG.pointsPerMissingGame} puntos al MMR mostrado y desaparece al volver a jugar.`}
        </p>
      </div>
    </>
  );
}

/** % real de la temporada, su puesto en «General» y la diferencia con el MMR. */
function PercentPlace({
  stats,
  place,
  mmrPlace,
}: {
  stats?: Stats;
  place?: number;
  mmrPlace: number;
}) {
  if (!stats || !stats.games)
    return (
      <div className="mmr-pct muted" aria-label="Sin partidas esta temporada">
        —
      </div>
    );
  const diff = place ? mmrPlace - place : 0;
  return (
    <div
      className="mmr-pct"
      aria-label={
        place
          ? `${pct(stats.raw)}, puesto ${place} en porcentaje${
              diff
                ? `, ${Math.abs(diff)} ${diff > 0 ? "más arriba" : "más abajo"} que en MMR`
                : ", igual que en MMR"
            }`
          : `${pct(stats.raw)}, todavía sin puesto en porcentaje`
      }
    >
      <strong>{pct(stats.raw)}</strong>
      <small>
        {place ? `${place}º` : "—"}
        {place ? (
          diff > 0 ? (
            <span className="mmr-up"> ▲{diff}</span>
          ) : diff < 0 ? (
            <span className="mmr-down"> ▼{-diff}</span>
          ) : (
            <span className="mmr-same"> =</span>
          )
        ) : null}
      </small>
    </div>
  );
}
