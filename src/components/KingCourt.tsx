import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Crown,
  Plus,
  Settings2,
  Shuffle,
  Undo2,
  X,
} from "lucide-react";
import type { useKingSession } from "../data/useKingSession";
import type { Court, Pair } from "../domain/king";
import { courtError } from "../domain/king";
import type { Player, Snapshot, Team } from "../domain/types";
import { teamNames } from "../domain/teams";
import { Avatar, Modal } from "./ui";

const emptyPair = (): Pair => ({
  id: crypto.randomUUID(),
  defender: "",
  forward: "",
});
export function KingCourt({
  king,
  data,
  user,
  online,
}: {
  king: ReturnType<typeof useKingSession>;
  data: Snapshot;
  user: string;
  online: boolean;
}) {
  const { session } = king;
  const [editing, setEditing] = useState(false),
    [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [exact, setExact] = useState(false),
    [scores, setScores] = useState([3, 0]);
  const lock = useRef(false),
    attempt = useRef<{ key: string; id: string } | null>(null);
  const editable =
    !session || session.owner_id === user || data.role === "admin";
  const activeSeason = data.seasons.find((s) => s.status === "active");
  const sameSeason = !session || session.season_id === activeSeason?.id;
  const run = async (
    action: string,
    fields: Parameters<typeof king.command>[1],
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const key = JSON.stringify({ action, fields });
    if (!attempt.current || attempt.current.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    try {
      await king.command(action, fields, attempt.current.id);
      attempt.current = null;
      if (action === "start" || action === "configure") setEditing(false);
      if (action === "result") {
        setNotice(
          `Victoria de ${teamNames[fields.winner!]} guardada. La cola ya está preparada.`,
        );
        setExact(false);
      }
      if (action === "undo")
        setNotice("Resultado anulado. Parejas y cola restauradas.");
      if (action === "close") {
        setClosing(false);
        setNotice("Sesión terminada. Los resultados se conservan.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const invalid = session ? courtError(session.state, data.players) : null;
  const ready =
    !!session?.state.blue && !!session.state.red && !invalid && sameSeason;
  const owner =
    data.players.find((p) => p.account_id === session?.owner_id)?.name ||
    data.memberships.find((m) => m.user_id === session?.owner_id)
      ?.display_name ||
    "otro compañero";
  return (
    <section className="king-court" aria-label="Rey de la pista">
      <div className="king-heading">
        <div>
          <span className="eyebrow">MENOS APUNTAR. MÁS JUGAR.</span>
          <h1>
            <Crown /> Rey de la pista<span>.</span>
          </h1>
          <p>Gana, sigue. Entra la siguiente pareja.</p>
        </div>
        {session && editable && (
          <button
            className="secondary"
            disabled={busy || !online || !sameSeason}
            onClick={() => setEditing(true)}
          >
            <Settings2 size={17} /> Parejas y cola
          </button>
        )}
      </div>
      {(error || king.error) && (
        <div role="alert" className="error">
          {error || king.error}
          <button className="text-button" onClick={() => void king.refresh()}>
            Actualizar sesión
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="king-notice">
          {notice}
        </p>
      )}
      {king.loading ? (
        <p>Buscando una sesión abierta…</p>
      ) : !session ? (
        <div className="panel king-empty">
          <Crown size={44} />
          <h2>Una sesión, todas las partidas.</h2>
          <p>
            Elige las dos parejas iniciales y añade las que esperan. Después,
            basta con tocar quién gana.
          </p>
          <button
            className="primary"
            disabled={!online || !activeSeason || busy || !!king.error}
            onClick={() => setEditing(true)}
          >
            Preparar sesión <Plus size={18} />
          </button>
          <p className="rule-note">
            Sin marcador obligatorio · Sin pantalla de confirmación · Con
            deshacer
          </p>
        </div>
      ) : (
        <>
          <div className="king-session-meta">
            <span className="live-pill">
              SESIÓN ABIERTA · {session.revision - 1} CAMBIOS
            </span>
            <span>
              {editable
                ? "Puedes llevar esta sesión"
                : `Apunta los resultados ${owner}`}
            </span>
          </div>
          {!sameSeason && (
            <p className="error">
              Esta sesión es de otra temporada. Termínala antes de abrir una
              nueva.
            </p>
          )}
          {invalid && (
            <p className="error">
              {invalid} Revisa las parejas antes de continuar.
            </p>
          )}
          <div className="king-teams">
            {(["blue", "red"] as const).map((team) => (
              <article key={team} className={`king-team ${team}`}>
                <span className="eyebrow">EN LA PISTA</span>
                <h2>{teamNames[team]}</h2>
                <PairView pair={session.state[team]} players={data.players} />
                <button
                  className={`king-win ${team}`}
                  disabled={!online || busy || !editable || !ready}
                  onClick={() => {
                    if (
                      exact &&
                      (!scores.every(
                        (s) => Number.isInteger(s) && s >= 0 && s <= 99,
                      ) ||
                        scores[0] === scores[1] ||
                        (scores[0] > scores[1] ? "blue" : "red") !== team)
                    ) {
                      setError(
                        "El marcador debe coincidir con el ganador, sin empate y entre 0 y 99 goles.",
                      );
                      return;
                    }
                    void run("result", {
                      winner: team,
                      blue_score: exact ? scores[0] : null,
                      red_score: exact ? scores[1] : null,
                    });
                  }}
                >
                  <Crown size={21} />{" "}
                  {busy ? "Guardando…" : `Gana ${teamNames[team]}`}
                </button>
              </article>
            ))}
          </div>
          {editable && (
            <div className="king-controls">
              <label className="king-check">
                <input
                  type="checkbox"
                  checked={exact}
                  disabled={busy || !ready}
                  onChange={(e) => setExact(e.target.checked)}
                />{" "}
                Añadir marcador exacto (opcional)
              </label>
              {exact && (
                <div className="king-scores">
                  {(["blue", "red"] as const).map((t, i) => (
                    <label key={t}>
                      {teamNames[t]}
                      <input
                        aria-label={`Marcador ${teamNames[t]}`}
                        type="number"
                        min="0"
                        max="99"
                        disabled={busy}
                        value={scores[i]}
                        onChange={(e) =>
                          setScores((v) =>
                            v.map((n, j) =>
                              j === i ? Number(e.target.value) : n,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              {session.last_match && (
                <button
                  className="secondary"
                  disabled={busy || !online || !sameSeason}
                  onClick={() => void run("undo", {})}
                >
                  <Undo2 size={17} /> Deshacer último resultado
                </button>
              )}
            </div>
          )}
          {!ready && sameSeason && !invalid && (
            <div className="info-note">
              <strong>Esperando una nueva pareja</strong>
              <p>
                No había nadie esperando al terminar la partida. Añade rivales
                desde «Parejas y cola»; no se repite el cruce automáticamente.
              </p>
            </div>
          )}
          <section className="panel king-queue">
            <div className="king-queue-heading">
              <h2>Siguientes en entrar</h2>
              <span>
                {session.state.queue.length}{" "}
                {session.state.queue.length === 1 ? "pareja" : "parejas"}
              </span>
            </div>
            {session.state.queue.length ? (
              <ol>
                {session.state.queue.map((p) => (
                  <li key={p.id}>
                    <PairView pair={p} players={data.players} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                La cola está vacía. Añade más parejas para encadenar partidas.
              </p>
            )}
            <p className="rule-note">
              La pareja perdedora va al final. La ganadora conserva equipo y
              posiciones.
            </p>
          </section>
          {editable && (
            <button
              className="text-button king-close"
              disabled={busy || !online}
              onClick={() => setClosing(true)}
            >
              Terminar sesión
            </button>
          )}
        </>
      )}
      {editing && (
        <CourtEditor
          initial={session?.state}
          players={data.players}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setEditing(false);
          }}
          onSave={(state) =>
            void run(session ? "configure" : "start", { state })
          }
        />
      )}
      {closing && (
        <Modal
          title="Terminar sesión"
          onClose={() => {
            if (!busy) setClosing(false);
          }}
        >
          <p>
            Se cerrará la pista y la cola. Todas las partidas ya guardadas
            seguirán en el historial y en las clasificaciones.
          </p>
          <button
            className="primary full"
            disabled={busy}
            onClick={() => void run("close", {})}
          >
            Terminar y conservar resultados
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}

function PairView({ pair, players }: { pair: Pair | null; players: Player[] }) {
  if (!pair)
    return <p className="king-vacant">Puesto libre · faltan rivales</p>;
  return (
    <div className="king-pair">
      {(["defender", "forward"] as const).map((role) => {
        const p = players.find((p) => p.id === pair[role]);
        return (
          <div key={role}>
            {p && <Avatar player={p} size="small" />}
            <span>
              <strong>{p?.name || "Jugador no disponible"}</strong>
              <small>{role === "defender" ? "Defensa" : "Delantero"}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CourtEditor({
  initial,
  players,
  busy,
  error,
  onSave,
  onClose,
}: {
  initial?: Court;
  players: Player[];
  busy: boolean;
  error: string;
  onSave: (s: Court) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Court>(() =>
    structuredClone(
      initial || { blue: emptyPair(), red: emptyPair(), queue: [] },
    ),
  );
  const [validation, setValidation] = useState("");
  const updatePair = (id: string, fields: Partial<Pair>) =>
    setDraft((s) => ({
      blue: s.blue?.id === id ? { ...s.blue, ...fields } : s.blue,
      red: s.red?.id === id ? { ...s.red, ...fields } : s.red,
      queue: s.queue.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    }));
  const all = [draft.blue, draft.red, ...draft.queue].filter(
    (p): p is Pair => !!p,
  );
  const pairForm = (p: Pair, title: string) => (
    <div className="king-pair-edit" key={p.id}>
      <div className="king-edit-heading">
        <strong>{title}</strong>
        <button
          className="icon-button"
          aria-label={`Intercambiar posiciones ${title}`}
          disabled={busy}
          onClick={() =>
            updatePair(p.id, { defender: p.forward, forward: p.defender })
          }
        >
          <Shuffle size={17} />
        </button>
      </div>
      {(["defender", "forward"] as const).map((role) => (
        <label className="field" key={role}>
          {role === "defender" ? "Defensa" : "Delantero"}
          <select
            aria-label={`${title} ${role === "defender" ? "defensa" : "delantero"}`}
            disabled={busy}
            value={p[role]}
            onChange={(e) => updatePair(p.id, { [role]: e.target.value })}
          >
            <option value="">Elegir jugador</option>
            {players
              .filter((p) => p.active)
              .map((player) => (
                <option
                  key={player.id}
                  value={player.id}
                  disabled={all.some(
                    (other) =>
                      ((other.id !== p.id || role !== "defender") &&
                        other.defender === player.id) ||
                      ((other.id !== p.id || role !== "forward") &&
                        other.forward === player.id),
                  )}
                >
                  {player.name}
                </option>
              ))}
          </select>
        </label>
      ))}
    </div>
  );
  return (
    <Modal
      title={initial ? "Parejas y cola" : "Preparar rey de la pista"}
      onClose={onClose}
    >
      <p className="muted">
        Configura las posiciones una vez. Puedes cambiarlas entre partidas y
        ordenar la cola.
      </p>
      <div className="king-editor-teams">
        {(["blue", "red"] as const).map((team) => (
          <div key={team}>
            {draft[team] ? (
              pairForm(draft[team]!, teamNames[team])
            ) : (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setDraft((s) => ({ ...s, [team]: emptyPair() }))}
              >
                Añadir pareja a {teamNames[team]}
              </button>
            )}
          </div>
        ))}
      </div>
      <h3>Cola de espera</h3>
      {draft.queue.map((p, i) => (
        <div className="king-queue-edit" key={p.id}>
          {pairForm(p, `Pareja ${i + 1}`)}
          <div className="button-row">
            <button
              className="icon-button"
              aria-label={`Subir pareja ${i + 1}`}
              disabled={busy || i === 0}
              onClick={() =>
                setDraft((s) => {
                  const queue = [...s.queue];
                  [queue[i - 1], queue[i]] = [queue[i], queue[i - 1]];
                  return { ...s, queue };
                })
              }
            >
              <ArrowUp size={17} />
            </button>
            <button
              className="icon-button"
              aria-label={`Bajar pareja ${i + 1}`}
              disabled={busy || i === draft.queue.length - 1}
              onClick={() =>
                setDraft((s) => {
                  const queue = [...s.queue];
                  [queue[i + 1], queue[i]] = [queue[i], queue[i + 1]];
                  return { ...s, queue };
                })
              }
            >
              <ArrowDown size={17} />
            </button>
            {(["blue", "red"] as const)
              .filter((t) => !draft[t])
              .map((t) => (
                <button
                  key={t}
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    setDraft((s) => ({
                      ...s,
                      [t]: p,
                      queue: s.queue.filter((x) => x.id !== p.id),
                    }))
                  }
                >
                  Entrar en {teamNames[t]}
                </button>
              ))}
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                setDraft((s) => ({
                  ...s,
                  queue: s.queue.filter((x) => x.id !== p.id),
                }))
              }
            >
              <X size={15} /> Quitar
            </button>
          </div>
        </div>
      ))}
      <button
        className="secondary full"
        disabled={
          busy || all.length * 2 + 2 > players.filter((p) => p.active).length
        }
        onClick={() =>
          setDraft((s) => ({ ...s, queue: [...s.queue, emptyPair()] }))
        }
      >
        <Plus size={17} /> Añadir pareja a la cola
      </button>
      {!draft.queue.length && (
        <p className="rule-note">
          Con solo dos parejas, la sesión se pausará tras el resultado hasta que
          entren nuevos rivales.
        </p>
      )}
      {initial && (
        <p className="rule-note">
          Guardar cambios sustituye la opción de deshacer el último resultado.
          Las partidas guardadas se conservan.
        </p>
      )}
      {(validation || error) && (
        <p role="alert" className="error">
          {validation || error}
        </p>
      )}
      <button
        className="primary full"
        disabled={busy}
        onClick={() => {
          const issue =
            courtError(draft, players) ||
            (!initial && (!draft.blue || !draft.red)
              ? "Configura las dos parejas iniciales."
              : "");
          setValidation(issue || "");
          if (!issue) onSave(draft);
        }}
      >
        {busy
          ? "Guardando…"
          : initial
            ? "Guardar parejas y cola"
            : "Empezar sesión"}
      </button>
    </Modal>
  );
}
