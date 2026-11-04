import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Repeat2,
  Search,
  Shield,
  Swords,
} from "lucide-react";
import type {
  Match,
  MatchInput,
  Participant,
  Player,
  Season,
} from "../domain/types";
import { validateMatch } from "../domain/validation";
import { Avatar, Modal } from "./ui";
const slots = [
  { team: "blue", position: "defender" },
  { team: "blue", position: "forward" },
  { team: "red", position: "defender" },
  { team: "red", position: "forward" },
] as const;
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
  const initial = edit?.participants;
  const [selected, setSelected] = useState<string[]>(
    slots.map(
      (s) =>
        initial?.find((p) => p.team === s.team && p.position === s.position)
          ?.player_id || "",
    ),
  );
  const [active, setActive] = useState(0),
    [query, setQuery] = useState(""),
    [scores, setScores] = useState([
      edit?.blue_score ?? season.target,
      edit?.red_score ?? 0,
    ]),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
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
    blue_score: scores[0],
    red_score: scores[1],
    participants,
  };
  const mutate = () => {
    setConfirm(false);
    setError("");
  };
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
      {last && !edit && (
        <button
          className="text-button"
          onClick={() => {
            setSelected(
              slots.map(
                (s) =>
                  last.participants.find(
                    (p) => p.team === s.team && p.position === s.position,
                  )?.player_id || "",
              ),
            );
            mutate();
          }}
        >
          <Repeat2 size={16} /> Repetir últimos equipos
        </button>
      )}
      <div className="team-pickers">
        {["blue", "red"].map((team, t) => (
          <div key={team} className={`team-picker ${team}`}>
            <h3>
              <i />
              Equipo {t === 0 ? "azul" : "rojo"}
            </h3>
            {slots.map(
              (s, i) =>
                s.team === team && (
                  <button
                    key={i}
                    className={`player-slot ${active === i ? "selected" : ""}`}
                    onClick={() => setActive(i)}
                    aria-label={`${team === "blue" ? "Azul" : "Rojo"} ${s.position === "defender" ? "defensa" : "delantero"}`}
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
      <div className="player-options">
        {players
          .filter(
            (p) =>
              p.active && p.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((p) => (
            <button
              key={p.id}
              disabled={selected.includes(p.id) && selected[active] !== p.id}
              onClick={() => {
                setSelected((s) => s.map((v, i) => (i === active ? p.id : v)));
                setActive((a) => Math.min(a + 1, 3));
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
        <label>
          Equipo azul
          <input
            type="number"
            aria-label="Goles equipo azul"
            min="0"
            max={99}
            value={scores[0]}
            onChange={(e) => {
              setScores([Number(e.target.value), scores[1]]);
              mutate();
            }}
          />
        </label>
        <span>:</span>
        <label>
          Equipo rojo
          <input
            type="number"
            aria-label="Goles equipo rojo"
            min="0"
            max={99}
            value={scores[1]}
            onChange={(e) => {
              setScores([scores[0], Number(e.target.value)]);
              mutate();
            }}
          />
        </label>
      </div>
      <p className="rule-note">
        Goles variables · Sin empate · Cada victoria cuenta igual
      </p>
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
            Gana el equipo{" "}
            <strong>{scores[0] > scores[1] ? "azul" : "rojo"}</strong> por{" "}
            {Math.max(...scores)}–{Math.min(...scores)}. ¿Todo correcto?
          </span>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
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
    </Modal>
  );
}
