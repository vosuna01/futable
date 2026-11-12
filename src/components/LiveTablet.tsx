import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  LogOut,
  Maximize,
  Minus,
  Play,
  Plus,
  Radio,
  Target,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import type { useLiveSession } from "../data/useLiveSession";
import {
  goalsBy,
  goalsToWin,
  liveError,
  posts,
  queuePairs,
  type LiveState,
} from "../domain/live";
import type { Player, Position, Snapshot, Team } from "../domain/types";
import { teamNames } from "../domain/teams";
import { Avatar, Modal } from "./ui";
import { StartEditor } from "./LiveMatch";
import { PlayerPicker } from "./PlayerPicker";

const postNames = { defender: "Defensa", forward: "Delantero" } as const;
const shortPost = { defender: "DEF", forward: "DEL" } as const;
/** Madrid on the left and Barça on the right, as everywhere else. */
const shown = ["red", "blue"] as const;

/**
 * Wall tablet for the live match: big targets meant to be hit from a step away.
 * Every write is the same `live_session_command` the phone view and the
 * scoreboard firmware use, so all three stay in step.
 */
export function LiveTablet({
  live,
  data,
  demo,
  user,
  online,
  onExit,
}: {
  live: ReturnType<typeof useLiveSession>;
  data: Snapshot;
  demo: boolean;
  user: string;
  online: boolean;
  onExit: () => void;
}) {
  const { session } = live;
  const state: LiveState | null = session?.state ?? null;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState<Team | null>(null),
    [starting, setStarting] = useState(false),
    [adding, setAdding] = useState(false),
    [picking, setPicking] = useState(false),
    [editing, setEditing] = useState<{
      team: Team;
      revision: number;
      session: string;
      defender: string;
      forward: string;
    } | null>(null);
  const lock = useRef(false),
    attempt = useRef<{ key: string; id: string } | null>(null);
  const named = (id: string) => data.players.find((p) => p.id === id);
  const activeSeason = data.seasons.find((s) => s.status === "active");
  const sameSeason = !session || session.season_id === activeSeason?.id;
  // Goals to win: the session's choice, else the season's rule.
  const target = state ? goalsToWin(state, activeSeason?.target ?? 3) : 3;
  /** A team that has reached the target and leads: its win button lights up. */
  const reached = (team: Team) =>
    !!state?.court &&
    state.goals[team] >= target &&
    state.goals[team] > state.goals[team === "red" ? "blue" : "red"];
  const me = demo
    ? data.players[0]
    : data.players.find((p) => p.account_id && p.account_id === user);
  const signedUp =
    !!me &&
    !!state &&
    (state.queue.some((w) => w.id === me.id) ||
      (!!state.court &&
        Object.values(state.court).some(
          (side) => side.defender.id === me.id || side.forward.id === me.id,
        )));
  const canRun =
    (data.role === "admin" || data.role === "scoreboard" || signedUp) &&
    sameSeason;
  const invalid = state ? liveError(state, data.players) : null;
  const scored = state ? goalsBy(state) : {};
  // Before migration 008 the server keeps only the board, not the scorer.
  const scorersPending =
    !demo && !!state?.court && !Array.isArray(state.goal_log);
  const off = !online || busy || !canRun;

  // A wall screen must not dim mid-match.
  useEffect(() => {
    let lockScreen: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<typeof lockScreen> };
        };
        if (document.visibilityState === "visible" && nav.wakeLock)
          lockScreen = await nav.wakeLock.request("screen");
      } catch {
        // Not every browser allows it; the tablet's own settings still apply.
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lockScreen?.release().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const run = async (
    action: string,
    fields: Parameters<typeof live.command>[1],
    done?: string,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const key = JSON.stringify({ action, fields });
    if (!attempt.current || attempt.current.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    try {
      await live.command(action, fields, attempt.current.id);
      attempt.current = null;
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const fullScreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const court = state?.court ?? null;
  const editStale =
    !!editing &&
    (editing.session !== session?.id || editing.revision !== session?.revision);
  const editSide = editing && court ? court[editing.team] : null;
  const editOther =
    editing && court ? court[editing.team === "red" ? "blue" : "red"] : null;
  const editPlayers = data.players.filter(
    (p) =>
      p.active &&
      p.id !== editOther?.defender.id &&
      p.id !== editOther?.forward.id,
  );
  const editChanged =
    !!editing &&
    !!editSide &&
    (editing.defender !== editSide.defender.id ||
      editing.forward !== editSide.forward.id);
  const editMembersChanged =
    !!editing &&
    !!editSide &&
    ![editSide.defender.id, editSide.forward.id].every(
      (id) => id === editing.defender || id === editing.forward,
    );
  const pairs = state ? queuePairs(state.queue) : [];
  const onCourt = court
    ? shown.flatMap((t) => posts.map((p) => court[t][p].id))
    : [];
  const eligible = data.players.filter(
    (p) =>
      p.active &&
      !onCourt.includes(p.id) &&
      !(state?.queue ?? []).some((w) => w.id === p.id),
  );
  /** Flips who of a waiting pair defends: the first one's choice decides. */
  const flipPair = (pair: (typeof pairs)[number]) => {
    const first = state!.queue.find(
      (w) => w.id === pair.defender?.id || w.id === pair.forward?.id,
    )!;
    const now: Position =
      pair.defender?.id === first.id ? "defender" : "forward";
    void run(
      "prefer",
      { player: first.id, post: now === "defender" ? "forward" : "defender" },
      "Puestos de la pareja cambiados.",
    );
  };

  return (
    <div className="tablet" aria-label="Marcador de pared">
      <header className="tablet-bar">
        <span className="tablet-title">
          <Radio size={22} /> FutABLE · En directo
        </span>
        {state && (
          <button
            className="tablet-target"
            disabled={off}
            aria-label={`Partidas a ${target} goles. Cambiar`}
            onClick={() => setPicking(true)}
          >
            <Target size={20} /> A {target} goles
          </button>
        )}
        <span className={`connection ${online ? "" : "offline"}`}>
          <i />
          {demo ? "Demostración" : online ? "Conectado" : "Sin conexión"}
        </span>
        <button
          className="tablet-icon"
          onClick={fullScreen}
          aria-label="Pantalla completa"
        >
          <Maximize size={22} />
        </button>
        <button
          className="tablet-icon"
          onClick={onExit}
          aria-label="Salir del modo tablet"
        >
          <LogOut size={22} />
        </button>
      </header>

      {(error || live.error) && (
        <div role="alert" className="tablet-alert">
          {error || live.error}
          <button onClick={() => void live.refresh()}>Actualizar</button>
        </div>
      )}
      {notice && (
        <p role="status" className="tablet-notice">
          {notice}
        </p>
      )}
      {invalid && <p className="tablet-alert">{invalid}</p>}
      {!sameSeason && (
        <p className="tablet-alert">
          La sesión abierta es de otra temporada. Ciérrala desde el móvil.
        </p>
      )}
      {!canRun && session && sameSeason && (
        <p className="tablet-alert">
          Esta cuenta solo puede mirar. Inicia sesión con la cuenta de la tablet
          o con la de alguien fichado.
        </p>
      )}

      {live.loading ? (
        <p className="tablet-empty">Buscando la sesión…</p>
      ) : !session || !state ? (
        <div className="tablet-empty">
          <h1>No hay partida en directo.</h1>
          <p>Apunta al primero para abrir la sesión del día.</p>
          <button
            className="tablet-start"
            disabled={busy || !online || !activeSeason || !eligible.length}
            onClick={() => setAdding(true)}
          >
            <UserPlus size={26} /> Apuntar
          </button>
        </div>
      ) : (
        <>
          {court ? (
            <main className="tablet-court">
              {shown.map((team) => (
                <section
                  key={team}
                  className={`tablet-team ${team}`}
                  aria-label={teamNames[team]}
                >
                  <div className="tablet-team-head">
                    <h2>{teamNames[team]}</h2>
                    <div className="tablet-team-actions">
                      <button
                        className="tablet-swap"
                        aria-label="Intercambiar defensa y delantero"
                        disabled={off}
                        onClick={() =>
                          void run(
                            "assign",
                            {
                              team,
                              defender: court[team].forward.id,
                              forward: court[team].defender.id,
                            },
                            `${teamNames[team]}: puestos intercambiados.`,
                          )
                        }
                      >
                        <ArrowLeftRight size={20} /> Intercambiar
                      </button>
                      <button
                        className="tablet-swap"
                        aria-label={`Cambiar jugadores de ${teamNames[team]}`}
                        disabled={off}
                        onClick={() => {
                          setError("");
                          setEditing({
                            team,
                            revision: session.revision,
                            session: session.id,
                            defender: court[team].defender.id,
                            forward: court[team].forward.id,
                          });
                        }}
                      >
                        <UserPlus size={20} /> Jugadores
                      </button>
                    </div>
                    <strong
                      className="tablet-score"
                      aria-label={`Goles ${teamNames[team]}`}
                    >
                      {state.goals[team]}
                    </strong>
                  </div>
                  {posts.map((post) => {
                    const id = court[team][post].id;
                    const player = named(id);
                    return (
                      <div key={post} className="tablet-player">
                        <button
                          className="tablet-scorer"
                          disabled={off}
                          aria-label={`Gol de ${player?.name || "jugador"}`}
                          onClick={() =>
                            void run("goal", { team, delta: 1, player: id })
                          }
                        >
                          <Avatar
                            player={player || { name: "?", avatar_url: null }}
                          />
                          <span>
                            <small>{postNames[post]}</small>
                            <strong>{player?.name || "Libre"}</strong>
                          </span>
                          <b className="tablet-tally">
                            {scored[id] ? `⚽ ${scored[id]}` : "+ gol"}
                          </b>
                        </button>
                        <button
                          className="tablet-minus"
                          disabled={off || !scored[id]}
                          aria-label={`Quitar gol de ${player?.name || "jugador"}`}
                          onClick={() =>
                            void run("goal", { team, delta: -1, player: id })
                          }
                        >
                          <Minus size={22} />
                        </button>
                      </div>
                    );
                  })}
                  <div className="tablet-goal-row">
                    <button
                      className={`tablet-goal ${team}`}
                      disabled={off}
                      onClick={() => void run("goal", { team, delta: 1 })}
                    >
                      <Plus size={26} /> Gol {teamNames[team]}
                    </button>
                    <button
                      className="tablet-minus"
                      disabled={off || !state.goals[team]}
                      aria-label={`Anular gol de ${teamNames[team]}`}
                      onClick={() => void run("goal", { team, delta: -1 })}
                    >
                      <Minus size={26} />
                    </button>
                  </div>
                  <button
                    className={`tablet-win ${team} ${reached(team) ? "ready" : ""}`}
                    disabled={off || !!invalid}
                    onClick={() => setConfirm(team)}
                  >
                    <CheckCircle2 size={26} /> Gana {teamNames[team]}
                  </button>
                </section>
              ))}
            </main>
          ) : (
            <div className="tablet-empty">
              <h1>
                {state.queue.length >= 4
                  ? "Ya sois cuatro."
                  : `Faltan ${4 - state.queue.length} para empezar.`}
              </h1>
              <button
                className="tablet-start"
                disabled={off || state.queue.length < 4}
                onClick={() => setStarting(true)}
              >
                <Play size={26} /> Empezar partida
              </button>
            </div>
          )}

          {scorersPending && (
            <p className="tablet-hint">
              Los goles por jugador se guardarán cuando se aplique la migración
              008. Mientras, cuentan para el equipo.
            </p>
          )}

          <section className="tablet-queue" aria-label="Cola">
            <div className="tablet-queue-head">
              <h2>Cola · {state.queue.length} esperando</h2>
              {session.last_match && canRun && (
                <button
                  className="tablet-secondary"
                  disabled={busy || !online}
                  onClick={() =>
                    void run(
                      "undo",
                      {},
                      "Resultado anulado. La cola vuelve a como estaba.",
                    )
                  }
                >
                  <Undo2 size={20} /> Deshacer último resultado
                </button>
              )}
              <button
                className="tablet-secondary"
                disabled={busy || !online || !eligible.length}
                onClick={() => setAdding(true)}
              >
                <UserPlus size={20} /> Apuntar
              </button>
            </div>
            {pairs.length ? (
              <ol className="tablet-pairs">
                {pairs.map((pair, i) => (
                  <li
                    key={(pair.defender?.id || "") + (pair.forward?.id || "")}
                  >
                    <span className="tablet-turn">
                      {i === 0 ? "Entran" : `${i + 1}ª`}
                    </span>
                    {(["defender", "forward"] as const).map((post) => {
                      const w = pair[post];
                      return (
                        <span key={post} className="tablet-waiting">
                          <small>{shortPost[post]}</small>
                          {w ? (
                            <>
                              <strong>{named(w.id)?.name || "?"}</strong>
                              <button
                                className="tablet-x"
                                aria-label={`Quitar a ${named(w.id)?.name || "jugador"} de la cola`}
                                disabled={off}
                                onClick={() =>
                                  void run("leave", { player: w.id })
                                }
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <em>un perdedor</em>
                          )}
                        </span>
                      );
                    })}
                    <button
                      className="tablet-pair-swap"
                      disabled={off}
                      aria-label={`Cambiar puestos de la pareja ${i + 1}`}
                      onClick={() => flipPair(pair)}
                    >
                      <ArrowLeftRight size={20} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="tablet-muted">
                Nadie espera. Los perdedores vuelven a entrar.
              </p>
            )}
          </section>
        </>
      )}

      {editing && (
        <Modal
          title={`Cambiar jugadores de ${teamNames[editing.team]}`}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <form
            className="tablet-replace-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (off || editStale || !editChanged || !editSide) return;
              void run(
                editMembersChanged ? "replace" : "assign",
                {
                  team: editing.team,
                  defender: editing.defender,
                  forward: editing.forward,
                  expected_revision: editing.revision,
                },
                `${teamNames[editing.team]}: jugadores actualizados.`,
              ).then((saved) => {
                if (saved) setEditing(null);
              });
            }}
          >
            {posts.map((post) => (
              <label key={post}>
                {postNames[post]}
                <select
                  value={editing[post]}
                  disabled={off || editStale}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditing((current) =>
                      current ? { ...current, [post]: value } : null,
                    );
                  }}
                >
                  {editPlayers.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={
                        p.id ===
                        editing[post === "defender" ? "forward" : "defender"]
                      }
                    >
                      {p.name}
                      {state?.queue.some((w) => w.id === p.id)
                        ? " · En la cola"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <p className="tablet-replace-note">
              {editMembersChanged
                ? "El marcador vuelve a 0–0 y se borran los goles de esta partida sin guardar un resultado. Quienes salen vuelven a la cola; el otro equipo se mantiene."
                : "Si solo intercambias los puestos, se conservan los goles. Al sustituir jugadores por otras personas, el marcador vuelve a 0–0 y quienes salen vuelven a la cola."}
            </p>
            {editStale && (
              <p role="alert">
                La sesión ha cambiado. Cierra este diálogo y vuelve a abrirlo
                para revisar la pareja actual.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={
                  off ||
                  editStale ||
                  !editChanged ||
                  ![editing.defender, editing.forward].every((id) =>
                    editPlayers.some((p) => p.id === id),
                  ) ||
                  editing.defender === editing.forward
                }
              >
                Guardar pareja
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && state?.court && (
        <Modal
          title={`¿Gana ${teamNames[confirm]}?`}
          onClose={() => setConfirm(null)}
        >
          <p className="tablet-confirm-score">
            Madrid {state.goals.red} · {state.goals.blue} Barça
          </p>
          <div className="modal-actions">
            <button className="text-button" onClick={() => setConfirm(null)}>
              Cancelar
            </button>
            <button
              className="primary"
              disabled={busy || !online}
              onClick={() => {
                const winner = confirm;
                setConfirm(null);
                void run(
                  "result",
                  { winner },
                  `Gana ${teamNames[winner]}. Entra la siguiente pareja.`,
                );
              }}
            >
              Guardar resultado
            </button>
          </div>
        </Modal>
      )}
      {starting && state && (
        <StartEditor
          queue={state.queue}
          players={data.players}
          busy={busy}
          onClose={() => setStarting(false)}
          onStart={(lineup) => {
            setStarting(false);
            void run("start", { lineup }, "Partida en marcha.");
          }}
        />
      )}
      {picking && state && (
        <Modal title="¿A cuántos goles?" onClose={() => setPicking(false)}>
          <p className="rule-note">
            Vale para esta partida y las siguientes de hoy. Sin elegir, manda la
            temporada ({activeSeason?.target ?? 3}).
          </p>
          <div className="tablet-target-grid">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((goals) => (
              <button
                key={goals}
                className={goals === target ? "selected" : ""}
                aria-pressed={goals === target}
                disabled={busy || !online}
                onClick={() => {
                  setPicking(false);
                  void run(
                    "target",
                    { goals },
                    `Partidas a ${goals} ${goals === 1 ? "gol" : "goles"}.`,
                  );
                }}
              >
                {goals}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {adding && (
        <Modal title="Apuntar a la cola" onClose={() => setAdding(false)}>
          <PlayerPicker
            players={eligible}
            disabled={busy || !online}
            onPick={(id) => {
              setAdding(false);
              void run(
                "join",
                { players: [id] },
                `${named(id)?.name ?? "Jugador"} a la cola.`,
              );
            }}
          />
        </Modal>
      )}
    </div>
  );
}
