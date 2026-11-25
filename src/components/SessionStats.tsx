import { useMemo } from "react";
import type { LiveSession } from "../domain/live";
import { formatDelta, formatMmr, type MmrState } from "../domain/mmr";
import type { Penalty } from "../domain/mmr-penalty";
import { mmrStandings } from "../domain/mmr-standings";
import { ranking } from "../domain/rankings";
import { rankablePlayers } from "../domain/standings-players";
import { sessionMatches, sessionTable } from "../domain/session-stats";
import { defaultRules, type Player, type Snapshot } from "../domain/types";
import { Avatar } from "./ui";
import "../session-stats.css";

/**
 * Resumen de una sesión de directo: tus números arriba y la tabla del día
 * debajo. Lo comparten la sesión en curso y el resumen de Inicio.
 */
export function SessionStats({
  session,
  data,
  me,
  mmr = null,
  mmrPenalties = null,
  live = false,
}: {
  session: LiveSession;
  data: Snapshot;
  me: Player | undefined;
  mmr?: MmrState | null;
  mmrPenalties?: Map<string, Penalty> | null;
  /** La sesión sigue abierta: incluye a los fichados que aún no han jugado. */
  live?: boolean;
}) {
  const season =
    data.seasons.find((s) => s.id === session.season_id) ?? defaultRules;
  const rows = useMemo(() => {
    const played = sessionMatches(session, data.matches);
    return sessionTable({
      matches: played,
      players: data.players,
      state: live ? session.state : null,
      mmr,
      standings: mmr
        ? mmrStandings(mmr, rankablePlayers(data.players), mmrPenalties)
        : [],
      leagueRanking: ranking(
        rankablePlayers(data.players),
        data.matches.filter((m) => m.season_id === session.season_id),
        season,
      ),
    });
  }, [session, data.matches, data.players, mmr, mmrPenalties, live, season]);

  const mine = me ? rows.find((r) => r.player.id === me.id) : undefined;
  const total = rows.reduce((sum, r) => sum + r.games, 0) / 4;

  if (!rows.length)
    return (
      <p className="muted">
        {live
          ? "Todavía no se ha jugado ninguna partida en esta sesión."
          : "La última sesión terminó sin partidas."}
      </p>
    );

  return (
    <div className="session-stats">
      {mine ? (
        <>
          <div className="session-mine">
            <Avatar player={mine.player} />
            <div>
              <strong>{mine.player.name}</strong>
              <small>
                {mine.position}º de {rows.length} en la sesión
              </small>
            </div>
            {mine.leaguePosition && (
              <span className="session-league-pos">
                <b>{mine.leaguePosition}º</b>
                <small>Temporada</small>
              </span>
            )}
          </div>
          <dl className="session-figures">
            <div>
              <dt>PJ</dt>
              <dd>{mine.games}</dd>
            </div>
            <div>
              <dt>PG</dt>
              <dd>{mine.wins}</dd>
            </div>
            <div>
              <dt>PP</dt>
              <dd>{mine.losses}</dd>
            </div>
            <div>
              <dt>Goles</dt>
              <dd>{mine.goals}</dd>
            </div>
          </dl>
          {mine.mmrNow !== null && (
            <dl className="session-figures mmr">
              <div>
                <dt>Puesto MMR</dt>
                <dd>{mine.mmrPosition}º</dd>
              </div>
              <div>
                <dt>MMR</dt>
                <dd>{formatMmr(mine.mmrNow)}</dd>
              </div>
              <div
                className={`session-figure-delta ${(mine.mmrDelta ?? 0) >= 0 ? "up" : "down"}`}
              >
                <dt>MMR ganado</dt>
                <dd>{formatDelta(mine.mmrDelta ?? 0)}</dd>
              </div>
            </dl>
          )}
        </>
      ) : (
        <p className="muted">No has jugado ninguna partida en esta sesión.</p>
      )}

      <div className="session-table-heading">
        <h3>Tabla del día</h3>
        <span>
          {Math.round(total)} {Math.round(total) === 1 ? "partida" : "partidas"}
        </span>
      </div>
      <div className="session-table-scroll">
        <table className="session-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Jugador</th>
              <th scope="col">PJ</th>
              <th scope="col">PG</th>
              <th scope="col">PP</th>
              <th scope="col">GF</th>
              {mmr && <th scope="col">MMR</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.player.id}
                className={row.player.id === me?.id ? "is-me" : ""}
              >
                <td>{row.position}</td>
                <th scope="row">
                  <Avatar player={row.player} size="small" />
                  <span>{row.player.name}</span>
                </th>
                <td>{row.games}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.goals}</td>
                {mmr && (
                  <td>
                    {row.mmrNow !== null ? formatMmr(row.mmrNow) : "—"}
                    {row.mmrDelta !== null && (
                      <small
                        className={`mmr-delta ${row.mmrDelta >= 0 ? "up" : "down"}`}
                      >
                        {formatDelta(row.mmrDelta)}
                      </small>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
