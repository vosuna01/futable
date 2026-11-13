import { useState } from "react";
import { ArrowDownWideNarrow, Flame, Info, Search, Trophy } from "lucide-react";
import {
  completeRanking,
  improvement,
  IMPROVE_HALF,
  pairRanking,
  RANK_GAMES,
  ranking,
} from "../domain/rankings";
import type { Match, Player, Rules, Stats } from "../domain/types";
import { Avatar, Empty, pct } from "./ui";
import { matchesSearch } from "../domain/presentation";
export function RankTable({
  rows,
  onPlayer,
  compact = false,
  positions,
}: {
  rows: Stats[];
  onPlayer: (id: string) => void;
  compact?: boolean;
  positions?: Map<string, number>;
}) {
  if (!rows.length) return <Empty />;
  const qualified = rows.filter((r) => r.qualified),
    provisional = rows.filter((r) => !r.qualified);
  const render = (items: Stats[], provisional = false) => (
    <div className="table-scroll">
      <table className="ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>JUGADOR</th>
            <th>V / PJ</th>
            <th className="goals-column">GOLES</th>
            <th>% REAL</th>
            {!compact && <th>RACHA</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((s, index) => {
            const i = (positions?.get(s.player.id) ?? index + 1) - 1;
            return (
              <tr
                key={s.player.id}
                className={!provisional && i === 0 ? "leader-row" : ""}
              >
                <td>
                  <span
                    className={`rank-number ${!provisional && i < 3 ? `medal-${i}` : ""}`}
                  >
                    {!provisional && i === 0 ? (
                      <Trophy size={16} />
                    ) : provisional ? (
                      "—"
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                </td>
                <td>
                  <button
                    className="player-name"
                    onClick={() => onPlayer(s.player.id)}
                  >
                    <Avatar player={s.player} size="small" />
                    <span>
                      {s.player.name}
                      {!provisional && i === 0 && (
                        <small>PRIMER CLASIFICADO</small>
                      )}
                    </span>
                  </button>
                </td>
                <td>
                  <strong>{s.wins}</strong>
                  <span className="muted"> / {s.games}</span>
                </td>
                <td className="goals-column">
                  <strong>{s.goals}</strong>
                </td>
                <td>
                  <strong className="adjusted">{pct(s.raw)}</strong>
                  <small className="inline-raw">⚽ {s.goals}</small>
                  <div className="mini-bar">
                    <i style={{ width: `${s.raw}%` }} />
                  </div>
                </td>
                {!compact && (
                  <td>
                    <span className={s.streak >= 3 ? "streak hot" : "streak"}>
                      <Flame size={14} />
                      {s.streak}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      {qualified.length > 0 && render(qualified)}
      {provisional.length > 0 && (
        <>
          <div className="provisional-label">
            <span>EN CLASIFICACIÓN</span>
            <small>Menos de {RANK_GAMES} partidas jugadas</small>
          </div>
          {render(provisional, true)}
        </>
      )}
    </>
  );
}
export function Rankings({
  players,
  matches,
  rules,
  onPlayer,
}: {
  players: Player[];
  matches: Match[];
  rules: Rules;
  onPlayer: (id: string) => void;
}) {
  const [tab, setTab] = useState("General"),
    [sort, setSort] = useState("raw"),
    [query, setQuery] = useState("");
  const position =
    tab === "Defensas"
      ? "defender"
      : tab === "Delanteros"
        ? "forward"
        : undefined;
  const rows =
    tab === "Completos"
      ? completeRanking(players, matches, rules)
      : ranking(players, matches, rules, position);
  const sortedAll = [...rows].sort(
    (a, b) =>
      Number(b.qualified) - Number(a.qualified) ||
      (sort === "wins"
        ? b.wins - a.wins
        : sort === "games"
          ? b.games - a.games
          : sort === "goals"
            ? b.goals - a.goals
            : 0) ||
      rows.indexOf(a) - rows.indexOf(b),
  );
  const positions = new Map(
    sortedAll.filter((s) => s.qualified).map((s, i) => [s.player.id, i + 1]),
  );
  const sorted = sortedAll.filter((s) => matchesSearch(s.player.name, query));
  const pairs = pairRanking(players, matches, rules),
    improved = improvement(players, matches, rules);
  const all = ranking(players, matches, rules);
  const awards = [
    ["Más victorias", [...all].sort((a, b) => b.wins - a.wins)[0], "wins"],
    ["Más activo", [...all].sort((a, b) => b.games - a.games)[0], "games"],
    ["Máximo goleador", [...all].sort((a, b) => b.goals - a.goals)[0], "goals"],
    [
      "Mayor porcentaje real",
      [...all].filter((x) => x.qualified).sort((a, b) => b.raw - a.raw)[0],
      "raw",
    ],
    [
      "Mejor racha histórica",
      [...all].sort((a, b) => b.bestStreak - a.bestStreak)[0],
      "bestStreak",
    ],
    [
      "Mejor defensa",
      ranking(players, matches, rules, "defender").find((x) => x.qualified),
      "raw",
    ],
    [
      "Mejor delantero",
      ranking(players, matches, rules, "forward").find((x) => x.qualified),
      "raw",
    ],
    [
      "Jugador completo",
      completeRanking(players, matches, rules).find((x) => x.qualified),
      "raw",
    ],
  ] as const;
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">EL RENDIMIENTO MARCA LA DIFERENCIA</span>
        <h1>
          Clasificaciones<span>.</span>
        </h1>
        <p>Las victorias importan. El contexto, también.</p>
      </div>
      <div
        className="tabs"
        role="tablist"
        aria-label="Clasificaciones"
        onKeyDown={(e) => {
          const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
          if (!keys.includes(e.key)) return;
          const buttons = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]"),
          );
          const at = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                  buttons.length;
          e.preventDefault();
          setTab(buttons[next].textContent ?? "General");
          buttons[next].focus();
        }}
      >
        {[
          "General",
          "Defensas",
          "Delanteros",
          "Completos",
          "Parejas",
          "Estadísticas",
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Estadísticas" ? (
        <>
          <div className="awards-grid">
            {awards.map(([label, s, key]) => (
              <article className="panel award" key={label}>
                <Trophy size={20} />
                <span className="eyebrow">{label}</span>
                {s && s.games > 0 ? (
                  <>
                    <button
                      className="player-name"
                      onClick={() => onPlayer(s.player.id)}
                    >
                      <Avatar player={s.player} />
                      <strong>{s.player.name}</strong>
                    </button>
                    <p>
                      {key === "raw" ? pct(s[key]) : s[key]}
                      {key === "goals" ? " goles" : ""}{" "}
                      <span className="muted">· {s.games} partidos</span>
                    </p>
                  </>
                ) : (
                  <p className="muted">Sin muestra suficiente</p>
                )}
              </article>
            ))}
          </div>
          <div className="panel improvement">
            <h2>Mayor mejora</h2>
            <p className="muted">
              Diferencia en puntos porcentuales entre la primera y segunda mitad
              de las partidas de cada jugador. Mínimo {IMPROVE_HALF} en cada
              mitad.
            </p>
            {improved.filter((x) => x.qualified).length ? (
              improved
                .filter((x) => x.qualified)
                .map((p) => (
                  <div className="metric-row" key={p.player.id}>
                    <button
                      onClick={() => onPlayer(p.player.id)}
                      className="player-name"
                    >
                      <Avatar player={p.player} size="small" />
                      {p.player.name}
                    </button>
                    <span>
                      {pct(p.first)} → {pct(p.second)}
                    </span>
                    <strong>
                      {p.delta > 0 ? "+" : ""}
                      {p.delta.toFixed(1)} pp
                    </strong>
                    <small>{p.games} PJ</small>
                  </div>
                ))
            ) : (
              <Empty title="Todavía no hay muestra suficiente" />
            )}
          </div>
        </>
      ) : tab === "Parejas" ? (
        <div className="panel">
          <div className="panel-heading">
            <h2>Juntos, mejores</h2>
            <span className="chip">Mínimo {rules.pair_minimum} PJ</span>
          </div>
          {pairs.length ? (
            pairs.map((p, i) => (
              <div className="pair-row" key={p.id}>
                <span className="rank-number">{p.qualified ? i + 1 : "—"}</span>
                <div>
                  <strong className="pair-members">
                    {p.names.map((name, j) => (
                      <span key={p.ids[j]}>
                        {j > 0 && <span aria-hidden="true"> + </span>}
                        <button onClick={() => onPlayer(p.ids[j])}>
                          {name}
                        </button>
                      </span>
                    ))}
                  </strong>
                  <small>
                    {p.qualified ? "Pareja clasificada" : "Provisional"} ·{" "}
                    {p.games} PJ · {p.wins} victorias
                  </small>
                </div>
                <strong className="gold">{pct(p.raw)}</strong>
              </div>
            ))
          ) : (
            <Empty />
          )}
        </div>
      ) : (
        <>
          <div className="ranking-toolbar">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Buscar en ranking"
                placeholder="Buscar jugador…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="sort">
              <ArrowDownWideNarrow size={16} />
              <select
                aria-label="Orden de clasificación"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="raw">% real</option>
                <option value="goals">Goles</option>
                <option value="wins">Victorias</option>
                <option value="games">Partidos</option>
              </select>
            </label>
          </div>
          <p className="ranking-summary">
            {sortedAll.filter((s) => s.qualified).length} clasificados ·{" "}
            {sortedAll.filter((s) => !s.qualified).length} en clasificación ·
            Mínimo {RANK_GAMES} partidas
            {position
              ? " en esta posición"
              : tab === "Completos"
                ? " en cada posición"
                : ""}
          </p>
          <div className="panel">
            {!sorted.length && query.trim() ? (
              <Empty title="No encontramos a ese jugador">
                Revisa el nombre o prueba sin filtros.
                <button className="secondary" onClick={() => setQuery("")}>
                  Borrar búsqueda
                </button>
              </Empty>
            ) : (
              <RankTable
                rows={sorted}
                onPlayer={onPlayer}
                positions={positions}
              />
            )}
          </div>
          {tab === "Completos" && (
            <div className="panel improvement">
              <h3>Rendimiento por posición</h3>
              {completeRanking(players, matches, rules)
                .filter((x) => x.games > 0)
                .map((s) => (
                  <div className="metric-row" key={s.player.id}>
                    <span>{s.player.name}</span>
                    <small>
                      DEF {pct(s.defense.raw)} · {s.defense.games} PJ
                    </small>
                    <small>
                      DEL {pct(s.forward.raw)} · {s.forward.games} PJ
                    </small>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
      <div className="info-note">
        <Info size={17} />
        <p>
          Porcentaje real = victorias / partidos. Arriba, quien lleva{" "}
          {RANK_GAMES} partidas o más
          {tab === "Completos"
            ? " en cada posición"
            : position
              ? " en esta posición"
              : ""}
          ; debajo, el resto. Los goles son los marcados en partidas en directo
          con goleador. Se ordena sin redondear.
        </p>
      </div>
    </>
  );
}
