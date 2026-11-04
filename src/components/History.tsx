import { useState } from "react";
import { Pencil, Search, XCircle } from "lucide-react";
import type { Match, Player, Season } from "../domain/types";
import { date, Empty } from "./ui";
import { teamNames } from "../domain/teams";
export function Result({
  match,
  players,
  compact = false,
}: {
  match: Match;
  players: Player[];
  compact?: boolean;
}) {
  return (
    <div
      className={`match-result ${compact ? "compact" : ""} ${match.status === "void" ? "void" : ""}`}
    >
      <div className="match-meta">
        <span>{date(match.played_at)}</span>
        <span>
          {match.status === "void"
            ? "ANULADA"
            : `FINAL · GANA ${teamNames[match.winner].toUpperCase()}`}
        </span>
      </div>
      <div className="match-teams">
        {(["blue", "red"] as const).map((team, i) => (
          <div className={`result-team ${team}`} key={team}>
            <div>
              <span className="result-club">{teamNames[team]}</span>
              {match.participants
                .filter((p) => p.team === team)
                .sort((a) => (a.position === "defender" ? -1 : 1))
                .map((p) => (
                  <span key={p.player_id}>
                    {players.find((x) => x.id === p.player_id)?.name ||
                      "Jugador"}
                    <small>{p.position === "defender" ? "DEF" : "DEL"}</small>
                  </span>
                ))}
            </div>
            <strong className={match.winner === team ? "winning-score" : ""}>
              {i === 0 ? match.blue_score : match.red_score}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
export function History({
  matches,
  players,
  seasons,
  admin,
  onEdit,
  onVoid,
}: {
  matches: Match[];
  players: Player[];
  seasons: Season[];
  admin: boolean;
  onEdit: (m: Match) => void;
  onVoid: (m: Match) => void;
}) {
  const [player, setPlayer] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const filtered = matches.filter(
    (m) =>
      (!player || m.participants.some((p) => p.player_id === player)) &&
      (!from || new Date(m.played_at) >= new Date(`${from}T00:00:00`)) &&
      (!to || new Date(m.played_at) <= new Date(`${to}T23:59:59.999`)),
  );
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">CADA PARTIDA CUENTA</span>
        <h1>
          El historial<span>.</span>
        </h1>
        <p>Resultados, equipos y todas las historias de la liga.</p>
      </div>
      <div className="history-filters">
        <label className="search">
          <Search size={17} />
          <select
            aria-label="Filtrar por jugador"
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
          >
            <option value="">Todos los jugadores</option>
            {players.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="date-filter">
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="date-filter">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <p className="muted small">
        {filtered.length} partidas encontradas · Las anuladas no computan en la
        clasificación
      </p>
      <div className="history-grid">
        {filtered.map((m) => (
          <article className="panel" key={m.id}>
            <Result match={m} players={players} />
            <div className="match-footer">
              <small>
                {seasons.find((s) => s.id === m.season_id)?.name} · v
                {m.revision}
              </small>
              {admin &&
                m.status === "valid" &&
                seasons.find((s) => s.id === m.season_id)?.status ===
                  "active" && (
                  <span>
                    <button
                      className="icon-button"
                      onClick={() => onEdit(m)}
                      aria-label="Corregir partida"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onVoid(m)}
                      aria-label="Anular partida"
                    >
                      <XCircle size={16} />
                    </button>
                  </span>
                )}
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && <Empty title="No hay partidas con estos filtros" />}
    </>
  );
}
