import { useState } from "react";
import { Pencil, Search, XCircle, RotateCcw, ChevronDown } from "lucide-react";
import { calendarDate, newestFirst } from "../domain/presentation";
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
              {(i === 0 ? match.blue_score : match.red_score) ?? "—"}
            </strong>
          </div>
        ))}
      </div>
      {match.blue_score === null && (
        <p className="rule-note">Victoria registrada sin marcador</p>
      )}
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
    [to, setTo] = useState(""),
    [status, setStatus] = useState("all"),
    [limit, setLimit] = useState(12);
  const invalidDates = !!from && !!to && from > to;
  const filtered = matches
    .filter(
      (m) =>
        (!player || m.participants.some((p) => p.player_id === player)) &&
        (status === "all" || m.status === status) &&
        (!from || new Date(m.played_at) >= new Date(`${from}T00:00:00`)) &&
        (!to || new Date(m.played_at) <= new Date(`${to}T23:59:59.999`)),
    )
    .sort(newestFirst);
  const dirty = !!player || !!from || !!to || status !== "all";
  const clear = () => {
    setPlayer("");
    setFrom("");
    setTo("");
    setStatus("all");
    setLimit(12);
  };
  const range = (days: number) => {
    const now = new Date(),
      start = new Date(now);
    start.setDate(start.getDate() - days + 1);
    setFrom(calendarDate(start));
    setTo(calendarDate(now));
    setLimit(12);
  };
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
            onChange={(e) => {
              setPlayer(e.target.value);
              setLimit(12);
            }}
          >
            <option value="">Todos los jugadores</option>
            {[...players]
              .sort((a, b) => a.name.localeCompare(b.name, "es"))
              .map((p) => (
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
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setLimit(12);
            }}
          />
        </label>
        <label className="date-filter">
          Hasta
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setLimit(12);
            }}
          />
        </label>
      </div>
      <div className="history-quick-filters">
        <div className="filter-pills" aria-label="Estado de las partidas">
          {(
            [
              ["all", "Todas"],
              ["valid", "Válidas"],
              ["void", "Anuladas"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setLimit(12);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="button-row">
          <button className="text-button" onClick={() => range(1)}>
            Hoy
          </button>
          <button className="text-button" onClick={() => range(7)}>
            Últimos 7 días
          </button>
          {dirty && (
            <button className="text-button" onClick={clear}>
              <RotateCcw size={14} />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>
      {invalidDates && (
        <p className="error" role="alert">
          La fecha «Desde» debe ser anterior o igual a «Hasta».
        </p>
      )}
      <p className="muted small">
        {filtered.length} partidas encontradas · Las anuladas no computan en la
        clasificación
      </p>
      <div className="history-grid">
        {filtered.slice(0, limit).map((m) => (
          <article className="panel" key={m.id}>
            <Result match={m} players={players} />
            <div className="match-footer">
              <small>
                {seasons.find((s) => s.id === m.season_id)?.name}
                {m.status === "valid" && m.revision > 1 ? " · Corregida" : ""}
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
      {filtered.length > limit && (
        <div className="load-more">
          <p className="muted small">
            Mostrando {Math.min(limit, filtered.length)} de {filtered.length}
          </p>
          <button className="secondary" onClick={() => setLimit((n) => n + 12)}>
            <ChevronDown size={17} />
            Ver {Math.min(12, filtered.length - limit)} partidas más
          </button>
        </div>
      )}
      {!filtered.length && (
        <Empty
          title={
            dirty
              ? "No hay partidas con estos filtros"
              : "Todavía no hay partidas"
          }
        >
          {dirty ? (
            <>
              <span>Prueba otro jugador o amplía las fechas.</span>
              <button className="secondary" onClick={clear}>
                Quitar filtros
              </button>
            </>
          ) : (
            "Las partidas guardadas aparecerán aquí con sus parejas y resultados."
          )}
        </Empty>
      )}
    </>
  );
}
