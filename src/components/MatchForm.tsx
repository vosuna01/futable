import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Repeat2,
  Search,
  Shield,
  Swords,
  Trophy,
} from "lucide-react";
import type {
  Match,
  MatchInput,
  Participant,
  Player,
  Season,
} from "../domain/types";
import { validateMatch } from "../domain/validation";
import { lineupSlots as slots, matchLineup, teamNames } from "../domain/teams";
import { Avatar, Modal } from "./ui";
import { matchesSearch } from "../domain/presentation";
export function MatchForm({
  players,
  season,
  last,
  edit,
  onClose,
  onSave,
}: {
  players: Player[];
  season: Season;
  last?: Match;
  edit?: Match;
  onClose: () => void;
  onSave: (m: MatchInput, edit?: Match, reason?: string) => Promise<void>;
}) {
  const previous = useRef(last).current;
  const errorArea = useRef<HTMLParagraphElement>(null);
  const [selected, setSelected] = useState<string[]>(() =>
    matchLineup(edit || previous, season, players, !edit),
  );
  const [carried, setCarried] = useState(!edit && selected.some(Boolean));
  const [withoutScore, setWithoutScore] = useState(
    Boolean(edit && edit.blue_score === null),
  );
  const [winner, setWinner] = useState(edit?.winner || "blue");
  const [active, setActive] = useState(() =>
      Math.max(
        0,
        selected.findIndex((id) => !id),
      ),
    ),
    [query, setQuery] = useState(""),
    [scores, setScores] = useState([
      edit?.blue_score ?? season.target,
      edit?.red_score ?? 0,
    ]),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  useEffect(() => {
    if (error)
      errorArea.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [error]);
  const operation = useRef(crypto.randomUUID()),
    locked = useRef(false),
    attempt = useRef("");
  const participants: Participant[] = slots.map((s, i) => ({
    ...s,
    player_id: selected[i],
  }));
  const input: MatchInput = {
    operation_id: operation.current,
    season_id: season.id,
    blue_score: withoutScore ? null : scores[0],
    red_score: withoutScore ? null : scores[1],
    ...(withoutScore ? { winner } : {}),
    participants,
  };
  const mutate = () => {
    setConfirm(false);
    setError("");
  };
  const available = players
    .filter((p) => p.active && matchesSearch(p.name, query))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  async function submit() {
    if (locked.current) return;
    const validation = validateMatch(input, season, players);
    if (validation) {
      setError(validation);
      return;
    }
    if (edit && reason.trim().length < 3) {
      setError("Indica el motivo de la corrección.");
      return;
    }
    if (!confirm) {
      setConfirm(true);
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = JSON.stringify({ ...input, operation_id: "", reason });
      if (attempt.current && attempt.current !== payload)
        operation.current = crypto.randomUUID();
      attempt.current = payload;
      await onSave({ ...input, operation_id: operation.current }, edit, reason);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={edit ? "Corregir partida" : "Nueva partida"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted">
        Cuatro jugadores. Dos equipos. Una nueva historia.
      </p>
      {carried && previous && (
        <div className="king-banner">
          <Trophy size={20} />
          <div>
            <strong>
              Rey de la pista · {teamNames[previous.winner]} continúa
            </strong>
            <p>
              Ganadores precargados en sus puestos. Elige a los rivales o cambia
              cualquier jugador.
            </p>
          </div>
        </div>
      )}
      {!edit && (
        <div className="lineup-actions">
          {previous && (
            <button
              className="text-button"
              onClick={() => {
                const next = matchLineup(previous, season, players);
                setSelected(next);
                setActive(
                  Math.max(
                    0,
                    next.findIndex((id) => !id),
                  ),
                );
                setCarried(false);
                setQuery("");
                mutate();
              }}
            >
              <Repeat2 size={16} /> Repetir últimos equipos
            </button>
          )}
          <button
            className="text-button"
            onClick={() => {
              setSelected(slots.map(() => ""));
              setActive(0);
              setCarried(false);
              setQuery("");
              mutate();
            }}
          >
            Empezar de cero
          </button>
        </div>
      )}
      <div className="team-pickers">
        {(["blue", "red"] as const).map((team) => (
          <div key={team} className={`team-picker ${team}`}>
            <h3>
              <i />
              {teamNames[team]}
            </h3>
            {slots.map(
              (s, i) =>
                s.team === team && (
                  <button
                    key={i}
                    className={`player-slot ${active === i ? "selected" : ""}`}
                    onClick={() => setActive(i)}
                    aria-label={`${teamNames[team]} ${s.position === "defender" ? "defensa" : "delantero"}`}
                  >
                    {selected[i] ? (
                      <Avatar
                        player={players.find((p) => p.id === selected[i])!}
                        size="small"
                      />
                    ) : s.position === "defender" ? (
                      <Shield size={20} />
                    ) : (
                      <Swords size={20} />
                    )}
                    <span>
                      <small>
                        {s.position === "defender" ? "DEFENSA" : "DELANTERO"}
                      </small>
                      {players.find((p) => p.id === selected[i])?.name ||
                        "Elegir jugador"}
                    </span>
                  </button>
                ),
            )}
          </div>
        ))}
      </div>
      <label className="search">
        <Search size={18} />
        <input
          placeholder="Buscar jugador…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar jugador"
        />
      </label>
      <div className="selection-progress">
        <strong>{selected.filter(Boolean).length}/4 jugadores</strong>
        <span>
          {selected.every(Boolean)
            ? "Toca un puesto para cambiarlo"
            : `Elige ${slots[active].position === "defender" ? "defensa" : "delantero"} de ${teamNames[slots[active].team]}`}
        </span>
      </div>
      <div className="player-options">
        {available.map((p) => (
          <button
            key={p.id}
            disabled={selected.includes(p.id) && selected[active] !== p.id}
            onClick={() => {
              const next = selected.map((v, i) => (i === active ? p.id : v));
              setSelected(next);
              const after = next.findIndex((id, i) => i > active && !id);
              const first = next.findIndex((id) => !id);
              setActive(after >= 0 ? after : first >= 0 ? first : active);
              setQuery("");
              mutate();
            }}
          >
            <Avatar player={p} size="small" />
            <span>{p.name}</span>
            {selected.includes(p.id) && <Check size={16} />}
          </button>
        ))}
      </div>
      {!available.length && (
        <div className="search-empty">
          <p>No hay jugadores con ese nombre.</p>
          <button className="text-button" onClick={() => setQuery("")}>
            Borrar búsqueda
          </button>
        </div>
      )}
      <label className="king-check">
        <input
          type="checkbox"
          checked={withoutScore}
          onChange={(e) => {
            setWithoutScore(e.target.checked);
            mutate();
          }}
        />{" "}
        Guardar solo el ganador
      </label>
      {withoutScore ? (
        <label className="field">
          Ganador
          <select
            aria-label="Ganador"
            value={winner}
            onChange={(e) => {
              setWinner(e.target.value as "blue" | "red");
              mutate();
            }}
          >
            <option value="blue">Barça</option>
            <option value="red">Madrid</option>
          </select>
        </label>
      ) : (
        <>
          <fieldset className="goal-presets">
            <legend>Marcador final</legend>
            <div className="button-row">
              {[2, 3, 4, 5, 6].map((goals) => (
                <button
                  type="button"
                  className="secondary"
                  key={goals}
                  aria-pressed={Math.max(...scores) === goals}
                  onClick={() => {
                    const blueWins = scores[0] >= scores[1];
                    setScores(
                      blueWins
                        ? [goals, Math.min(scores[1], goals - 1)]
                        : [Math.min(scores[0], goals - 1), goals],
                    );
                    mutate();
                  }}
                >
                  A {goals} goles
                </button>
              ))}
            </div>
            <p className="rule-note">
              Elige los goles acordados o escribe otro marcador abajo.
            </p>
          </fieldset>
          <div className="score-entry">
            <label className="score-red">
              Madrid
              <input
                type="number"
                aria-label="Goles Madrid"
                min="0"
                max={99}
                value={scores[1]}
                onChange={(e) => {
                  setScores([scores[0], Number(e.target.value)]);
                  mutate();
                }}
              />
            </label>
            <span>:</span>
            <label className="score-blue">
              Barça
              <input
                type="number"
                aria-label="Goles Barça"
                min="0"
                max={99}
                value={scores[0]}
                onChange={(e) => {
                  setScores([Number(e.target.value), scores[1]]);
                  mutate();
                }}
              />
            </label>
          </div>
          <p className="rule-note">
            Goles variables · Sin empate · Cada victoria cuenta igual
          </p>
        </>
      )}
      {edit && (
        <label className="field">
          Motivo de la corrección
          <input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              mutate();
            }}
            required
          />
        </label>
      )}
      {confirm && (
        <div className="confirmation">
          <Check size={20} />
          <span>
            Gana{" "}
            <strong>
              {
                teamNames[
                  withoutScore ? winner : scores[0] > scores[1] ? "blue" : "red"
                ]
              }
            </strong>{" "}
            {withoutScore
              ? "sin marcador"
              : `por ${Math.max(...scores)}–${Math.min(...scores)}`}
            . ¿Todo correcto?
          </span>
        </div>
      )}
      {error && (
        <p className="error" role="alert" ref={errorArea}>
          {error}
        </p>
      )}
      <div className="match-submit">
        {confirm && (
          <div className="confirmation-lineups">
            {(["red", "blue"] as const).map((team) => (
              <div key={team}>
                <strong>{teamNames[team]}</strong>
                <span>
                  {participants
                    .filter((p) => p.team === team)
                    .map(
                      (p) =>
                        players.find((x) => x.id === p.player_id)?.name ??
                        "Jugador",
                    )
                    .join(" y ")}
                </span>
              </div>
            ))}
          </div>
        )}
        <button
          className="primary full"
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy
            ? "Guardando en el servidor…"
            : confirm
              ? "Confirmar y guardar"
              : "Revisar resultado"}
          <ArrowRight size={18} />
        </button>
        <p className="rule-note">
          El resultado solo se confirma tras guardarlo correctamente.
        </p>
      </div>
    </Modal>
  );
}
