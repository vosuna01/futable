import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Flame,
  Search,
  Shield,
  Swords,
} from "lucide-react";
import { pairRanking, RANK_GAMES, ranking } from "../domain/rankings";
import type { Match, Player, Rules } from "../domain/types";
import { Avatar, Empty, pct } from "./ui";
import { Result } from "./History";
import { matchesSearch, newestFirst } from "../domain/presentation";
export function Players({
  players,
  matches,
  rules,
  selected,
  onSelect,
}: {
  players: Player[];
  matches: Match[];
  rules: Rules;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const player = players.find((p) => p.id === selected);
  if (player) {
    const s = ranking([player], matches, rules)[0],
      d = ranking([player], matches, rules, "defender")[0],
      f = ranking([player], matches, rules, "forward")[0],
      games = matches
        .filter(
          (m) =>
            m.status === "valid" &&
            m.participants.some((p) => p.player_id === player.id),
        )
        .sort(newestFirst),
      pair = pairRanking(players, matches, rules).find(
        (p) => p.ids.includes(player.id) && p.qualified,
      );
    const evolution = [...games]
      .reverse()
      .map((_, i, ms) => ranking([player], ms.slice(0, i + 1), rules)[0].raw);
    const path = evolution
      .map(
        (v, i) =>
          `${i ? "L" : "M"} ${evolution.length > 1 ? (i / (evolution.length - 1)) * 600 : 300} ${160 - v * 1.4}`,
      )
      .join(" ");
    return (
      <>
        <button className="text-button" onClick={() => onSelect(null)}>
          <ArrowLeft size={16} /> Todos los jugadores
        </button>
        <div className="profile-heading">
          <Avatar player={player} size="large" />
          <div>
            <span className="eyebrow">
              {s.qualified ? "JUGADOR CLASIFICADO" : "EN CLASIFICACIÓN"}
            </span>
            <h1>{player.name}</h1>
            <p>
              {player.active ? "En activo" : "Inactivo"} · {s.games} partidos
              disputados
            </p>
          </div>
        </div>
        <div className="stats-strip">
          <div>
            <span>% REAL</span>
            <strong className="gold">{pct(s.raw)}</strong>
          </div>
          <div>
            <span>GOLES</span>
            <strong>{s.goals}</strong>
          </div>
          <div>
            <span>VICTORIAS</span>
            <strong>
              {s.wins}
              <small> / {s.games}</small>
            </strong>
          </div>
          <div>
            <span>DERROTAS</span>
            <strong>{s.losses}</strong>
          </div>
        </div>
        <div className="two-col">
          {[
            [d, "Defensa", Shield],
            [f, "Delantero", Swords],
          ].map(([stat, label, Icon]) => {
            const x = stat as typeof s;
            const I = Icon as typeof Shield;
            return (
              <article className="panel position-card" key={String(label)}>
                <I size={22} />
                <h2>{String(label)}</h2>
                <strong>{pct(x.raw)}</strong>
                <p>
                  {x.wins} V · {x.losses} D · {x.games} PJ · ⚽ {x.goals}
                </p>
                <small>
                  {x.qualified
                    ? "Clasificado"
                    : `Necesita ${Math.max(0, RANK_GAMES - x.games)} partidos más`}{" "}
                  · Racha {x.streak}
                </small>
              </article>
            );
          })}
        </div>
        <article className="panel evolution">
          <div className="panel-heading">
            <h2>Tu evolución</h2>
            <span className="chip">% real · tras cada partida</span>
          </div>
          {evolution.length ? (
            <>
              <svg
                viewBox="0 0 620 180"
                role="img"
                aria-label="Evolución del porcentaje real"
              >
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop stopColor="#1da099" stopOpacity=".2" />
                    <stop offset="1" stopColor="#1da099" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[25, 50, 75].map((v) => (
                  <g key={v}>
                    <line
                      x1="0"
                      x2="600"
                      y1={160 - v * 1.4}
                      y2={160 - v * 1.4}
                      stroke="#e2e8f0"
                    />
                    <text
                      x="602"
                      y={164 - v * 1.4}
                      fill="#6b7280"
                      fontSize="11"
                    >
                      {v}
                    </text>
                  </g>
                ))}
                <path
                  d={`${path} L ${evolution.length > 1 ? 600 : 300} 170 L 0 170 Z`}
                  fill="url(#area)"
                />
                <path d={path} stroke="#1da099" strokeWidth="3" fill="none" />
              </svg>
              <p className="muted small">
                Primera partida → última partida · Sin redondear para calcular
              </p>
            </>
          ) : (
            <Empty />
          )}
        </article>
        <div className="two-col">
          <article className="panel award">
            <Flame />
            <h3>Las rachas</h3>
            <p>
              <strong>{s.streak}</strong> actual ·{" "}
              <strong>{s.bestStreak}</strong> mejor de la temporada
            </p>
          </article>
          <article className="panel award">
            <h3>Mejor pareja</h3>
            {pair ? (
              <>
                <strong>{pair.names.join(" + ")}</strong>
                <p>
                  {pct(pair.raw)} real · {pair.games} partidos
                </p>
              </>
            ) : (
              <p className="muted">
                Sin parejas con {rules.pair_minimum} partidas conjuntas.
              </p>
            )}
          </article>
        </div>
        <h2 className="mt">Últimas partidas</h2>
        <div className="history-grid">
          {games.slice(0, 10).map((m) => (
            <article key={m.id} className="panel">
              <Result match={m} players={players} />
            </article>
          ))}
        </div>
      </>
    );
  }
  const rows = ranking(players, matches, rules).filter((s) =>
    matchesSearch(s.player.name, query),
  );
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">LOS PROTAGONISTAS</span>
        <h1>
          La plantilla<span>.</span>
        </h1>
        <p>Parejas que cambian. Una liga que nos une.</p>
      </div>
      <label className="search player-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jugador…"
          aria-label="Buscar en plantilla"
        />
      </label>
      <div className="players-grid">
        {rows.map((s) => (
          <button
            key={s.player.id}
            className="panel player-card"
            onClick={() => onSelect(s.player.id)}
          >
            <ArrowUpRight className="card-arrow" size={18} />
            <Avatar player={s.player} size="large" />
            <h3>{s.player.name}</h3>
            <span className="muted small">
              {s.player.active ? "En activo" : "Inactivo"} ·{" "}
              {s.games === 0
                ? "Aún sin partidas"
                : s.qualified
                  ? "Clasificado"
                  : "Provisional"}
            </span>
            <div>
              <strong>
                {pct(s.raw)}
                <small>REAL</small>
              </strong>
              <strong>
                {s.wins}
                <small>VICTORIAS</small>
              </strong>
              <strong>
                {s.games}
                <small>PARTIDOS</small>
              </strong>
            </div>
          </button>
        ))}
      </div>
      {!rows.length && (
        <Empty title="No encontramos jugadores">
          Prueba otro nombre o apodo.
          <button className="secondary" onClick={() => setQuery("")}>
            Borrar búsqueda
          </button>
        </Empty>
      )}
    </>
  );
}
